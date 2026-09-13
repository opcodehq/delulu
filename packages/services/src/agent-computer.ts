import {
  type AgentComputerView,
  type AgentTaskView,
  ConflictError,
  NotFoundError,
  type ProviderUnavailableError,
} from "@delulu/contracts";
import {
  AgentCommandId,
  AgentComputerId,
  type AgentNetworkPolicy,
  AgentTaskId,
  makeId,
  type UserId,
  type WorkspaceId,
} from "@delulu/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { ExecutionWorkspaceProvider } from "./execution-workspace";

type ComputerView = typeof AgentComputerView.Type;
type TaskView = typeof AgentTaskView.Type;
type Row = Record<string, unknown>;

const toComputer = (row: Row): ComputerView => ({
  id: String(row.id),
  workspaceId: String(row.workspaceId),
  state: row.state as ComputerView["state"],
  networkPolicy: row.networkPolicy as ComputerView["networkPolicy"],
  environmentVersion: Number(row.environmentVersion),
  lastActivityAt: new Date(row.lastActivityAt as string | Date).toISOString(),
  failureReason: row.failureReason === null ? null : String(row.failureReason),
  createdAt: new Date(row.createdAt as string | Date).toISOString(),
  updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
});

const toTask = (row: Row): TaskView => ({
  id: String(row.id),
  computerId: String(row.computerId),
  workspaceId: String(row.workspaceId),
  objective: String(row.objective),
  status: row.status as TaskView["status"],
  networkPolicy: row.networkPolicy as TaskView["networkPolicy"],
  exitCode: row.exitCode === null ? null : Number(row.exitCode),
  output: String(row.output ?? ""),
  outputTruncated: Boolean(row.outputTruncated),
  error: row.error === null ? null : String(row.error),
  createdAt: new Date(row.createdAt as string | Date).toISOString(),
  completedAt:
    row.completedAt === null
      ? null
      : new Date(row.completedAt as string | Date).toISOString(),
});

export class AgentComputerService extends Context.Service<
  AgentComputerService,
  {
    readonly get: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<ComputerView | null>;
    readonly enable: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly networkPolicy: AgentNetworkPolicy;
      readonly approvedDomains?: readonly string[];
    }) => Effect.Effect<ComputerView, ConflictError | ProviderUnavailableError>;
    readonly resume: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<ComputerView, NotFoundError | ProviderUnavailableError>;
    readonly pause: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<ComputerView, NotFoundError | ProviderUnavailableError>;
    readonly remove: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<void, NotFoundError | ProviderUnavailableError>;
    readonly listTasks: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<readonly TaskView[]>;
    readonly runTask: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly objective: string;
      readonly command: string;
      readonly workingDirectory?: string;
      readonly idempotencyKey: string;
      readonly timeoutSeconds: number;
    }) => Effect.Effect<
      TaskView,
      ConflictError | NotFoundError | ProviderUnavailableError
    >;
    readonly runPending: (limit: number) => Effect.Effect<number>;
  }
