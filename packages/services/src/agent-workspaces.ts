import {
  type AgentApprovalView,
  type AgentMemoryView,
  type AgentRitualView,
  type AgentRunEventView,
  type AgentRunView,
  type AgentUsageView,
  type AgentWorkspaceView,
  ConflictError,
  NotFoundError,
  ProviderUnavailableError,
  QuotaExceededError,
} from "@delulu/contracts";
import {
  AgentApprovalId,
  AgentMemoryId,
  AgentRitualId,
  AgentRunEventId,
  AgentRunId,
  AgentUsageId,
  AgentWorkspaceId,
  makeId,
  TokenCipher,
  type UserId,
  type WorkspaceId,
} from "@delulu/core";
import { Context, Effect, Layer, Predicate } from "effect";
import { SqlClient } from "effect/unstable/sql";
import {
  AgentRuntimeProvider,
  type AgentRuntimeResponse,
  agentMemoryRequiresConfirmation,
  deriveAgentRoute,
} from "./agent-runtime";

type Row = Record<string, unknown>;
type WorkspaceView = typeof AgentWorkspaceView.Type;
type RunView = typeof AgentRunView.Type;
type EventView = typeof AgentRunEventView.Type;
type RitualView = typeof AgentRitualView.Type;
type MemoryView = typeof AgentMemoryView.Type;
type ApprovalView = typeof AgentApprovalView.Type;
type UsageView = typeof AgentUsageView.Type;

const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();
const nullableIso = (value: unknown): string | null =>
  value === null || value === undefined ? null : iso(value);
const nullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
const jsonRecord = (value: unknown): Record<string, unknown> =>
  Predicate.isObject(value) ? value : {};
const jsonArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];

const workspaceView = (row: Row): WorkspaceView => ({
  id: String(row.id),
  workspaceId: String(row.workspaceId),
  state: row.state as WorkspaceView["state"],
  accessTier: row.accessTier as WorkspaceView["accessTier"],
  trialTurnsRemaining: Number(row.trialTurnsRemaining),
  monthlyBudgetMicros: String(row.monthlyBudgetMicros),
  dailyBudgetMicros: String(row.dailyBudgetMicros),
  maxConcurrentRuns: Number(row.maxConcurrentRuns),
  maxRunSeconds: Number(row.maxRunSeconds),
  ritualsEnabled: Boolean(row.ritualsEnabled),
  externalWritesEnabled: Boolean(row.externalWritesEnabled),
  advancedCodeEnabled: Boolean(row.advancedCodeEnabled),
  runtimePath: nullableString(row.runtimePath),
  lastActivityAt: iso(row.lastActivityAt),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const runView = (row: Row): RunView => ({
  id: String(row.id),
  agentWorkspaceId: String(row.agentWorkspaceId),
  workspaceId: String(row.workspaceId),
  source: row.source as RunView["source"],
  chatKey: String(row.chatKey),
  objective: String(row.objective),
  status: row.status as RunView["status"],
  runtimeChatPath: nullableString(row.runtimeChatPath),
  output: String(row.output ?? ""),
  provider: nullableString(row.provider),
  model: nullableString(row.model),
  inputTokens: String(row.inputTokens ?? 0),
  outputTokens: String(row.outputTokens ?? 0),
  cachedInputTokens: String(row.cachedInputTokens ?? 0),
  costMicros: String(row.costMicros ?? 0),
  error: nullableString(row.error),
  createdAt: iso(row.createdAt),
  completedAt: nullableIso(row.completedAt),
});

const eventView = (row: Row): EventView => ({
  id: String(row.id),
  runId: String(row.runId),
  sequence: Number(row.sequence),
  type: String(row.type),
  role: row.role as EventView["role"],
  content: String(row.content ?? ""),
  payload: jsonRecord(row.payload),
  occurredAt: iso(row.occurredAt),
});

const ritualView = (row: Row): RitualView => ({
  id: String(row.id),
  workspaceId: String(row.workspaceId),
  kind: row.kind as RitualView["kind"],
  name: String(row.name),
  prompt: String(row.prompt),
  timezone: String(row.timezone),
  schedule: jsonRecord(row.schedule),
  deliveryChannels: jsonArray(row.deliveryChannels),
  enabled: Boolean(row.enabled),
  perRunBudgetMicros: String(row.perRunBudgetMicros),
  lastRunAt: nullableIso(row.lastRunAt),
  nextRunAt: nullableIso(row.nextRunAt),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const memoryView = (row: Row): MemoryView => ({
  id: String(row.id),
  workspaceId: String(row.workspaceId),
  category: row.category as MemoryView["category"],
  value: row.value,
  provenance: String(row.provenance),
  confidence: Number(row.confidence),
  status: row.status as MemoryView["status"],
  requiresConfirmation: Boolean(row.requiresConfirmation),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const SELECT_WORKSPACE = `id, workspace_id, runtime_gadget_key, runtime_path, state, access_tier,
  trial_turns_remaining, monthly_budget_micros, daily_budget_micros,
  max_concurrent_runs, max_run_seconds, rituals_enabled,
  external_writes_enabled, advanced_code_enabled, last_activity_at, created_at,
  updated_at`;

const SELECT_RUN = `id, agent_workspace_id, workspace_id, source, chat_key,
  objective, status, runtime_chat_path, output, provider, model, input_tokens,
  output_tokens, cached_input_tokens, cost_micros, error, created_at, completed_at,
  approval_delivery_ciphertext, approval_delivery_cipher_version,
  approval_delivery_expires_at`;

const SELECT_RITUAL = `id, workspace_id, kind, name, prompt, timezone, schedule,
  delivery_channels, enabled, per_run_budget_micros, last_run_at, next_run_at,
  created_at, updated_at`;

const SELECT_MEMORY = `id, workspace_id, category, value, provenance, confidence,
  status, requires_confirmation, created_at, updated_at`;

const runtimeFailure = (message: string, retryable = true) =>
  new ProviderUnavailableError({
    message,
    provider: "agent-runtime",
    retryable,
  });

const approvalCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const value = Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length]
  ).join("");
  return `${value.slice(0, 4)}-${value.slice(4)}`;
};

export const hashAgentApprovalCode = (code: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(code.trim().toUpperCase())
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  });

export class AgentWorkspaceService extends Context.Service<
  AgentWorkspaceService,
  {
    readonly get: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<WorkspaceView | null>;
    readonly create: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly accessTier?: WorkspaceView["accessTier"];
    }) => Effect.Effect<
      WorkspaceView,
      ConflictError | ProviderUnavailableError
    >;
    readonly remove: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<void>;
    readonly updateSettings: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly runtimeEnabled?: boolean;
      readonly ritualsEnabled?: boolean;
      readonly externalWritesEnabled?: boolean;
      readonly advancedCodeEnabled?: boolean;
    }) => Effect.Effect<WorkspaceView, NotFoundError>;
    readonly listRuns: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<readonly RunView[]>;
    readonly run: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly billingOwnerUserId: UserId;
      readonly message: string;
      readonly idempotencyKey: string;
      readonly source: "web" | "external" | "ritual";
      readonly adapterId?: string;
      readonly threadId?: string;
      readonly connectionId?: string;
      readonly conversationId?: string;
      readonly ritualId?: string;
      readonly sourceMessageKey?: string;
    }) => Effect.Effect<
      RunView,
      | ConflictError
      | NotFoundError
      | ProviderUnavailableError
      | QuotaExceededError
    >;
    readonly getRun: (
      workspaceId: WorkspaceId,
      userId: UserId,
      runId: string
    ) => Effect.Effect<RunView, NotFoundError>;
    readonly listRunEvents: (
      workspaceId: WorkspaceId,
      userId: UserId,
      runId: string
    ) => Effect.Effect<readonly EventView[]>;
    readonly interrupt: (
      workspaceId: WorkspaceId,
      userId: UserId,
      runId: string
    ) => Effect.Effect<RunView, NotFoundError | ProviderUnavailableError>;
    readonly completeExternalResponse: (input: {
      readonly runId: string;
      readonly response: AgentRuntimeResponse;
      readonly senderAddress?: string;
    }) => Effect.Effect<
      { readonly run: RunView; readonly replyText: string },
      NotFoundError
    >;
    readonly resolveApproval: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly runId: string;
      readonly senderAddress: string;
      readonly code: string;
      readonly decision: "approved" | "rejected";
    }) => Effect.Effect<
      { readonly runId: string; readonly message: string },
      ConflictError | ProviderUnavailableError
    >;
    readonly usage: (
      workspaceId: WorkspaceId,
      userId: UserId,
      billingOwnerUserId: UserId
    ) => Effect.Effect<UsageView, NotFoundError>;
    readonly listRituals: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<readonly RitualView[]>;
    readonly createRitual: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly kind: RitualView["kind"];
      readonly name: string;
      readonly prompt: string;
      readonly timezone: string;
      readonly schedule: Readonly<Record<string, unknown>>;
      readonly deliveryChannels: readonly string[];
    }) => Effect.Effect<RitualView, NotFoundError>;
    readonly updateRitual: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly id: string;
      readonly name?: string;
      readonly prompt?: string;
      readonly timezone?: string;
      readonly schedule?: Readonly<Record<string, unknown>>;
      readonly deliveryChannels?: readonly string[];
      readonly enabled?: boolean;
    }) => Effect.Effect<RitualView, NotFoundError | ConflictError>;
    readonly listMemories: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<readonly MemoryView[]>;
    readonly listApprovals: (
      workspaceId: WorkspaceId,
      userId: UserId,
      runId: string
    ) => Effect.Effect<readonly ApprovalView[], NotFoundError>;
    readonly resolveMemory: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly id: string;
      readonly status: "confirmed" | "rejected";
    }) => Effect.Effect<MemoryView, NotFoundError>;
    readonly runMaintenance: (limit?: number) => Effect.Effect<{
      readonly timedOut: number;
      readonly expiredApprovals: number;
    }>;
  }
