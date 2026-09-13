import { ConflictError, ForbiddenError } from "@delulu/contracts";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

export interface ChannelPrincipal {
  id: string;
  userId: string;
  workspaceId: string;
  verifiedEmail: string;
  generation: string;
}
export interface ChannelAddress {
  environment: string;
  channel: "telegram" | "whatsapp";
  providerAccountId: string;
  providerUserId: string;
}
export interface ChannelWorkspace {
  workspaceId: string;
  name: string;
}
type Denied = ForbiddenError | ConflictError;
const denied = () =>
  new ForbiddenError({
    message: "Agent beta access or workspace membership is unavailable",
  });

/** No message, webhook, or delivery payloads are accepted by this service. */
export class AgentChannelService extends Context.Service<
  AgentChannelService,
  {
    eligible(
      userId: string
    ): Effect.Effect<readonly ChannelWorkspace[], Denied>;
    resolve(
      address: ChannelAddress
    ): Effect.Effect<ChannelPrincipal | null, Denied>;
    connect(
      input: ChannelAddress & {
        userId: string;
        workspaceId: string;
        verifiedEmail: string;
        generation: string;
      }
    ): Effect.Effect<ChannelPrincipal, Denied>;
    disconnect(
      address: ChannelAddress,
      userId: string
    ): Effect.Effect<void, Denied>;
    select(
      address: ChannelAddress,
      userId: string,
      workspaceId: string
    ): Effect.Effect<ChannelPrincipal, Denied>;
  }
>()("@delulu/services/AgentChannelService") {
  static readonly layer = Layer.effect(
    AgentChannelService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const eligible = Effect.fn("AgentChannelService.eligible")(function* (
        userId: string
      ) {
        return yield* sql<ChannelWorkspace>`SELECT wm.workspace_id, w.name
        FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
        JOIN users u ON u.id = wm.user_id
        JOIN agent_beta_invites i ON i.user_id = u.id AND i.revoked_at IS NULL
        WHERE wm.user_id = ${userId} AND w.deleted_at IS NULL
          AND u.identity_deleted_at IS NULL AND u.email IS NOT NULL
        ORDER BY w.name, w.id`.pipe(Effect.orDie);
      });
      const requireWorkspace = Effect.fn(
        "AgentChannelService.requireWorkspace"
      )(function* (userId: string, workspaceId: string) {
        if (
          !(yield* eligible(userId)).some((w) => w.workspaceId === workspaceId)
        ) {
          return yield* denied();
        }
      });
      const find = (a: ChannelAddress) =>
        sql<ChannelPrincipal>`SELECT id, user_id, workspace_id, verified_email, generation
      FROM agent_channel_identities WHERE environment = ${a.environment} AND channel = ${a.channel}
        AND provider_account_id = ${a.providerAccountId} AND provider_user_id = ${a.providerUserId}
        AND disconnected_at IS NULL`.pipe(Effect.orDie);
      const resolve = Effect.fn("AgentChannelService.resolve")(function* (
        address: ChannelAddress
      ) {
        const principal = (yield* find(address))[0];
        if (!principal) {
          return null;
        }
        yield* requireWorkspace(principal.userId, principal.workspaceId);
        const users =
          yield* sql`SELECT id FROM users WHERE id = ${principal.userId}
        AND lower(email) = ${principal.verifiedEmail} AND identity_deleted_at IS NULL`.pipe(
            Effect.orDie
          );
        if (!users[0]) {
          return yield* denied();
        }
        return principal;
      });
      const connect = Effect.fn("AgentChannelService.connect")(function* (
        input: ChannelAddress & {
          userId: string;
          workspaceId: string;
          verifiedEmail: string;
          generation: string;
        }
      ) {
        yield* requireWorkspace(input.userId, input.workspaceId);
        const matchingUser = yield* sql`SELECT id FROM users
          WHERE id = ${input.userId} AND lower(email) = ${input.verifiedEmail}
            AND identity_deleted_at IS NULL`.pipe(Effect.orDie);
        if (!matchingUser[0]) {
          return yield* denied();
        }
        const rows =
          yield* sql<ChannelPrincipal>`INSERT INTO agent_channel_identities
        (id, environment, channel, provider_account_id, provider_user_id, user_id, workspace_id, verified_email, generation)
        VALUES (${crypto.randomUUID()}, ${input.environment}, ${input.channel}, ${input.providerAccountId},
          ${input.providerUserId}, ${input.userId}, ${input.workspaceId}, ${input.verifiedEmail}, ${input.generation})
        ON CONFLICT (environment, channel, provider_account_id, provider_user_id) DO UPDATE SET
          user_id = EXCLUDED.user_id, workspace_id = EXCLUDED.workspace_id,
          verified_email = EXCLUDED.verified_email, generation = EXCLUDED.generation,
          connected_at = now(), disconnected_at = NULL
        WHERE agent_channel_identities.disconnected_at IS NOT NULL
          OR (agent_channel_identities.user_id = EXCLUDED.user_id
            AND agent_channel_identities.generation = EXCLUDED.generation)
        RETURNING id, user_id, workspace_id, verified_email, generation`.pipe(
            Effect.orDie
          );
        if (!rows[0]) {
          return yield* new ConflictError({
            message: "Disconnect the current account before connecting another",
            resource: "agent-channel",
          });
        }
        return rows[0];
      });
      const disconnect = Effect.fn("AgentChannelService.disconnect")(function* (
        a: ChannelAddress,
        userId: string
      ) {
        yield* sql`UPDATE agent_channel_identities SET disconnected_at = now()
        WHERE environment = ${a.environment} AND channel = ${a.channel}
          AND provider_account_id = ${a.providerAccountId} AND provider_user_id = ${a.providerUserId}
          AND user_id = ${userId} AND disconnected_at IS NULL`.pipe(
          Effect.orDie
        );
      });
      const select = Effect.fn("AgentChannelService.select")(function* (
        a: ChannelAddress,
        userId: string,
        workspaceId: string
      ) {
        yield* requireWorkspace(userId, workspaceId);
        const rows =
          yield* sql<ChannelPrincipal>`UPDATE agent_channel_identities SET workspace_id = ${workspaceId}
        WHERE environment = ${a.environment} AND channel = ${a.channel}
          AND provider_account_id = ${a.providerAccountId} AND provider_user_id = ${a.providerUserId}
          AND user_id = ${userId} AND disconnected_at IS NULL
        RETURNING id, user_id, workspace_id, verified_email, generation`.pipe(
            Effect.orDie
          );
        if (!rows[0]) {
          return yield* denied();
        }
        return rows[0];
      });
      return AgentChannelService.of({
        eligible,
        resolve,
        connect,
        disconnect,
        select,
      });
    })
  );
}

export interface ChannelLinkCandidate {
  userId: string;
  workspaceId: string;
  verifiedEmail: string;
}
export interface ChannelLinkOffer {
  challenge: string;
  candidate: ChannelLinkCandidate;
}
export class ChannelLinkGateway extends Context.Service<
  ChannelLinkGateway,
  {
    offer(input: ChannelLinkOffer): Effect.Effect<void, ConflictError>;
  }
>()("@delulu/services/ChannelLinkGateway") {}
