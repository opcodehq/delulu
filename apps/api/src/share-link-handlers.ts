import { Api } from "@delulu/contracts";
import { type AuthContext, CurrentAuth } from "@delulu/core";
import {
  RateLimiterService,
  ShareLinkService,
  type ShareViewer,
  WorkspaceAccessService,
} from "@delulu/services";
import { Effect, Layer } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AuthenticationLive } from "./auth-middleware";

/**
 * Comment throttling. Each commenter gets 20/min on a link so one person
 * can't drain the shared 300/min link budget for every other reviewer.
 * Guests are identified by Cloudflare's `cf-connecting-ip`, which Cloudflare
 * sets itself; without it (e.g. self-hosted Node) only the link ceiling applies.
 */
const PER_COMMENTER = { kind: "api", perMinute: 20 } as const;
const linkRateKey = (token: string) => `share-comment:${token}`;
const commenterRateKey = (token: string, commenter: string) =>
  `share-comment:${token}:${commenter}`;
const cloudflareClientIp = (request: HttpServerRequest.HttpServerRequest) => {
  const ip = request.headers["cf-connecting-ip"];
  return typeof ip === "string" && ip.length > 0 ? ip : null;
};

export const ShareLinksHandlers = HttpApiBuilder.group(
  Api,
  "shareLinks",
  Effect.fnUntraced(function* (handlers) {
    const shares = yield* ShareLinkService;
    const workspaces = yield* WorkspaceAccessService;
    const limiter = yield* RateLimiterService;

    const viewerFor = (auth: AuthContext): ShareViewer => ({
      userId: auth.userId,
      authorize: (workspaceId) =>
        workspaces.require({ workspaceId, auth, scope: "posts:read" }),
    });

    return handlers
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "posts:read",
          });
          return yield* shares.get(access.workspaceId, params.postId);
        })
      )
      .handle("create", ({ params, payload }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "posts:write",
          });
          return yield* shares.create({
            workspaceId: access.workspaceId,
            postId: params.postId,
            memberId: access.memberId,
            access: payload.access,
          });
        })
      )
      .handle("update", ({ params, payload }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "posts:write",
          });
          return yield* shares.update({
            workspaceId: access.workspaceId,
            postId: params.postId,
            access: payload.access,
            renew: payload.renew,
          });
        })
      )
      .handle("revoke", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "posts:write",
          });
          return yield* shares.revoke(access.workspaceId, params.postId);
        })
      )
      .handle("comments", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          const access = yield* workspaces.require({
            workspaceId: params.workspaceId,
            auth,
            scope: "posts:read",
          });
          return yield* shares.comments(access.workspaceId, params.postId);
        })
      )
      .handle("view", ({ params }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          return yield* shares.view(params.token, viewerFor(auth)).pipe(
            // Members-only links reject anonymous viewers; a signed-in caller
            // never reaches that branch.
            Effect.catchTag("UnauthorizedError", (error) => Effect.die(error))
          );
        })
      )
      .handle("comment", ({ params, payload }) =>
        Effect.gen(function* () {
          const auth = yield* CurrentAuth;
          yield* limiter.limit(
            commenterRateKey(params.token, `user:${auth.userId}`),
            PER_COMMENTER
          );
          yield* limiter.limit(linkRateKey(params.token), { kind: "session" });
          return yield* shares
            .comment({
              token: params.token,
              viewer: viewerFor(auth),
              body: payload.body,
            })
            .pipe(
              Effect.catchTag("UnauthorizedError", (error) => Effect.die(error))
            );
        })
      );
  })
).pipe(Layer.provide(AuthenticationLive));

export const PublicSharesHandlers = HttpApiBuilder.group(
  Api,
  "publicShares",
  Effect.fnUntraced(function* (handlers) {
    const shares = yield* ShareLinkService;
    const limiter = yield* RateLimiterService;
    return handlers
      .handle("view", ({ params }) => shares.view(params.token, null))
      .handle("comment", ({ params, payload, request }) =>
        Effect.gen(function* () {
          const ip = cloudflareClientIp(request);
          if (ip) {
            yield* limiter.limit(
              commenterRateKey(params.token, `ip:${ip}`),
              PER_COMMENTER
            );
          }
          yield* limiter.limit(linkRateKey(params.token), { kind: "session" });
          return yield* shares.comment({
            token: params.token,
            viewer: null,
            authorName: payload.authorName,
            body: payload.body,
          });
        })
      );
  })
);
