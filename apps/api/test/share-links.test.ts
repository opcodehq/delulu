import { generateKeyPairSync } from "node:crypto";
import {
  Connection,
  ConnectionId,
  makeConnectionRepository,
  makeId,
  PostGroupId,
  type WorkspaceId,
} from "@delulu/core";
import {
  IdentityService,
  MembershipService,
  PostService,
  ShareLinkService,
} from "@delulu/services";
import { Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildWebHandler } from "../src/app";
import { makeBaseLayer } from "../src/base-layer";
import type { Env } from "../src/env";

const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://delulu:delulu@localhost:5432/delulu",
  ENCRYPTION_SECRET: "integration-encryption-secret",
  APP_BASE_URL: "http://localhost:3000",
  // Throwaway key: the OAuth issuer is wired into every request's layer.
  AS_SIGNING_KEY: generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
} as unknown as Env;
const base = makeBaseLayer(env);
const { handler, dispose } = buildWebHandler(base);
const call = (path: string, init?: RequestInit) =>
  (handler as unknown as (request: Request) => Promise<Response>)(
    new Request(`http://api.test${path}`, init)
  );

let token = "";
let workspaceId = "";
let postId = "";

beforeAll(async () => {
  const seeded = await Effect.runPromise(
    Effect.gen(function* () {
      const identity = yield* IdentityService;
      const memberships = yield* MembershipService;
      const posts = yield* PostService;
      const shares = yield* ShareLinkService;
      const resolved = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const workspace = resolved.personalWorkspace?.id as WorkspaceId;
      const member = Option.getOrThrow(
        yield* memberships.resolve({
          workspaceId: workspace,
          userId: resolved.user.id,
        })
      );
      const connection = yield* (yield* makeConnectionRepository()).insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId: workspace,
          platform: "TWITTER",
          profileId: crypto.randomUUID(),
          username: "studio",
          displayName: "Studio",
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const groupId = makeId(PostGroupId);
      const post = yield* posts.create({
        workspaceId: workspace,
        actor: { memberId: member.memberId, role: member.role },
        value: {
          groups: [
            {
              id: groupId,
              isDefault: true,
              segments: [{ text: "Launch thread", media: [] }],
            },
          ],
          targets: [
            {
              connectionId: connection.id,
              groupId,
              settings: {
                platform: "TWITTER",
                values: { replyRestriction: "everyone" },
              },
              scheduledAt: null,
            },
          ],
          intent: "draft",
        },
      });
      const link = yield* shares.create({
        workspaceId: workspace,
        postId: post.id,
        memberId: member.memberId,
        access: "anyone",
      });
      return { token: link.token, workspaceId: workspace, postId: post.id };
    }).pipe(Effect.provide(base))
  );
  ({ token, workspaceId, postId } = seeded);
});

afterAll(() => dispose());

describe("share link HTTP routes", () => {
  it("serves anyone-links without credentials", async () => {
    const response = await call(`/v1/public/shares/${token}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.channels[0]).toMatchObject({
      platform: "TWITTER",
      displayName: "Studio",
      segments: [{ text: "Launch thread", media: [] }],
    });
  });

  it("accepts a guest comment and validates its fields", async () => {
    const post = (payload: unknown) =>
      call(`/v1/public/shares/${token}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    const ok = await post({ authorName: "Priya", body: "Looks great" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ authorName: "Priya" });
    expect((await post({ authorName: "", body: "x" })).status).toBe(400);
    expect(
      (await post({ authorName: "Priya", body: "a".repeat(2001) })).status
    ).toBe(400);
  });

  it("maps unknown, expired, and members-only links to clear statuses", async () => {
    expect((await call("/v1/public/shares/unknown-token")).status).toBe(404);

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE post_share_links SET access = 'workspace'
          WHERE post_id = ${postId} AND revoked_at IS NULL`;
      }).pipe(Effect.provide(base))
    );
    const membersOnly = await call(`/v1/public/shares/${token}`);
    expect(membersOnly.status).toBe(401);
    expect((await membersOnly.json()).error.code).toBe("UnauthorizedError");

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE post_share_links SET expires_at = now() - interval '1 minute'
          WHERE post_id = ${postId} AND revoked_at IS NULL`;
      }).pipe(Effect.provide(base))
    );
    const expired = await call(`/v1/public/shares/${token}`);
    expect(expired.status).toBe(410);
    expect((await expired.json()).error.code).toBe("ShareLinkExpiredError");
  });

  it("keeps member management and signed-in viewing behind authentication", async () => {
    expect(
      (await call(`/v1/workspaces/${workspaceId}/posts/${postId}/share`)).status
    ).toBe(401);
    expect((await call(`/v1/shares/${token}`)).status).toBe(401);
  });
});