>()("@delulu/services/AgentWorkspaceService") {
  static readonly layer = Layer.effect(
    AgentWorkspaceService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const runtime = yield* AgentRuntimeProvider;
      const cipher = yield* TokenCipher;

      const deliveryReply = Effect.fn("AgentWorkspaceService.deliveryReply")(
        function* (row: Row) {
          const ciphertext = nullableString(row.approvalDeliveryCiphertext);
          const cipherVersion = nullableString(
            row.approvalDeliveryCipherVersion
          );
          const expiresAt = row.approvalDeliveryExpiresAt;
          if (
            !ciphertext ||
            cipherVersion !== "v1" ||
            !expiresAt ||
            new Date(expiresAt as string | Date).getTime() <= Date.now()
          ) {
            return String(row.output ?? "Done.");
          }
          return yield* cipher
            .decrypt({ ciphertext, cipherVersion })
            .pipe(Effect.orDie);
        }
      );

      const workspaceRows = (workspaceId: WorkspaceId, userId: UserId) =>
        sql<Row>`SELECT ${sql.unsafe(SELECT_WORKSPACE)} FROM agent_workspaces
          WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
            AND deleted_at IS NULL LIMIT 1`.pipe(Effect.orDie);

      const get = Effect.fn("AgentWorkspaceService.get")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const row = (yield* workspaceRows(workspaceId, userId))[0];
        return row ? workspaceView(row) : null;
      });

      const create = Effect.fn("AgentWorkspaceService.create")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly accessTier?: WorkspaceView["accessTier"];
        }) {
          const existing = (yield* workspaceRows(
            input.workspaceId,
            input.userId
          ))[0];
          const users = yield* sql<Row>`SELECT email, name FROM users
          WHERE id = ${input.userId} AND identity_deleted_at IS NULL LIMIT 1`.pipe(
            Effect.orDie
          );
          const user = users[0];
          const email = nullableString(user?.email)?.trim().toLowerCase();
          if (!email) {
            return yield* new ConflictError({
              message:
                "A verified email is required to create an agent workspace",
              resource: "agent-workspace",
            });
          }
          yield* runtime.ensureExternalUser({
            email,
            displayName: nullableString(user?.name) ?? email.split("@")[0]!,
          });
          if (existing) {
            if (existing.state !== "active") {
              const rows =
                yield* sql<Row>`UPDATE agent_workspaces SET state = 'active',
              runtime_provider = 'cloudflare', last_activity_at = now()
              WHERE id = ${String(existing.id)} RETURNING ${sql.unsafe(SELECT_WORKSPACE)}`.pipe(
                  Effect.orDie
                );
              return workspaceView(rows[0]!);
            }
            return workspaceView(existing);
          }
          const accessTier = input.accessTier ?? "trial";
          const monthlyBudgetMicros =
            accessTier === "beta" ? 5_000_000 : 10_000_000;
          const rows = yield* sql<Row>`INSERT INTO agent_workspaces
          (id, user_id, workspace_id, runtime_provider, runtime_gadget_key,
            access_tier, monthly_budget_micros)
          VALUES (${makeId(AgentWorkspaceId)}, ${input.userId}, ${input.workspaceId},
            'cloudflare', ${`workspace:${input.workspaceId}`}, ${accessTier},
            ${monthlyBudgetMicros})
          ON CONFLICT (user_id, workspace_id) WHERE deleted_at IS NULL
          DO UPDATE SET last_activity_at = agent_workspaces.last_activity_at
          RETURNING ${sql.unsafe(SELECT_WORKSPACE)}`.pipe(Effect.orDie);
          return workspaceView(rows[0]!);
        }
      );

      const remove = Effect.fn("AgentWorkspaceService.remove")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        yield* sql`UPDATE agent_workspaces SET state = 'deleted', deleted_at = now()
          WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
            AND deleted_at IS NULL`.pipe(Effect.orDie);
      });

      const updateSettings = Effect.fn("AgentWorkspaceService.updateSettings")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly runtimeEnabled?: boolean;
          readonly ritualsEnabled?: boolean;
          readonly externalWritesEnabled?: boolean;
          readonly advancedCodeEnabled?: boolean;
        }) {
          const rows = yield* sql<Row>`UPDATE agent_workspaces SET
          state = CASE WHEN ${input.runtimeEnabled ?? null}::boolean IS NULL
            THEN state WHEN ${input.runtimeEnabled ?? null} THEN 'active' ELSE 'disabled' END,
          rituals_enabled = COALESCE(${input.ritualsEnabled ?? null}, rituals_enabled),
          external_writes_enabled = COALESCE(${input.externalWritesEnabled ?? null}, external_writes_enabled),
          advanced_code_enabled = COALESCE(${input.advancedCodeEnabled ?? null}, advanced_code_enabled)
          WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.userId}
            AND deleted_at IS NULL RETURNING ${sql.unsafe(SELECT_WORKSPACE)}`.pipe(
            Effect.orDie
          );
          if (!rows[0]) {
            return yield* new NotFoundError({
              message: "Agent workspace not found",
              resource: "agent-workspace",
            });
          }
          return workspaceView(rows[0]);
        }
      );

      const listRuns = Effect.fn("AgentWorkspaceService.listRuns")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const rows =
          yield* sql<Row>`SELECT ${sql.unsafe(SELECT_RUN)} FROM agent_runs
          WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
          ORDER BY created_at DESC LIMIT 100`.pipe(Effect.orDie);
        return yield* Effect.forEach(rows, (row) =>
          Effect.gen(function* () {
            const view = runView(row);
            return view.status === "waiting_approval"
              ? { ...view, output: yield* deliveryReply(row) }
              : view;
          })
        );
      });

      const getRun = Effect.fn("AgentWorkspaceService.getRun")(function* (
        workspaceId: WorkspaceId,
        userId: UserId,
        runId: string
      ) {
        const rows =
          yield* sql<Row>`SELECT ${sql.unsafe(SELECT_RUN)} FROM agent_runs
          WHERE id = ${runId} AND workspace_id = ${workspaceId}
            AND user_id = ${userId} LIMIT 1`.pipe(Effect.orDie);
        if (!rows[0]) {
          return yield* new NotFoundError({
            message: "Agent run not found",
            resource: "agent-run",
          });
        }
        const view = runView(rows[0]);
        return view.status === "waiting_approval"
          ? { ...view, output: yield* deliveryReply(rows[0]) }
          : view;
      });

      const listRunEvents = Effect.fn("AgentWorkspaceService.listRunEvents")(
        function* (workspaceId: WorkspaceId, userId: UserId, runId: string) {
          const rows =
            yield* sql<Row>`SELECT e.id, e.run_id, e.sequence, e.type,
            e.role, e.content, e.payload, e.occurred_at FROM agent_run_events e
            JOIN agent_runs r ON r.id = e.run_id WHERE e.run_id = ${runId}
              AND r.workspace_id = ${workspaceId} AND r.user_id = ${userId}
            ORDER BY e.sequence ASC`.pipe(Effect.orDie);
          return rows.map(eventView);
        }
      );

      const usage = Effect.fn("AgentWorkspaceService.usage")(function* (
        workspaceId: WorkspaceId,
        userId: UserId,
        billingOwnerUserId: UserId
      ) {
        const workspace = (yield* workspaceRows(workspaceId, userId))[0];
        if (!workspace) {
          return yield* new NotFoundError({
            message: "Agent workspace not found",
            resource: "agent-workspace",
          });
        }
        const rows = yield* sql<Row>`SELECT
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN
            CASE entry_type WHEN 'release' THEN -cost_micros ELSE cost_micros END
          ELSE 0 END), 0)::text AS daily_used,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN
            CASE entry_type WHEN 'release' THEN -cost_micros ELSE cost_micros END
          ELSE 0 END), 0)::text AS monthly_used
          FROM agent_usage_ledger WHERE billing_owner_user_id = ${billingOwnerUserId}`.pipe(
          Effect.orDie
        );
        const active =
          yield* sql<Row>`SELECT count(*)::text AS count FROM agent_runs
          WHERE agent_workspace_id = ${String(workspace.id)} AND status IN
          ('queued', 'submitted', 'running', 'waiting_approval', 'interrupting')`.pipe(
            Effect.orDie
          );
        return {
          accessTier: workspace.accessTier as UsageView["accessTier"],
          trialTurnsRemaining: Number(workspace.trialTurnsRemaining),
          dailyUsedMicros: String(rows[0]?.dailyUsed ?? 0),
          dailyBudgetMicros: String(workspace.dailyBudgetMicros),
          monthlyUsedMicros: String(rows[0]?.monthlyUsed ?? 0),
          monthlyBudgetMicros: String(workspace.monthlyBudgetMicros),
          activeRuns: Number(active[0]?.count ?? 0),
          maxConcurrentRuns: Number(workspace.maxConcurrentRuns),
        };
      });

      const run = Effect.fn("AgentWorkspaceService.run")(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly userId: UserId;
        readonly billingOwnerUserId: UserId;
        readonly message: string;
        readonly idempotencyKey: string;
        readonly source: "web" | "external" | "ritual";
        readonly adapterId?: string;
        readonly threadId?: string;
        readonly connectionId?: string;
        readonly conversationId?: string;
        readonly ritualId?: string;
        readonly sourceMessageKey?: string;
      }) {
        let workspace = (yield* workspaceRows(
          input.workspaceId,
          input.userId
        ))[0];
        if (!workspace) {
          yield* create({
            workspaceId: input.workspaceId,
            userId: input.userId,
          });
          workspace = (yield* workspaceRows(
            input.workspaceId,
            input.userId
          ))[0]!;
        }
        if (
          workspace.state !== "active" ||
          (input.source === "ritual" && !workspace.ritualsEnabled)
        ) {
          return yield* new ConflictError({
            message: "This agent entrypoint is disabled for the workspace",
            resource: "agent-workspace",
          });
        }
        // The runtime is hard-capped at four 32k-input/4k-output model steps.
        // Reserve the conservative upper-cost envelope before inference.
        const reservation = 500_000;
        const route = deriveAgentRoute({
          workspaceId: input.workspaceId,
          channel: input.source,
          adapterId: input.adapterId,
          threadId: input.threadId,
          connectionId: input.connectionId,
          conversationId: input.conversationId,
          ritualId: input.ritualId,
        });
        const userRows = yield* sql<Row>`SELECT email, name FROM users
          WHERE id = ${input.userId} LIMIT 1`.pipe(Effect.orDie);
        const email = nullableString(userRows[0]?.email)?.trim().toLowerCase();
        if (!email) {
          return yield* new ConflictError({
            message: "A verified email is required to run the agent",
            resource: "agent-run",
          });
        }
        const id = makeId(AgentRunId);
        const claim = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              // The billing-owner lock serializes budget reservations across all
              // of the owner's workspaces. The workspace lock serializes its
              // concurrency/trial counters and idempotency claim.
              yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-budget:${input.billingOwnerUserId}`}, 0))`;
              yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-runs:${String(workspace.id)}`}, 0))`;

              const existing = yield* sql<Row>`SELECT ${sql.unsafe(SELECT_RUN)}
                FROM agent_runs WHERE user_id = ${input.userId}
                  AND workspace_id = ${input.workspaceId}
                  AND idempotency_key = ${input.idempotencyKey} LIMIT 1`;
              if (existing[0]) {
                return {
                  existing: runView(existing[0]),
                  row: null,
                  reservedTrialTurn: false,
                } as const;
              }

              const lockedRows =
                yield* sql<Row>`SELECT ${sql.unsafe(SELECT_WORKSPACE)}
                FROM agent_workspaces WHERE id = ${String(workspace.id)}
                  AND deleted_at IS NULL FOR UPDATE`;
              const lockedWorkspace = lockedRows[0]!;

              const usageRows = yield* sql<Row>`SELECT
                COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN
                  CASE entry_type WHEN 'release' THEN -cost_micros ELSE cost_micros END
                ELSE 0 END), 0)::text AS daily_used,
                COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN
                  CASE entry_type WHEN 'release' THEN -cost_micros ELSE cost_micros END
                ELSE 0 END), 0)::text AS monthly_used
                FROM agent_usage_ledger
                WHERE billing_owner_user_id = ${input.billingOwnerUserId}`;
              const activeRows = yield* sql<Row>`SELECT count(*)::text AS count
                FROM agent_runs WHERE agent_workspace_id = ${String(workspace.id)}
                  AND status IN ('queued', 'submitted', 'running',
                    'waiting_approval', 'interrupting')`;
              const activeRuns = Number(activeRows[0]?.count ?? 0);
              if (
                activeRuns >= Number(lockedWorkspace.maxConcurrentRuns) ||
                (lockedWorkspace.accessTier === "trial" &&
                  Number(lockedWorkspace.trialTurnsRemaining) <= 0)
              ) {
                return yield* new QuotaExceededError({
                  message:
                    "Agent usage is exhausted or too many runs are active",
                  resource: "agent-runs",
                  limit: Number(lockedWorkspace.maxConcurrentRuns),
                  current: activeRuns,
                  upgradeUrl: "/settings/billing",
                });
              }
              const dailyUsed = Number(usageRows[0]?.dailyUsed ?? 0);
              const monthlyUsed = Number(usageRows[0]?.monthlyUsed ?? 0);
              if (
                dailyUsed + reservation >
                  Number(lockedWorkspace.dailyBudgetMicros) ||
                monthlyUsed + reservation >
                  Number(lockedWorkspace.monthlyBudgetMicros)
              ) {
                return yield* new QuotaExceededError({
                  message: "Agent inference budget is exhausted",
                  resource: "agent-inference",
                  limit: Number(lockedWorkspace.monthlyBudgetMicros),
                  current: monthlyUsed,
                  upgradeUrl: "/settings/billing",
                });
              }

              const rows = yield* sql<Row>`INSERT INTO agent_runs
                (id, agent_workspace_id, user_id, workspace_id, source,
                  source_message_key, chat_key, objective, status, idempotency_key,
                  started_at)
                VALUES (${id}, ${String(workspace.id)}, ${input.userId},
                  ${input.workspaceId}, ${input.source},
                  ${input.sourceMessageKey ?? null}, ${route.chatKey},
                  ${input.message}, 'submitted', ${input.idempotencyKey}, now())
                RETURNING ${sql.unsafe(SELECT_RUN)}`;
              yield* sql`INSERT INTO agent_run_events
                (id, run_id, sequence, type, role, content)
                VALUES (${makeId(AgentRunEventId)}, ${id}, 1,
                  'message.submitted', 'user', ${input.message})`;
              yield* sql`INSERT INTO agent_usage_ledger
                (id, billing_owner_user_id, agent_workspace_id, run_id,
                  entry_type, idempotency_key, cost_micros)
                VALUES (${makeId(AgentUsageId)}, ${input.billingOwnerUserId},
                  ${String(workspace.id)}, ${id}, 'reservation',
                  ${`run:${id}:reservation`}, ${reservation})`;
              const reservedTrialTurn = lockedWorkspace.accessTier === "trial";
              if (reservedTrialTurn) {
                yield* sql`UPDATE agent_workspaces SET
                  trial_turns_remaining = trial_turns_remaining - 1
                  WHERE id = ${String(workspace.id)}
                    AND trial_turns_remaining > 0`;
              }
              return {
                existing: null,
                row: rows[0]!,
                reservedTrialTurn,
              } as const;
            })
          )
          .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));
        if (claim.existing) {
          return claim.existing;
        }
        const compensateRejectedSubmission = Effect.fn(
          "AgentWorkspaceService.compensateRejectedSubmission"
        )(function* (message: string) {
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const failed = yield* sql<Row>`UPDATE agent_runs SET
                status = 'failed', error = ${message}, completed_at = now()
                WHERE id = ${id} AND status = 'submitted' RETURNING id`;
              if (!failed[0]) {
                return;
              }
              yield* sql`INSERT INTO agent_usage_ledger
                (id, billing_owner_user_id, agent_workspace_id, run_id,
                  entry_type, idempotency_key, cost_micros)
                VALUES (${makeId(AgentUsageId)}, ${input.billingOwnerUserId},
                  ${String(workspace.id)}, ${id}, 'release',
                  ${`run:${id}:release`}, ${reservation})
                ON CONFLICT (idempotency_key) DO NOTHING`;
              if (claim.reservedTrialTurn) {
                yield* sql`UPDATE agent_workspaces SET
                  trial_turns_remaining = trial_turns_remaining + 1
                  WHERE id = ${String(workspace.id)}`;
              }
            })
          );
        });
        const result = yield* runtime
          .submitExternalMessage({
            correlationId: id,
            callerEmail: email,
            displayName:
              nullableString(userRows[0]?.name) ?? email.split("@")[0]!,
            gadgetKey: route.gadgetKey,
            chatKey: route.chatKey,
            messageKey: input.sourceMessageKey ?? id,
            gadgetTitle: "Content HQ",
            prompt: input.message,
            responseTarget: {
              onGadgetResponse: (response) =>
                Effect.runPromise(
                  completeExternalResponse({ runId: id, response }).pipe(
                    Effect.asVoid
                  )
                ),
            },
          })
          .pipe(Effect.result);
        if (result._tag === "Failure") {
          const message = result.failure.message;
          yield* compensateRejectedSubmission(message).pipe(Effect.orDie);
          return yield* runtimeFailure(message);
        }
        if (!result.success.accepted) {
          const message = result.success.message;
          yield* compensateRejectedSubmission(message).pipe(Effect.orDie);
          return yield* runtimeFailure(message, false);
        }
        const accepted = yield* sql<Row>`UPDATE agent_runs SET
          runtime_chat_path = ${result.success.chatPath}
          WHERE id = ${id} RETURNING ${sql.unsafe(SELECT_RUN)}`.pipe(
          Effect.orDie
        );
        yield* sql`UPDATE agent_workspaces SET runtime_path = ${result.success.chatPath},
          last_activity_at = now() WHERE id = ${String(workspace.id)}`.pipe(
          Effect.orDie
        );
        return runView(accepted[0] ?? claim.row);
      });

      const interrupt = Effect.fn("AgentWorkspaceService.interrupt")(function* (
        workspaceId: WorkspaceId,
        userId: UserId,
        runId: string
      ) {
        const rows =
          yield* sql<Row>`UPDATE agent_runs SET status = 'interrupting'
          WHERE id = ${runId} AND workspace_id = ${workspaceId} AND user_id = ${userId}
            AND status IN ('queued', 'submitted', 'running', 'waiting_approval')
          RETURNING ${sql.unsafe(SELECT_RUN)}`.pipe(Effect.orDie);
        if (!rows[0]) {
          return yield* getRun(workspaceId, userId, runId);
        }
        yield* runtime.interruptExternalRun({
          callerEmail: String(
            (yield* sql<Row>`SELECT email FROM users WHERE id = ${userId}`.pipe(
              Effect.orDie
            ))[0]?.email ?? ""
          ),
          gadgetKey: `workspace:${workspaceId}`,
          chatKey: String(rows[0].chatKey),
          messageKey: runId,
        });
        const updated =
          yield* sql<Row>`UPDATE agent_runs SET status = 'interrupted',
          completed_at = now() WHERE id = ${runId}
          RETURNING ${sql.unsafe(SELECT_RUN)}`.pipe(Effect.orDie);
        return runView(updated[0]!);
      });

      const completeExternalResponse = Effect.fn(
        "AgentWorkspaceService.completeExternalResponse"
      )(function* (input: {
        readonly runId: string;
        readonly response: AgentRuntimeResponse;
        readonly senderAddress?: string;
      }) {
        const rows = yield* sql<Row>`SELECT r.*, w.billing_owner_user_id
          FROM agent_runs r JOIN workspaces w ON w.id = r.workspace_id
          WHERE r.id = ${input.runId} LIMIT 1`.pipe(Effect.orDie);
        const row = rows[0];
        if (!row) {
          return yield* new NotFoundError({
            message: "Agent run not found",
            resource: "agent-run",
          });
        }
        if (
          ["completed", "failed", "interrupted", "timed_out"].includes(
            String(row.status)
          )
        ) {
          return {
            run: runView(row),
            replyText: yield* deliveryReply(row),
          };
        }
        const usageValue = input.response.usage;
        const actions = input.response.actions ?? [];
        const nextStatus =
          actions.length > 0 ? "waiting_approval" : "completed";
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const updated =
                yield* sql<Row>`UPDATE agent_runs SET status = ${nextStatus},
          output = ${input.response.text}, provider = ${usageValue?.provider ?? null},
          model = ${usageValue?.model ?? null}, input_tokens = ${usageValue?.inputTokens ?? 0},
          output_tokens = ${usageValue?.outputTokens ?? 0},
          cached_input_tokens = ${usageValue?.cachedInputTokens ?? 0},
          cost_micros = ${usageValue?.costMicros ?? 0},
          completed_at = ${actions.length > 0 ? null : new Date().toISOString()}
          WHERE id = ${input.runId}
            AND status NOT IN ('completed', 'failed', 'interrupted', 'timed_out', 'waiting_approval')
          RETURNING ${sql.unsafe(SELECT_RUN)}`.pipe(Effect.orDie);
              if (!updated[0]) {
                const current = yield* sql<Row>`SELECT ${sql.unsafe(SELECT_RUN)}
            FROM agent_runs WHERE id = ${input.runId} LIMIT 1`.pipe(
                  Effect.orDie
                );
                return {
                  run: runView(current[0]!),
                  replyText: yield* deliveryReply(current[0]!),
                };
              }
              const sequenceRows =
                yield* sql<Row>`SELECT COALESCE(MAX(sequence), 0)::text AS sequence
          FROM agent_run_events WHERE run_id = ${input.runId}`.pipe(
                  Effect.orDie
                );
              yield* sql`INSERT INTO agent_run_events
          (id, run_id, sequence, type, role, content, payload)
          VALUES (${makeId(AgentRunEventId)}, ${input.runId},
            ${Number(sequenceRows[0]?.sequence ?? 0) + 1}, 'response.completed',
            'assistant', ${input.response.text},
            ${JSON.stringify({ usage: usageValue ?? null, actions })}::jsonb)`.pipe(
                Effect.orDie
              );
              yield* sql`INSERT INTO agent_usage_ledger
          (id, billing_owner_user_id, agent_workspace_id, run_id, entry_type,
            idempotency_key, provider, model, input_tokens, output_tokens,
            cached_input_tokens, cost_micros)
          VALUES (${makeId(AgentUsageId)}, ${String(row.billingOwnerUserId)},
            ${String(row.agentWorkspaceId)}, ${input.runId}, 'actual',
            ${`run:${input.runId}:actual`}, ${usageValue?.provider ?? null},
            ${usageValue?.model ?? null}, ${usageValue?.inputTokens ?? 0},
            ${usageValue?.outputTokens ?? 0}, ${usageValue?.cachedInputTokens ?? 0},
            ${usageValue?.costMicros ?? 0}) ON CONFLICT (idempotency_key) DO NOTHING`.pipe(
                Effect.orDie
              );
              yield* sql`INSERT INTO agent_usage_ledger
          (id, billing_owner_user_id, agent_workspace_id, run_id, entry_type,
            idempotency_key, cost_micros)
          SELECT ${makeId(AgentUsageId)}, ${String(row.billingOwnerUserId)},
            ${String(row.agentWorkspaceId)}, ${input.runId}, 'release',
            ${`run:${input.runId}:release`}, cost_micros FROM agent_usage_ledger
          WHERE idempotency_key = ${`run:${input.runId}:reservation`}
          ON CONFLICT (idempotency_key) DO NOTHING`.pipe(Effect.orDie);

              const senderAddress = input.senderAddress ?? null;
              const approvalLines: string[] = [];
              for (const action of actions) {
                const code = approvalCode();
                const codeHash = yield* hashAgentApprovalCode(code);
                const encryptedCode = yield* cipher
                  .encrypt(code)
                  .pipe(Effect.orDie);
                yield* sql`INSERT INTO agent_action_approvals
            (id, run_id, user_id, workspace_id, runtime_action_id, kind, summary,
              risk, code_hash, code_hint, code_ciphertext, code_cipher_version,
              sender_address, expires_at)
            VALUES (${makeId(AgentApprovalId)}, ${input.runId}, ${String(row.userId)},
              ${String(row.workspaceId)}, ${action.id}, ${action.kind}, ${action.summary},
              ${action.risk}, ${codeHash}, ${code.slice(-2)},
              ${encryptedCode.ciphertext}, ${encryptedCode.cipherVersion},
              ${senderAddress}, now() + interval '15 minutes')
            ON CONFLICT (user_id, workspace_id, runtime_action_id) DO NOTHING`.pipe(
                  Effect.orDie
                );
                approvalLines.push(
                  `${action.summary}\nReply APPROVE ${code} or REJECT ${code} within 15 minutes.`
                );
              }
              const replyText = [input.response.text.trim(), ...approvalLines]
                .filter(Boolean)
                .join("\n\n");
              if (approvalLines.length > 0) {
                const encrypted = yield* cipher
                  .encrypt(replyText)
                  .pipe(Effect.orDie);
                yield* sql`UPDATE agent_runs SET
                  approval_delivery_ciphertext = ${encrypted.ciphertext},
                  approval_delivery_cipher_version = ${encrypted.cipherVersion},
                  approval_delivery_expires_at = now() + interval '15 minutes'
                  WHERE id = ${input.runId}`.pipe(Effect.orDie);
              }
              for (const proposal of input.response.memoryProposals ?? []) {
                const confidence = Math.max(
                  0,
                  Math.min(1, proposal.confidence)
                );
                const requiresConfirmation = agentMemoryRequiresConfirmation({
                  ...proposal,
                  confidence,
                });
                yield* sql`INSERT INTO agent_memories
            (id, agent_workspace_id, user_id, workspace_id, category, value,
              provenance, confidence, status, requires_confirmation, source_run_id,
              confirmed_at)
            VALUES (${makeId(AgentMemoryId)}, ${String(row.agentWorkspaceId)},
              ${String(row.userId)}, ${String(row.workspaceId)}, ${proposal.category},
              ${JSON.stringify(proposal.value)}::jsonb, ${proposal.provenance},
              ${confidence}, ${requiresConfirmation ? "proposed" : "confirmed"},
              ${requiresConfirmation}, ${input.runId},
              ${requiresConfirmation ? null : new Date().toISOString()})`.pipe(
                  Effect.orDie
                );
              }
              return {
                run: { ...runView(updated[0]!), output: replyText },
                replyText,
              };
            })
          )
          .pipe(Effect.orDie);
      });

      const listApprovals = Effect.fn("AgentWorkspaceService.listApprovals")(
        function* (workspaceId: WorkspaceId, userId: UserId, runId: string) {
          const run = yield* sql<Row>`SELECT id FROM agent_runs
            WHERE id = ${runId} AND workspace_id = ${workspaceId}
              AND user_id = ${userId} LIMIT 1`.pipe(Effect.orDie);
          if (!run[0]) {
            return yield* new NotFoundError({
              message: "Agent run was not found",
              resource: "agent-run",
            });
          }
          const rows = yield* sql<Row>`SELECT id, run_id, kind, summary, risk,
              code_ciphertext, code_cipher_version, expires_at
            FROM agent_action_approvals
            WHERE run_id = ${runId} AND workspace_id = ${workspaceId}
              AND user_id = ${userId} AND status = 'pending'
              AND expires_at > now() AND code_ciphertext IS NOT NULL
              AND code_cipher_version = 'v1'
            ORDER BY created_at ASC`.pipe(Effect.orDie);
          return yield* Effect.forEach(rows, (row) =>
            cipher
              .decrypt({
                ciphertext: String(row.codeCiphertext),
                cipherVersion: "v1",
              })
              .pipe(
                Effect.orDie,
                Effect.map((code) => ({
                  id: String(row.id),
                  runId: String(row.runId),
                  kind: String(row.kind),
                  summary: String(row.summary),
                  risk: row.risk as ApprovalView["risk"],
                  code,
                  expiresAt: iso(row.expiresAt),
                }))
              )
          );
        }
      );

      const resolveApproval = Effect.fn(
        "AgentWorkspaceService.resolveApproval"
      )(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly userId: UserId;
        readonly runId: string;
        readonly senderAddress: string;
        readonly code: string;
        readonly decision: "approved" | "rejected";
      }) {
        const codeHash = yield* hashAgentApprovalCode(input.code);
        const workspaceState = (yield* workspaceRows(
          input.workspaceId,
          input.userId
        ))[0];
        if (!workspaceState?.externalWritesEnabled) {
          return yield* new ConflictError({
            message: "External agent writes are disabled for this workspace",
            resource: "agent-approval",
          });
        }
        yield* sql`UPDATE agent_action_approvals SET status = 'expired'
            WHERE status = 'pending' AND expires_at <= now()`.pipe(
          Effect.orDie
        );
        const rows = yield* sql<Row>`UPDATE agent_action_approvals SET
            status = ${input.decision}, resolved_at = now()
            WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.userId}
              AND run_id = ${input.runId}
              AND code_hash = ${codeHash} AND status = 'pending'
              AND expires_at > now()
              AND (sender_address IS NULL OR sender_address = ${input.senderAddress})
            RETURNING id, run_id, runtime_action_id, summary`.pipe(
          Effect.orDie
        );
        const approval = rows[0];
        if (!approval) {
          return yield* new ConflictError({
            message: "Approval code is invalid, expired, or already used",
            resource: "agent-approval",
          });
        }
        const workspace = (yield* workspaceRows(
          input.workspaceId,
          input.userId
        ))[0]!;
        const userRows =
          yield* sql<Row>`SELECT email FROM users WHERE id = ${input.userId}`.pipe(
            Effect.orDie
          );
        const resolved = yield* runtime
          .resolveExternalAction({
            callerEmail: String(userRows[0]?.email ?? ""),
            gadgetKey: String(
              workspace.runtimeGadgetKey ?? `workspace:${input.workspaceId}`
            ),
            actionId: String(approval.runtimeActionId),
            decision: input.decision,
          })
          .pipe(Effect.result);
        if (resolved._tag === "Failure") {
          yield* sql`UPDATE agent_action_approvals SET status = 'pending',
              resolved_at = NULL, error = ${resolved.failure.message}
              WHERE id = ${String(approval.id)}`.pipe(Effect.orDie);
          return yield* resolved.failure;
        }
        if (input.decision === "approved") {
          yield* sql`UPDATE agent_action_approvals SET status = 'applied', applied_at = now()
              WHERE id = ${String(approval.id)}`.pipe(Effect.orDie);
        }
        const pending = yield* sql<Row>`SELECT count(*)::text AS count
          FROM agent_action_approvals WHERE run_id = ${String(approval.runId)}
            AND status IN ('pending', 'approved')`.pipe(Effect.orDie);
        if (Number(pending[0]?.count ?? 0) === 0) {
          yield* sql`UPDATE agent_runs SET status = 'completed', completed_at = now()
            WHERE id = ${String(approval.runId)} AND status = 'waiting_approval'`.pipe(
            Effect.orDie
          );
        }
        return {
          runId: String(approval.runId),
          message:
            input.decision === "approved"
              ? `Approved and applied: ${String(approval.summary)}`
              : `Rejected: ${String(approval.summary)}`,
        };
      });

      const listRituals = Effect.fn("AgentWorkspaceService.listRituals")(
        function* (workspaceId: WorkspaceId, userId: UserId) {
          const rows = yield* sql<Row>`SELECT ${sql.unsafe(SELECT_RITUAL)}
            FROM agent_rituals WHERE workspace_id = ${workspaceId}
              AND user_id = ${userId} ORDER BY created_at ASC`.pipe(
            Effect.orDie
          );
          return rows.map(ritualView);
        }
      );

      const createRitual = Effect.fn("AgentWorkspaceService.createRitual")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly kind: RitualView["kind"];
          readonly name: string;
          readonly prompt: string;
          readonly timezone: string;
          readonly schedule: Readonly<Record<string, unknown>>;
          readonly deliveryChannels: readonly string[];
        }) {
          const workspace = (yield* workspaceRows(
            input.workspaceId,
            input.userId
          ))[0];
          if (!workspace) {
            return yield* new NotFoundError({
              message: "Create the agent workspace before adding rituals",
              resource: "agent-workspace",
            });
          }
          const rows = yield* sql<Row>`INSERT INTO agent_rituals
            (id, agent_workspace_id, user_id, workspace_id, kind, name, prompt,
              timezone, schedule, delivery_channels)
            VALUES (${makeId(AgentRitualId)}, ${String(workspace.id)}, ${input.userId},
              ${input.workspaceId}, ${input.kind}, ${input.name}, ${input.prompt},
              ${input.timezone}, ${JSON.stringify(input.schedule)}::jsonb,
              ${JSON.stringify(input.deliveryChannels)}::jsonb)
            RETURNING ${sql.unsafe(SELECT_RITUAL)}`.pipe(Effect.orDie);
          return ritualView(rows[0]!);
        }
      );

      const updateRitual = Effect.fn("AgentWorkspaceService.updateRitual")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly id: string;
          readonly name?: string;
          readonly prompt?: string;
          readonly timezone?: string;
          readonly schedule?: Readonly<Record<string, unknown>>;
          readonly deliveryChannels?: readonly string[];
          readonly enabled?: boolean;
        }) {
          const rows = yield* sql<Row>`UPDATE agent_rituals SET
            name = COALESCE(${input.name ?? null}, name),
            prompt = COALESCE(${input.prompt ?? null}, prompt),
            timezone = COALESCE(${input.timezone ?? null}, timezone),
            schedule = COALESCE(${input.schedule ? JSON.stringify(input.schedule) : null}::jsonb, schedule),
            delivery_channels = COALESCE(${input.deliveryChannels ? JSON.stringify(input.deliveryChannels) : null}::jsonb, delivery_channels),
            enabled = COALESCE(${input.enabled ?? null}, enabled)
            WHERE id = ${input.id} AND workspace_id = ${input.workspaceId}
              AND user_id = ${input.userId} RETURNING ${sql.unsafe(SELECT_RITUAL)}`.pipe(
            Effect.orDie
          );
          if (!rows[0]) {
            return yield* new NotFoundError({
              message: "Agent ritual not found",
              resource: "agent-ritual",
            });
          }
          if (input.enabled === true) {
            yield* sql`UPDATE agent_workspaces SET rituals_enabled = true
              WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.userId}
                AND deleted_at IS NULL`.pipe(Effect.orDie);
          }
          return ritualView(rows[0]);
        }
      );

      const listMemories = Effect.fn("AgentWorkspaceService.listMemories")(
        function* (workspaceId: WorkspaceId, userId: UserId) {
          const rows = yield* sql<Row>`SELECT ${sql.unsafe(SELECT_MEMORY)}
            FROM agent_memories WHERE workspace_id = ${workspaceId}
              AND user_id = ${userId} AND status != 'rejected'
            ORDER BY category, updated_at DESC`.pipe(Effect.orDie);
          return rows.map(memoryView);
        }
      );

      const resolveMemory = Effect.fn("AgentWorkspaceService.resolveMemory")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly id: string;
          readonly status: "confirmed" | "rejected";
        }) {
          const rows =
            yield* sql<Row>`UPDATE agent_memories SET status = ${input.status},
            confirmed_at = ${input.status === "confirmed" ? new Date().toISOString() : null}
            WHERE id = ${input.id} AND workspace_id = ${input.workspaceId}
              AND user_id = ${input.userId} AND status = 'proposed'
            RETURNING ${sql.unsafe(SELECT_MEMORY)}`.pipe(Effect.orDie);
          if (!rows[0]) {
            return yield* new NotFoundError({
              message: "Proposed agent memory not found",
              resource: "agent-memory",
            });
          }
          return memoryView(rows[0]);
        }
      );

      const runMaintenance = Effect.fn("AgentWorkspaceService.runMaintenance")(
        function* (limit = 100) {
          const expired = yield* sql<Row>`UPDATE agent_action_approvals SET
            status = 'expired' WHERE status = 'pending' AND expires_at <= now()
            RETURNING id`.pipe(Effect.orDie);
          const rows = yield* sql<Row>`SELECT r.id, r.user_id, r.workspace_id,
              r.chat_key, aw.runtime_gadget_key, u.email
            FROM agent_runs r
            JOIN agent_workspaces aw ON aw.id = r.agent_workspace_id
            JOIN users u ON u.id = r.user_id
            WHERE r.status IN ('queued', 'submitted', 'running', 'waiting_approval', 'interrupting')
              AND COALESCE(r.started_at, r.created_at) +
                (aw.max_run_seconds * interval '1 second') <= now()
            ORDER BY r.created_at ASC LIMIT ${limit}`.pipe(Effect.orDie);
          for (const row of rows) {
            yield* runtime
              .interruptExternalRun({
                callerEmail: String(row.email ?? ""),
                gadgetKey: String(row.runtimeGadgetKey),
                chatKey: String(row.chatKey),
                messageKey: String(row.id),
              })
              .pipe(Effect.catch(() => Effect.void));
            yield* sql`UPDATE agent_runs SET status = 'timed_out',
              error = 'Agent run exceeded its maximum duration', completed_at = now()
              WHERE id = ${String(row.id)}
                AND status IN ('queued', 'submitted', 'running', 'waiting_approval', 'interrupting')`.pipe(
              Effect.orDie
            );
            yield* sql`INSERT INTO agent_usage_ledger
              (id, billing_owner_user_id, agent_workspace_id, run_id, entry_type,
                idempotency_key, cost_micros)
              SELECT ${makeId(AgentUsageId)}, w.billing_owner_user_id,
                r.agent_workspace_id, r.id, 'release', ${`run:${String(row.id)}:release`},
                l.cost_micros FROM agent_runs r
              JOIN workspaces w ON w.id = r.workspace_id
              JOIN agent_usage_ledger l ON l.idempotency_key = ${`run:${String(row.id)}:reservation`}
              WHERE r.id = ${String(row.id)}
              ON CONFLICT (idempotency_key) DO NOTHING`.pipe(Effect.orDie);
          }
          return { timedOut: rows.length, expiredApprovals: expired.length };
        }
      );

      return AgentWorkspaceService.of({
        get,
        create,
        remove,
        updateSettings,
        listRuns,
        run,
        getRun,
        listRunEvents,
        interrupt,
        completeExternalResponse,
        resolveApproval,
        listApprovals,
        usage,
        listRituals,
        createRitual,
        updateRitual,
        listMemories,
        resolveMemory,
        runMaintenance,
      });
    })
  );
}