>()("@delulu/services/AgentComputerService") {
  static readonly layer = Layer.effect(
    AgentComputerService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const provider = yield* ExecutionWorkspaceProvider;
      const rowsFor = (workspaceId: WorkspaceId, userId: UserId) =>
        sql<Row>`SELECT id, workspace_id, provider_sandbox_id, state, network_policy, environment_version,
          last_activity_at, failure_reason, created_at, updated_at FROM agent_computers
          WHERE workspace_id = ${workspaceId} AND user_id = ${userId} AND deleted_at IS NULL LIMIT 1`.pipe(
          Effect.orDie
        );
      const get = Effect.fn("AgentComputerService.get")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const rows = yield* rowsFor(workspaceId, userId);
        return rows[0] ? toComputer(rows[0]) : null;
      });
      const requireComputer = Effect.fn("AgentComputerService.require")(
        function* (workspaceId: WorkspaceId, userId: UserId) {
          const rows = yield* rowsFor(workspaceId, userId);
          if (!rows[0]) {
            return yield* new NotFoundError({
              message: "Agent computer is not enabled",
              resource: "agent-computer",
            });
          }
          return rows[0];
        }
      );
      const enable = Effect.fn("AgentComputerService.enable")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly networkPolicy: AgentNetworkPolicy;
          readonly approvedDomains?: readonly string[];
        }) {
          const existingRows = yield* rowsFor(input.workspaceId, input.userId);
          const existing = existingRows[0];
          if (
            existing &&
            !(existing.state === "provisioning" && !existing.providerSandboxId)
          ) {
            return toComputer(existing);
          }
          const id = existing ? String(existing.id) : makeId(AgentComputerId);
          const inserted = existing
            ? [{ id }]
            : yield* sql<Row>`INSERT INTO agent_computers (id, user_id, workspace_id, provider, state, network_policy, approved_domains)
          VALUES (${id}, ${input.userId}, ${input.workspaceId}, 'execution-workspace', 'provisioning',
            ${input.networkPolicy}, ${JSON.stringify(input.approvedDomains ?? [])}::jsonb)
          ON CONFLICT DO NOTHING RETURNING id`.pipe(Effect.orDie);
          if (!inserted[0]) {
            const raced = yield* get(input.workspaceId, input.userId);
            if (raced) {
              return raced;
            }
            return yield* new ConflictError({
              message: "Agent computer could not be reserved",
              resource: "agent-computer",
            });
          }
          const created = yield* provider
            .provision({
              computerId: id,
              workspaceId: input.workspaceId,
              userId: input.userId,
              networkPolicy: input.networkPolicy,
              approvedDomains: input.approvedDomains,
            })
            .pipe(
              Effect.tapError((error) =>
                sql`UPDATE agent_computers SET state = 'failed', failure_reason = ${error.message} WHERE id = ${id}`.pipe(
                  Effect.orDie
                )
              )
            );
          const rows =
            yield* sql<Row>`UPDATE agent_computers SET provider_sandbox_id = ${created.id},
          state = ${created.state}, failure_reason = NULL, last_activity_at = now() WHERE id = ${id}
          RETURNING id, workspace_id, state, network_policy, environment_version, last_activity_at, failure_reason,
            created_at, updated_at`.pipe(Effect.orDie);
          if (!rows[0]) {
            return yield* new ConflictError({
              message: "Agent computer could not be created",
              resource: "agent-computer",
            });
          }
          return toComputer(rows[0]);
        }
      );
      const changeState = (action: "resume" | "pause") =>
        Effect.fn(`AgentComputerService.${action}`)(function* (
          workspaceId: WorkspaceId,
          userId: UserId
        ) {
          const row = yield* requireComputer(workspaceId, userId);
          if (row.state === "failed") {
            return yield* new NotFoundError({
              message: "Failed execution workspace must be replaced",
              resource: "agent-computer",
            });
          }
          if (!row.providerSandboxId) {
            return yield* new NotFoundError({
              message: "Execution workspace is unavailable",
              resource: "agent-computer",
            });
          }
          yield* action === "resume"
            ? provider.resume(String(row.providerSandboxId))
            : provider.pause(String(row.providerSandboxId));
          const rows =
            yield* sql<Row>`UPDATE agent_computers SET state = ${action === "resume" ? "running" : "paused"},
            last_activity_at = now() WHERE id = ${String(row.id)} RETURNING id, workspace_id, state, network_policy,
            environment_version, last_activity_at, failure_reason, created_at, updated_at`.pipe(
              Effect.orDie
            );
          return toComputer(rows[0]!);
        });
      const remove = Effect.fn("AgentComputerService.remove")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const row = yield* requireComputer(workspaceId, userId);
        if (row.providerSandboxId) {
          yield* provider.destroy(String(row.providerSandboxId));
        }
        yield* sql`UPDATE agent_computers SET state = 'deleted', deleted_at = now() WHERE id = ${String(row.id)}`.pipe(
          Effect.orDie
        );
      });
      const listTasks = Effect.fn("AgentComputerService.listTasks")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const rows =
          yield* sql<Row>`SELECT t.id, t.computer_id, t.workspace_id, t.objective,
          t.status, t.network_policy, t.error, t.created_at, t.completed_at, c.exit_code,
          COALESCE(c.stdout_preview, '') AS output, COALESCE(c.output_truncated, false) AS output_truncated
          FROM agent_tasks t JOIN agent_computers ac ON ac.id = t.computer_id
          LEFT JOIN LATERAL (SELECT exit_code, stdout_preview, output_truncated FROM agent_commands
            WHERE task_id = t.id ORDER BY sequence DESC LIMIT 1) c ON true
          WHERE t.workspace_id = ${workspaceId} AND t.user_id = ${userId}
          ORDER BY t.created_at DESC LIMIT 100`.pipe(Effect.orDie);
        return rows.map(toTask);
      });
      const taskById = Effect.fn("AgentComputerService.taskById")(function* (
        workspaceId: WorkspaceId,
        userId: UserId,
        taskId: string
      ) {
        const rows = yield* sql<Row>`SELECT t.id, t.computer_id, t.workspace_id,
          t.objective, t.status, t.network_policy, t.error, t.created_at,
          t.completed_at, c.exit_code, COALESCE(c.stdout_preview, '') AS output,
          COALESCE(c.output_truncated, false) AS output_truncated
          FROM agent_tasks t
          LEFT JOIN LATERAL (SELECT exit_code, stdout_preview, output_truncated
            FROM agent_commands WHERE task_id = t.id ORDER BY sequence DESC LIMIT 1) c ON true
          WHERE t.workspace_id = ${workspaceId} AND t.user_id = ${userId}
            AND t.id = ${taskId} LIMIT 1`.pipe(Effect.orDie);
        return rows[0] ? toTask(rows[0]) : null;
      });
      const runTask = Effect.fn("AgentComputerService.runTask")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly objective: string;
          readonly command: string;
          readonly workingDirectory?: string;
          readonly idempotencyKey: string;
          readonly timeoutSeconds: number;
        }) {
          const computer = yield* requireComputer(
            input.workspaceId,
            input.userId
          );
          if (!computer.providerSandboxId || computer.state === "failed") {
            return yield* new ConflictError({
              message: "Agent computer is not ready",
              resource: "agent-computer",
            });
          }
          const taskId = makeId(AgentTaskId);
          const commandId = makeId(AgentCommandId);
          const inserted = yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const rows =
                  yield* sql<Row>`INSERT INTO agent_tasks (id, computer_id, user_id, workspace_id, objective,
            status, network_policy, idempotency_key, timeout_seconds) VALUES (${taskId},
            ${String(computer.id)}, ${input.userId}, ${input.workspaceId}, ${input.objective}, 'queued',
            ${String(computer.networkPolicy)}, ${input.idempotencyKey}, ${input.timeoutSeconds})
            ON CONFLICT (user_id, workspace_id, idempotency_key) DO NOTHING RETURNING id`;
                if (rows[0]) {
                  yield* sql`INSERT INTO agent_commands (id, task_id, sequence, command, working_directory,
            status) VALUES (${commandId}, ${taskId}, 1, ${input.command},
            ${input.workingDirectory ?? "."}, 'queued')`;
                }
                return rows[0] ? taskId : null;
              })
            )
            .pipe(Effect.orDie);
          const selectedId =
            inserted ??
            (yield* sql<Row>`SELECT id FROM agent_tasks
            WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.userId}
              AND idempotency_key = ${input.idempotencyKey} LIMIT 1`.pipe(
              Effect.orDie
            ))[0]?.id;
          const completed = yield* taskById(
            input.workspaceId,
            input.userId,
            String(selectedId ?? "")
          );
          if (!completed) {
            return yield* new ConflictError({
              message: "Agent task result is unavailable",
              resource: "agent-task",
            });
          }
          return completed;
        }
      );
      const runPending = Effect.fn("AgentComputerService.runPending")(
        function* (limit: number) {
          const stale = yield* sql<Row>`SELECT t.id, ac.id AS computer_id,
            ac.provider_sandbox_id FROM agent_tasks t
            JOIN agent_computers ac ON ac.active_task_id = t.id
            WHERE t.status = 'running'
              AND t.started_at + (t.timeout_seconds + 60) * interval '1 second' < now()
              AND ac.provider_sandbox_id IS NOT NULL
            ORDER BY t.started_at LIMIT 20`.pipe(Effect.orDie);
          for (const row of stale) {
            const paused = yield* provider
              .pause(String(row.providerSandboxId))
              .pipe(Effect.result);
            if (paused._tag === "Failure") {
              continue;
            }
            yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* sql`UPDATE agent_commands SET status = 'failed',
                    stderr_preview = 'Task lease expired', completed_at = now()
                    WHERE task_id = ${String(row.id)} AND status = 'running'`;
                  yield* sql`UPDATE agent_tasks SET status = 'timed_out',
                    error = 'Task lease expired', completed_at = now()
                    WHERE id = ${String(row.id)} AND status = 'running'`;
                  yield* sql`UPDATE agent_computers SET active_task_id = NULL,
                    state = 'failed', failure_reason = 'Task lease expired'
                    WHERE id = ${String(row.computerId)} AND active_task_id = ${String(row.id)}`;
                })
              )
              .pipe(Effect.orDie);
          }
          let processed = 0;
          for (
            let index = 0;
            index < Math.max(0, Math.min(limit, 20));
            index += 1
          ) {
            const claimed = yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  const rows =
                    yield* sql<Row>`SELECT t.id, t.computer_id, t.timeout_seconds,
                  c.id AS command_id, c.command, c.working_directory, ac.provider_sandbox_id
                  FROM agent_tasks t JOIN agent_commands c ON c.task_id = t.id AND c.sequence = 1
                  JOIN agent_computers ac ON ac.id = t.computer_id
                  WHERE t.status = 'queued' AND ac.active_task_id IS NULL
                    AND ac.state IN ('running', 'paused')
                    AND ac.deleted_at IS NULL AND ac.provider_sandbox_id IS NOT NULL
                  ORDER BY t.created_at FOR UPDATE OF t, ac SKIP LOCKED LIMIT 1`;
                  const row = rows[0];
                  if (!row) {
                    return null;
                  }
                  yield* sql`UPDATE agent_tasks SET status = 'running', started_at = now() WHERE id = ${String(row.id)}`;
                  yield* sql`UPDATE agent_commands SET status = 'running', started_at = now() WHERE id = ${String(row.commandId)}`;
                  yield* sql`UPDATE agent_computers SET active_task_id = ${String(row.id)}, state = 'running',
                  last_activity_at = now() WHERE id = ${String(row.computerId)}`;
                  return row;
                })
              )
              .pipe(Effect.orDie);
            if (!claimed) {
              break;
            }
            const execution = yield* Effect.gen(function* () {
              yield* provider.resume(String(claimed.providerSandboxId));
              return yield* provider.execute({
                workspaceId: String(claimed.providerSandboxId),
                command: String(claimed.command),
                workingDirectory: String(claimed.workingDirectory),
                timeoutSeconds: Number(claimed.timeoutSeconds),
              });
            }).pipe(Effect.result);
            yield* sql
              .withTransaction(
                execution._tag === "Success"
                  ? Effect.gen(function* () {
                      const value = execution.success;
                      yield* sql`UPDATE agent_commands SET status = ${value.exitCode === 0 ? "completed" : "failed"},
                      exit_code = ${value.exitCode}, stdout_preview = ${value.output},
                      output_truncated = ${value.outputTruncated}, completed_at = now()
                      WHERE id = ${String(claimed.commandId)}`;
                      yield* sql`UPDATE agent_tasks SET status = ${value.exitCode === 0 ? "completed" : "failed"},
                      commands_used = 1, completed_at = now() WHERE id = ${String(claimed.id)}`;
                      yield* sql`UPDATE agent_computers SET active_task_id = NULL, last_activity_at = now()
                      WHERE id = ${String(claimed.computerId)}`;
                    })
                  : Effect.gen(function* () {
                      yield* sql`UPDATE agent_commands SET status = 'failed', stderr_preview = ${execution.failure.message},
                      completed_at = now() WHERE id = ${String(claimed.commandId)}`;
                      yield* sql`UPDATE agent_tasks SET status = 'failed', error = ${execution.failure.message},
                      completed_at = now() WHERE id = ${String(claimed.id)}`;
                      yield* sql`UPDATE agent_computers SET active_task_id = NULL WHERE id = ${String(claimed.computerId)}`;
                    })
              )
              .pipe(Effect.orDie);
            processed += 1;
          }
          return processed;
        }
      );
      return AgentComputerService.of({
        get,
        enable,
        resume: changeState("resume"),
        pause: changeState("pause"),
        remove,
        listTasks,
        runTask,
        runPending,
      });
    })
  );
}
