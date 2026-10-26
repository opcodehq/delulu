import { WorkerEntrypoint } from "cloudflare:workers";
import { AgentWorkspaceService, JobIntent } from "@delulu/services";
import { Effect, Schema } from "effect";
import { buildWebHandler } from "./app";
import { ContentBridge } from "./content-bridge";
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
  TelegramLinkedConversation,
  TelegramLinkedResponseTarget,
} from "./telegram-linked-conversation";
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

export class AgentContentBridge extends WorkerEntrypoint<Env> {
  getContentContext(input: Parameters<ContentBridge["getContentContext"]>[0]) {
    return new ContentBridge(this.env).getContentContext(input);
  }
  executeContentAction(
    input: Parameters<ContentBridge["executeContentAction"]>[0]
  ) {
    return new ContentBridge(this.env).executeContentAction(input);
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
