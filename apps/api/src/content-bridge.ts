import { PostWrite } from "@delulu/contracts";
import { WorkspaceId } from "@delulu/core";
import { PostService } from "@delulu/services";
import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { makeBaseLayer } from "./base-layer";
import { parseChannelGrant } from "./channel-grant";
import {
  assertContentReceiptOwner,
  prepareContentWrite,
} from "./content-action-policy";
import type { Env } from "./env";
export type ContentAction =
  | {
      readonly kind: "remember";
      readonly workspaceId: string;
      readonly value: unknown;
    }
  | {
      readonly kind: "forget_memory";
      readonly workspaceId: string;
      readonly memoryId: string;
    }
  | {
      readonly kind: "create_draft";
      readonly workspaceId: string;
      readonly value: unknown;
    }
  | {
      readonly kind: "update_draft";
      readonly workspaceId: string;
      readonly postId: string;
      readonly value: unknown;
    }
  | {
      readonly kind: "schedule";
      readonly workspaceId: string;
      readonly postId: string;
      readonly value: unknown;
    }
  | {
      readonly kind: "publish";
      readonly workspaceId: string;
      readonly postId: string;
    };

/** Tenant-authorized capability used only by the Content Gatekeeper binding. */
const requireChannelGrant = Effect.fn("requireChannelGrant")(function* (
  callerEmail: string,
  workspaceId: string,
  grant: string
) {
  const { id, generation } = parseChannelGrant(grant);
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`SELECT c.id FROM agent_channel_identities c
    JOIN users u ON u.id = c.user_id
    JOIN agent_beta_invites i ON i.user_id = u.id AND i.revoked_at IS NULL
    JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = c.workspace_id
    JOIN workspaces w ON w.id = c.workspace_id AND w.deleted_at IS NULL
    WHERE c.id = ${id} AND c.generation = ${generation}
      AND c.workspace_id = ${workspaceId} AND c.disconnected_at IS NULL
      AND lower(u.email) = ${callerEmail.trim().toLowerCase()}
      AND u.identity_deleted_at IS NULL`;
  if (!rows[0]) {
    throw new Error("Channel access revoked");
  }
});

export class ContentBridge {
  private readonly env: Env;
  constructor(env: Env) {
    this.env = env;
  }
  async getContentContext(input: {
    readonly callerEmail: string;
    readonly workspaceId: string;
    readonly channelGrant: string;
  }) {
    const program = Effect.gen(function* () {
      yield* requireChannelGrant(
        input.callerEmail,
        input.workspaceId,
        input.channelGrant
      );
      const sql = yield* SqlClient.SqlClient;
      const posts = yield* PostService;
      const workspaceId = yield* Schema.decodeUnknownEffect(WorkspaceId)(
        input.workspaceId
      );
      const members = yield* sql<{
        userId: string;
        memberId: string;
        role: "owner" | "admin" | "editor" | "viewer";
        workspaceName: string;
      }>`SELECT u.id AS user_id, wm.id AS member_id, wm.role, w.name AS workspace_name
          FROM users u
          JOIN workspace_members wm ON wm.user_id = u.id
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE lower(u.email) = ${input.callerEmail.trim().toLowerCase()}
            AND wm.workspace_id = ${input.workspaceId}
            AND u.identity_deleted_at IS NULL LIMIT 1`;
      const member = members[0];
      if (!member) {
        throw new Error("Content HQ workspace access denied");
      }
      const [connections, memories, files, recentPosts] = yield* Effect.all([
        sql<Record<string, unknown>>`SELECT id, platform, username, display_name
          FROM connections WHERE workspace_id = ${input.workspaceId}
          ORDER BY created_at DESC`,
        sql<Record<string, unknown>>`SELECT id, category, value, provenance,
          confidence, status, requires_confirmation, updated_at
          FROM agent_memories WHERE (workspace_id = ${input.workspaceId} OR scope = 'personal')
            AND user_id = ${member.userId}
            AND status = 'confirmed' ORDER BY updated_at DESC LIMIT 100`,
        sql<Record<string, unknown>>`SELECT wf.id, wf.filename, wf.logical_path,
          wfv.mime_type, COALESCE(wfv.size_bytes, 0)::text AS size_bytes
          FROM workspace_files wf LEFT JOIN workspace_file_versions wfv
            ON wfv.id = wf.current_version_id
          WHERE wf.workspace_id = ${input.workspaceId} AND wf.deleted_at IS NULL
            AND (wf.visibility = 'workspace' OR wf.owner_user_id = ${member.userId})
            AND wf.status = 'available' ORDER BY wf.updated_at DESC LIMIT 100`,
        posts.list({
          workspaceId,
          limit: 50,
          offset: 0,
        }),
      ]);
      return {
        workspace: {
          id: input.workspaceId,
          name: member.workspaceName,
          role: member.role,
        },
        connections: connections.map((connection) => ({
          id: String(connection.id),
          platform: String(connection.platform),
          username:
            connection.username == null ? null : String(connection.username),
          displayName:
            connection.displayName == null
              ? null
              : String(connection.displayName),
        })),
        recentPosts: recentPosts.data,
        memories,
        files: files.map((file) => ({
          id: String(file.id),
          filename: String(file.filename),
          logicalPath: String(file.logicalPath),
          mimeType: file.mimeType == null ? null : String(file.mimeType),
          sizeBytes: String(file.sizeBytes),
        })),
      };
    });
    return Effect.runPromise(
      program.pipe(Effect.provide(makeBaseLayer(this.env)))
    );
  }

