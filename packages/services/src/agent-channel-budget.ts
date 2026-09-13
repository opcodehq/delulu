import { ConflictError, ForbiddenError } from "@delulu/contracts";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { ChannelPrincipal } from "./agent-channels";
import type { AgentRuntimeUsage } from "./agent-runtime";

const RESERVATION = 250_000;
export const lockAgentBudget = Effect.fn("lockAgentBudget")(function* (
  billingOwnerUserId: string
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-budget:${billingOwnerUserId}`}, 0))`;
});
/** No turn contents enter this admission or usage path. Unknown runs retain reservations. */
export const reserveChannelTurn = Effect.fn("reserveChannelTurn")(function* (
  principal: ChannelPrincipal,
  id: string
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql
    .withTransaction(
      Effect.gen(function* () {
        const owners = yield* sql<{
          billingOwnerUserId: string;
        }>`SELECT w.billing_owner_user_id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      JOIN agent_beta_invites i ON i.user_id = wm.user_id AND i.revoked_at IS NULL
      WHERE w.id = ${principal.workspaceId} AND wm.user_id = ${principal.userId} AND w.deleted_at IS NULL`;
        const owner = owners[0]?.billingOwnerUserId;
        if (!owner) {
          return yield* new ForbiddenError({
            message: "Workspace beta access is unavailable",
          });
        }
        yield* lockAgentBudget(owner);
        const prior = yield* sql<{
          userId: string;
          workspaceId: string;
          state: string;
        }>`SELECT user_id, workspace_id, state FROM agent_channel_turns WHERE id = ${id}`;
        if (prior[0]) {
          if (
            prior[0].userId !== principal.userId ||
            prior[0].workspaceId !== principal.workspaceId
          ) {
            return yield* new ForbiddenError({
              message: "Turn owner mismatch",
            });
          }
          return;
        }
        yield* sql`INSERT INTO agent_workspaces (id, user_id, workspace_id, runtime_gadget_key, access_tier, monthly_budget_micros)
      VALUES (${crypto.randomUUID()}, ${principal.userId}, ${principal.workspaceId}, ${`workspace:${principal.workspaceId}`}, 'beta', 5000000)
      ON CONFLICT (user_id, workspace_id) WHERE deleted_at IS NULL DO NOTHING`;
        const agents = yield* sql<{
          id: string;
          state: string;
          monthlyBudgetMicros: string;
          dailyBudgetMicros: string;
        }>`SELECT id, state, monthly_budget_micros::text, daily_budget_micros::text
      FROM agent_workspaces WHERE user_id = ${principal.userId} AND workspace_id = ${principal.workspaceId} AND deleted_at IS NULL FOR UPDATE`;
        const agent = agents[0];
        if (!agent || agent.state !== "active") {
          return yield* new ForbiddenError({
            message: "Agent workspace is disabled",
          });
        }
        const totals = yield* sql<{ monthly: string; daily: string }>`SELECT
      COALESCE(SUM(CASE entry_type WHEN 'release' THEN -cost_micros ELSE cost_micros END), 0)::text AS monthly,
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN CASE entry_type WHEN 'release' THEN -cost_micros ELSE cost_micros END ELSE 0 END), 0)::text AS daily
      FROM agent_usage_ledger WHERE billing_owner_user_id = ${owner} AND created_at >= date_trunc('month', now())`;
        const counts = yield* sql<{ count: string }>`SELECT (
      (SELECT count(*) FROM agent_channel_turns WHERE billing_owner_user_id = ${owner} AND state = 'active') +
      (SELECT count(*) FROM agent_runs r JOIN workspaces w ON w.id = r.workspace_id WHERE w.billing_owner_user_id = ${owner} AND r.status IN ('queued','submitted','running','waiting_approval','interrupting'))
      )::text AS count`;
        if (
          Number(counts[0]?.count ?? 0) >= 2 ||
          Number(totals[0]?.monthly ?? 0) + RESERVATION >
            Math.min(5_000_000, Number(agent.monthlyBudgetMicros)) ||
          Number(totals[0]?.daily ?? 0) + RESERVATION >
            Math.min(1_000_000, Number(agent.dailyBudgetMicros))
        ) {
          return yield* new ConflictError({
            message:
              "Your agent allowance is exhausted or two tasks are already active. Try again after they finish.",
            resource: "agent-usage",
          });
        }
        yield* sql`INSERT INTO agent_channel_turns (id, user_id, workspace_id, agent_workspace_id, billing_owner_user_id, reserved_micros, state, expires_at)
      VALUES (${id}, ${principal.userId}, ${principal.workspaceId}, ${agent.id}, ${owner}, ${RESERVATION}, 'active', now() + interval '20 minutes')`;
        yield* sql`INSERT INTO agent_usage_ledger (id, billing_owner_user_id, agent_workspace_id, entry_type, idempotency_key, cost_micros)
      VALUES (${crypto.randomUUID()}, ${owner}, ${agent.id}, 'reservation', ${`channel:${id}:reserve`}, ${RESERVATION})`;
      })
    )
    .pipe(Effect.catchTag("SqlError", Effect.die));
});

export const settleChannelTurn = Effect.fn("settleChannelTurn")(function* (
  id: string,
  usage?: AgentRuntimeUsage
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql
    .withTransaction(
      Effect.gen(function* () {
        const rows = yield* sql<{
          billingOwnerUserId: string;
          agentWorkspaceId: string;
          reservedMicros: string;
          state: string;
        }>`SELECT billing_owner_user_id, agent_workspace_id, reserved_micros::text, state
      FROM agent_channel_turns WHERE id = ${id} FOR UPDATE`;
        const row = rows[0];
        if (!row || row.state !== "active") {
          return;
        }
        const known =
          usage &&
          [
            usage.costMicros,
            usage.inputTokens,
            usage.outputTokens,
            usage.cachedInputTokens,
          ].every((n) => Number.isSafeInteger(n) && n >= 0);
        if (known) {
          yield* sql`INSERT INTO agent_usage_ledger (id, billing_owner_user_id, agent_workspace_id, entry_type, idempotency_key, cost_micros)
        VALUES (${crypto.randomUUID()}, ${row.billingOwnerUserId}, ${row.agentWorkspaceId}, 'release', ${`channel:${id}:release`}, ${row.reservedMicros}) ON CONFLICT (idempotency_key) DO NOTHING`;
          yield* sql`INSERT INTO agent_usage_ledger (id, billing_owner_user_id, agent_workspace_id, entry_type, idempotency_key, cost_micros, provider, model, input_tokens, output_tokens, cached_input_tokens)
        VALUES (${crypto.randomUUID()}, ${row.billingOwnerUserId}, ${row.agentWorkspaceId}, 'actual', ${`channel:${id}:actual`}, ${usage.costMicros}, ${usage.provider}, ${usage.model}, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.cachedInputTokens}) ON CONFLICT (idempotency_key) DO NOTHING`;
        }
        yield* sql`UPDATE agent_channel_turns SET state = ${known ? "settled" : "unknown"}, settled_at = now() WHERE id = ${id}`;
      })
    )
    .pipe(Effect.orDie);
});
