import { Api, ConflictError, ForbiddenError } from "@delulu/contracts";
import { CurrentAuth } from "@delulu/core";
import {
  AgentChannelService,
  ChannelLinkGateway,
  ClerkAdminConfig,
  deleteInstructionSkill,
  listInstructionSkills,
  saveInstructionSkill,
} from "@delulu/services";
import { Effect, Layer, Schema } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { AuthenticationLive } from "./auth-middleware";

const LINK_CHALLENGE = /^[1-9]\d{0,15}\.[a-f0-9]{64}$/;
const ClerkUser = Schema.Struct({
  email_addresses: Schema.Array(
    Schema.Struct({
      email_address: Schema.String,
      verification: Schema.NullOr(Schema.Struct({ status: Schema.String })),
    })
  ),
});

export const AgentChannelHandlers = HttpApiBuilder.group(
  Api,
  "agentChannels",
  Effect.fnUntraced(function* (handlers) {
    const channels = yield* AgentChannelService;
    const gateway = yield* ChannelLinkGateway;
    const sql = yield* SqlClient.SqlClient;
    const clerk = yield* ClerkAdminConfig;
    const session = Effect.gen(function* () {
      const auth = yield* CurrentAuth;
      if (auth.credential !== "session") {
        return yield* new ForbiddenError({
          message: "Sign in to Delulu to connect Telegram",
        });
      }
      return auth;
    });
    return handlers
      .handle("skills", ({ params }) =>
        Effect.gen(function* () {
          return yield* listInstructionSkills(
            (yield* session).userId,
            params.workspaceId
          );
        })
      )
      .handle("saveSkill", ({ params, payload }) =>
        Effect.gen(function* () {
          return yield* saveInstructionSkill(
            (yield* session).userId,
            params.workspaceId,
            payload
          );
        })
      )
      .handle("deleteSkill", ({ params }) =>
        Effect.gen(function* () {
          yield* deleteInstructionSkill(
            (yield* session).userId,
            params.workspaceId,
            params.id
          );
          return { deleted: true };
        })
      )
      .handle("workspaces", () =>
        Effect.gen(function* () {
          return yield* channels.eligible((yield* session).userId);
        })
      )
      .handle("confirm", ({ payload }) =>
        Effect.gen(function* () {
          const auth = yield* session;
          if (!LINK_CHALLENGE.test(payload.challenge)) {
            return yield* new ConflictError({
              message: "Invalid connection link",
              resource: "agent-channel",
            });
          }
          if (
            !(yield* channels.eligible(auth.userId)).some(
              (w) => w.workspaceId === payload.workspaceId
            )
          ) {
            return yield* new ForbiddenError({
              message: "This workspace is not eligible for the agent beta",
            });
          }
          const users = yield* sql<{
            externalId: string;
            email: string;
          }>`SELECT external_id, email FROM users
        WHERE id = ${auth.userId} AND email IS NOT NULL AND identity_deleted_at IS NULL`.pipe(
            Effect.orDie
          );
          const user = users[0];
          if (!(user && clerk.secretKey)) {
            return yield* new ConflictError({
              message: "Email verification is unavailable",
              resource: "agent-channel",
            });
          }
          const profile = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(
                `https://api.clerk.com/v1/users/${encodeURIComponent(user.externalId)}`,
                {
                  headers: { authorization: `Bearer ${clerk.secretKey}` },
                  signal: AbortSignal.timeout(10_000),
                }
              );
              if (!response.ok) {
                throw new Error("Verification unavailable");
              }
              return response.json();
            },
            catch: () =>
              new ConflictError({
                message: "Email verification is unavailable",
                resource: "agent-channel",
              }),
          });
          const parsed = yield* Schema.decodeUnknownEffect(ClerkUser)(
            profile
          ).pipe(
            Effect.mapError(
              () =>
                new ConflictError({
                  message: "Email verification is unavailable",
                  resource: "agent-channel",
                })
            )
          );
          const email = user.email.trim().toLowerCase();
          if (
            !parsed.email_addresses.some(
              (e) =>
                e.email_address.toLowerCase() === email &&
                e.verification?.status === "verified"
            )
          ) {
            return yield* new ForbiddenError({
              message: "Verify your Delulu email before connecting Telegram",
            });
          }
          yield* gateway.offer({
            challenge: payload.challenge,
            candidate: {
              userId: auth.userId,
              workspaceId: payload.workspaceId,
              verifiedEmail: email,
            },
          });
          return { pendingConfirmation: true };
        })
      );
  })
).pipe(Layer.provide(AuthenticationLive));