  async executeContentAction(input: {
    readonly callerEmail: string;
    readonly channelGrant: string;
    readonly action: ContentAction;
    readonly idempotencyKey: string;
  }) {
    const program = Effect.gen(function* () {
      yield* requireChannelGrant(
        input.callerEmail,
        input.action.workspaceId,
        input.channelGrant
      );
      const sql = yield* SqlClient.SqlClient;
      const posts = yield* PostService;
      const workspaceId = yield* Schema.decodeUnknownEffect(WorkspaceId)(
        input.action.workspaceId
      );
      const members = yield* sql<{
        memberId: string;
        userId: string;
        agentWorkspaceId: string;
        role: "owner" | "admin" | "editor" | "viewer";
      }>`SELECT wm.id AS member_id, wm.role, u.id AS user_id, aw.id AS agent_workspace_id FROM users u
          JOIN workspace_members wm ON wm.user_id = u.id
          JOIN agent_workspaces aw ON aw.user_id = u.id AND aw.workspace_id = wm.workspace_id
          WHERE lower(u.email) = ${input.callerEmail.trim().toLowerCase()}
            AND wm.workspace_id = ${input.action.workspaceId}
            AND aw.state = 'active' AND aw.deleted_at IS NULL
            AND aw.external_writes_enabled = true
            AND u.identity_deleted_at IS NULL LIMIT 1`;
      const actor = members[0];
      if (!actor || actor.role === "viewer") {
        throw new Error("Content HQ write access denied");
      }
      const receiptOwner = {
        callerEmail: input.callerEmail.trim().toLowerCase(),
        workspaceId: input.action.workspaceId,
        actionKind: input.action.kind,
      };
      // An interrupted execution may already have committed its effect. Only a
      // confirmed failure can retry; stale executing receipts need reconciliation.
      const claimed = yield* sql<{
        idempotencyKey: string;
      }>`INSERT INTO agent_external_effects
        (idempotency_key, caller_email, workspace_id, action_kind, status)
        VALUES (${input.idempotencyKey}, ${receiptOwner.callerEmail},
          ${input.action.workspaceId}, ${input.action.kind}, 'executing')
        ON CONFLICT (idempotency_key) DO UPDATE SET
          status = 'executing', error = NULL, started_at = now()
        WHERE agent_external_effects.caller_email = EXCLUDED.caller_email
          AND agent_external_effects.workspace_id = EXCLUDED.workspace_id
          AND agent_external_effects.action_kind = EXCLUDED.action_kind
          AND agent_external_effects.status = 'failed'
        RETURNING idempotency_key`;
      if (!claimed[0]) {
        const existing = yield* sql<{
          status: string;
          result: unknown;
          callerEmail: string;
          workspaceId: string;
          actionKind: string;
        }>`SELECT status, result, caller_email, workspace_id, action_kind
          FROM agent_external_effects WHERE idempotency_key = ${input.idempotencyKey}`;
        if (existing[0]) {
          assertContentReceiptOwner(existing[0], receiptOwner);
        }
        if (existing[0]?.status === "completed") {
          return existing[0].result;
        }
        throw new Error("Content action is already executing");
      }

      const postActor = { memberId: actor.memberId, role: actor.role };
      const execution = yield* Effect.gen(function* () {
        if (input.action.kind === "remember") {
          const memory = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              category: Schema.Literals([
                "preference",
                "voice",
                "brand_fact",
                "goal",
              ]),
              text: Schema.String,
              scope: Schema.Literals(["personal", "workspace"]),
            })
          )(input.action.value);
          if (
            !memory.text.trim() ||
            memory.text.length > 2000 ||
            (memory.scope === "personal" && memory.category === "brand_fact")
          ) {
            throw new Error("Invalid memory proposal");
          }
          const id = crypto.randomUUID();
          yield* sql`INSERT INTO agent_memories (id, agent_workspace_id, user_id, workspace_id, category, value, provenance, confidence, status, requires_confirmation, confirmed_at, scope)
            VALUES (${id}, ${actor.agentWorkspaceId}, ${actor.userId}, ${workspaceId}, ${memory.category}, ${JSON.stringify(memory.text)}::jsonb,
              ${`approved-action:${input.idempotencyKey}`}, 1, 'confirmed', true, now(), ${memory.scope})`;
          return { memoryId: id };
        }
        if (input.action.kind === "forget_memory") {
          yield* sql`UPDATE agent_memories SET status = 'rejected', updated_at = now() WHERE id = ${input.action.memoryId}
            AND user_id = ${actor.userId} AND (workspace_id = ${workspaceId} OR scope = 'personal')`;
          return { forgotten: true };
        }
        if (input.action.kind === "publish") {
          return yield* posts.publishNow({
            workspaceId,
            postId: input.action.postId,
            actor: postActor,
          });
        }
        const decoded = yield* Schema.decodeUnknownEffect(PostWrite)(
          input.action.value
        );
        const value = prepareContentWrite(
          input.action.kind,
          decoded,
          input.idempotencyKey
        );
        return input.action.kind === "create_draft"
          ? yield* posts.create({
              workspaceId,
              actor: postActor,
              value,
            })
          : yield* posts.update({
              workspaceId,
              postId: input.action.postId,
              actor: postActor,
              value,
            });
      }).pipe(Effect.result);
      if (execution._tag === "Failure") {
        yield* sql`UPDATE agent_external_effects SET status = 'failed'
          WHERE idempotency_key = ${input.idempotencyKey}`;
        return yield* Effect.fail(execution.failure);
      }
      yield* sql`UPDATE agent_external_effects SET status = 'completed',
        result = ${JSON.stringify(execution.success)}::jsonb, completed_at = now()
        WHERE idempotency_key = ${input.idempotencyKey}`;
      return execution.success;
    });
    return Effect.runPromise(
      program.pipe(Effect.provide(makeBaseLayer(this.env)))
    );
  }
}
