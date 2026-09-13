import { WorkerEntrypoint } from "cloudflare:workers";
import { PostWrite } from "@delulu/contracts";
import { WorkspaceId } from "@delulu/core";
import {
  AgentWorkspaceService,
  JobIntent,
  PostService,
} from "@delulu/services";
import { Effect, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { buildWebHandler } from "./app";
import {
  assertContentReceiptOwner,
  prepareContentWrite,
} from "./content-action-policy";
import { DurableJobObject, type JobState } from "./durable-job";
import { appOrigins, type Env, type ExecutionContext } from "./env";
import { executeJob, failJob } from "./execute-job";
import { makeJobRuntime, sendIntent } from "./job-runtime";
import { maintenanceResponse, runMaintenance } from "./maintenance";
import { handleProviderIngress } from "./provider-ingress";

export {
  TelegramAdmission,
  TelegramConversation,
  TelegramResponseTarget,
} from "./telegram-conversation";
export {
  WhatsAppConversation,
  WhatsAppResponseTarget,
} from "./whatsapp-conversation";

import { makeBaseLayer, makePgLayer } from "./base-layer";

interface AgentResponseTargetStub {
  readonly onGadgetResponse: (
    response: import("@delulu/services").AgentRuntimeResponse
  ) => Promise<void>;
}

interface AgentResponseTargetExports {
  readonly AgentResponseTarget: (options: {
    readonly props: { readonly runId: string };
  }) => AgentResponseTargetStub;
}

/** Trusted self-binding entrypoint that creates a persistent callback target. */
export class AgentRuntimeBridge extends WorkerEntrypoint<Env> {
  async ensureExternalUser(input: {
    readonly email: string;
    readonly displayName: string;
  }): Promise<void> {
    if (!this.env.AGENT_RUNTIME) {
      throw new Error("Agent runtime binding is not configured");
    }
    await this.env.AGENT_RUNTIME.ensureExternalUser(input);
  }

  async submitExternalMessage(input: {
    readonly correlationId: string;
    readonly callerEmail: string;
    readonly displayName: string;
    readonly gadgetKey: string;
    readonly chatKey: string;
    readonly messageKey: string;
    readonly gadgetTitle: string;
    readonly prompt: string;
  }) {
    if (!this.env.AGENT_RUNTIME) {
      throw new Error("Agent runtime binding is not configured");
    }
    const workerExports = this.ctx
      .exports as unknown as AgentResponseTargetExports;
    const chatGatewayRpcTarget = workerExports.AgentResponseTarget({
      props: { runId: input.correlationId },
    });
    return this.env.AGENT_RUNTIME.submitExternalMessage({
      callerEmail: input.callerEmail,
      gadgetKey: input.gadgetKey,
      chatKey: input.chatKey,
      messageKey: input.messageKey,
      gadgetTitle: input.gadgetTitle,
      prompt: input.prompt,
      chatGatewayRpcTarget,
    });
  }

  async interruptExternalRun(input: {
    readonly callerEmail: string;
    readonly gadgetKey: string;
    readonly chatKey: string;
    readonly messageKey: string;
  }): Promise<void> {
    if (!this.env.AGENT_RUNTIME) {
      throw new Error("Agent runtime binding is not configured");
    }
    await this.env.AGENT_RUNTIME.interruptExternalRun(input);
  }

  async resolveExternalAction(input: {
    readonly callerEmail: string;
    readonly gadgetKey: string;
    readonly actionId: string;
    readonly decision: "approved" | "rejected";
  }): Promise<void> {
    if (!this.env.AGENT_RUNTIME) {
      throw new Error("Agent runtime binding is not configured");
    }
    await this.env.AGENT_RUNTIME.resolveExternalAction(input);
  }
}

/** At-least-once runtime completion callback; database claims make delivery idempotent. */
export class AgentResponseTarget extends WorkerEntrypoint<
  Env,
  { readonly runId: string }
> {
  async onGadgetResponse(
    response: import("@delulu/services").AgentRuntimeResponse
  ): Promise<void> {
    const runId = this.ctx.props.runId;
    const program = Effect.gen(function* () {
      const agents = yield* AgentWorkspaceService;
      yield* agents.completeExternalResponse({
        runId,
        response,
      });
    });
    await Effect.runPromise(
      program.pipe(Effect.provide(makeBaseLayer(this.env)))
    );
  }
}

type ContentAction =
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
export class AgentContentBridge extends WorkerEntrypoint<Env> {
  async getContentContext(input: {
    readonly callerEmail: string;
    readonly workspaceId: string;
  }) {
    const program = Effect.gen(function* () {
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
          FROM agent_memories WHERE workspace_id = ${input.workspaceId}
            AND user_id = ${member.userId}
            AND status != 'rejected' ORDER BY updated_at DESC LIMIT 100`,
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
    readonly action: ContentAction;
    readonly idempotencyKey: string;
  }) {
    const program = Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const posts = yield* PostService;
      const workspaceId = yield* Schema.decodeUnknownEffect(WorkspaceId)(
        input.action.workspaceId
      );
      const members = yield* sql<{
        memberId: string;
        role: "owner" | "admin" | "editor" | "viewer";
      }>`SELECT wm.id AS member_id, wm.role FROM users u
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

type WebHandler = (request: Request) => Promise<Response>;

/**
 * Build the web handler (which owns the Postgres pool) fresh for a single
 * request and dispose it once the request settles.
 *
 * We cannot memoize the handler across requests: `@effect/sql-pg` uses
 * node-postgres, whose sockets (over `nodejs_compat`) are bound to the workerd
 * I/O context of the request that opened them. workerd cancels any request that
 * touches a socket opened by a *different* request — surfacing as an instant
 * "the Worker's code had hung" 500 (with no CORS headers, so the browser then
 * reports a CORS failure). A per-isolate shared pool therefore fails on every
 * request that reuses an idle connection. Building and disposing the pool per
 * request keeps every socket within one I/O context. In production Hyperdrive
 * holds the warm upstream pool, so the per-request connect stays cheap.
 */
const handleRequest = (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  const { handler, dispose } = buildWebHandler(makeBaseLayer(env), {
    allowedOrigins: appOrigins(env),
  });
  const run = (handler as WebHandler)(request);
  // Release the pool after the response is produced, out of band so it never
  // delays the response the client sees.
  ctx.waitUntil(run.then(dispose, dispose));
  return run;
};

/** Each idempotency key owns its durable execution state and alarm. */
export class JobExecutor extends DurableJobObject {
  constructor(state: JobState, env: Env) {
    super(state, {
      ...makeJobRuntime(
        () => makePgLayer(env),
        (job) => executeJob(job, makeBaseLayer(env)),
        (job, error) => failJob(job, error, makeBaseLayer(env))
      ),
      paused: env.SCHEDULER_PAUSED === "true",
    });
  }
}
export default {
  scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): void {
    if (env.DATABASE_URL || env.HYPERDRIVE) {
      ctx.waitUntil(runMaintenance(makeBaseLayer(env)));
    }
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const maintenance = maintenanceResponse(request, env.API_MAINTENANCE);
    if (maintenance) {
      return maintenance;
    }
    if (new URL(request.url).pathname === "/internal/jobs") {
      if (
        !(env.JOBS && env.SCHEDULER_SECRET) ||
        request.headers.get("authorization") !==
          `Bearer ${env.SCHEDULER_SECRET}`
      ) {
        return new Response(null, { status: 401 });
      }
      if (request.method !== "POST") {
        return new Response(null, { status: 405 });
      }
      await sendIntent(
        env.JOBS,
        Schema.decodeUnknownSync(JobIntent)(await request.json())
      );
      return new Response(null, { status: 204 });
    }
    const ingress = await handleProviderIngress(request, env);
    if (ingress) {
      return ingress;
    }
    return handleRequest(request, env, ctx);
  },
};
