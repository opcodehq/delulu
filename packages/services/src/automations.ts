import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@delulu/contracts";
import {
  Automation,
  type AutomationNote,
  AutomationPersistenceError,
  type AutomationStep,
  type AutomationTrigger,
  automationStepValidationIssues,
  automationTriggerTargetMode,
  automationTriggerValidationIssues,
  makeAutomationRepository,
} from "@delulu/core/domain/automation";
import {
  AutomationId,
  type ConnectionId,
  makeId,
  type WorkspaceId,
} from "@delulu/core/kernel/ids";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { AutomationKvService } from "./automation-kv";
import { JobService } from "./jobs";

export interface AutomationWriteInput {
  readonly connectionId: ConnectionId;
  readonly idempotencyKey?: string;
  readonly platform: "instagram";
  readonly category: string;
  readonly name: string;
  readonly description?: string | null;
  readonly enabled?: boolean;
  readonly triggers: readonly AutomationTrigger[];
  readonly steps: readonly AutomationStep[];
  readonly notes?: readonly AutomationNote[];
  readonly nodePositions?: Readonly<
    Record<string, { readonly x: number; readonly y: number }>
  >;
}
export interface AutomationPatchInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly enabled?: boolean;
  readonly triggers?: readonly AutomationTrigger[];
  readonly steps?: readonly AutomationStep[];
  readonly notes?: readonly AutomationNote[];
  readonly nodePositions?: Readonly<
    Record<string, { readonly x: number; readonly y: number }>
  >;
}
export interface Page<A> {
  readonly data: readonly A[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
export interface AutomationRunItem {
  readonly id: string;
  readonly automationId: string;
  readonly status: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output: Readonly<Record<string, unknown>>;
  readonly error: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}
export interface AutomationInboxItem {
  readonly sessionId: string;
  readonly automationId: string;
  readonly platformUserId: string;
  readonly platformUsername: string | null;
  readonly currentStepId: string;
  readonly status: string;
  readonly lastActivityAt: string;
}

const RunRow = Schema.Struct({
  id: Schema.String,
  automationId: Schema.String,
  status: Schema.String,
  input: Schema.Record(Schema.String, Schema.Unknown),
  output: Schema.Record(Schema.String, Schema.Unknown),
  error: Schema.NullOr(Schema.String),
  startedAt: Schema.String,
  completedAt: Schema.NullOr(Schema.String),
});
const InboxRow = Schema.Struct({
  sessionId: Schema.String,
  automationId: Schema.String,
  platformUserId: Schema.String,
  platformUsername: Schema.NullOr(Schema.String),
  currentStepId: Schema.String,
  status: Schema.String,
  lastActivityAt: Schema.String,
});

const persistenceError = (operation: string, cause: unknown) =>
  new AutomationPersistenceError({
    operation,
    message: `Automation ${operation} failed`,
    cause,
  });

export const ALL_MEDIA_TRIGGER_ID = "*";

export const automationTriggerIndexIds = (
  triggers: readonly AutomationTrigger[]
): string[] => [
  ...new Set(
    triggers.flatMap((trigger) =>
      automationTriggerTargetMode(trigger) === "all"
        ? [ALL_MEDIA_TRIGGER_ID]
        : trigger.targetPostIds
    )
  ),
];

export class AutomationService extends Context.Service<
  AutomationService,
  {
    readonly list: (
      workspaceId: string,
      limit: number,
      offset: number,
      platform: string,
      category: string
    ) => Effect.Effect<Page<Automation>, AutomationPersistenceError>;
    readonly get: (
      workspaceId: string,
      id: string,
      platform?: string,
      category?: string
    ) => Effect.Effect<Automation, AutomationPersistenceError | NotFoundError>;
    readonly create: (
      workspaceId: WorkspaceId,
      input: AutomationWriteInput
    ) => Effect.Effect<
      Automation,
      | AutomationPersistenceError
      | NotFoundError
      | ConflictError
      | ValidationError
    >;
    readonly update: (
      workspaceId: string,
      id: string,
      patch: AutomationPatchInput
    ) => Effect.Effect<
      Automation,
      AutomationPersistenceError | NotFoundError | ValidationError
    >;
    readonly remove: (
      workspaceId: string,
      id: string
    ) => Effect.Effect<void, AutomationPersistenceError | NotFoundError>;
    readonly listRuns: (
      workspaceId: string,
      limit: number,
      offset: number,
      platform: string,
      category: string,
      automationId?: string
    ) => Effect.Effect<Page<AutomationRunItem>, AutomationPersistenceError>;
    readonly inbox: (
      workspaceId: string,
      limit: number,
      offset: number,
      platform: string,
      category: string
    ) => Effect.Effect<Page<AutomationInboxItem>, AutomationPersistenceError>;
    readonly findForTrigger: (
      profileId: string,
      mediaId: string
    ) => Effect.Effect<readonly Automation[], AutomationPersistenceError>;
    readonly repairTrigger: (
      profileId: string,
      mediaId: string
    ) => Effect.Effect<void, AutomationPersistenceError>;
  }
>()("@delulu/services/AutomationService") {
  static readonly layer = Layer.effect(
    AutomationService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repo = yield* makeAutomationRepository();
      const kv = yield* AutomationKvService;
      const jobs = yield* JobService;
      const scheduleRepair = (profileId: string, mediaId: string) =>
        jobs.enqueue({
          workspaceId: profileId,
          payload: { _tag: "RepairAutomation", profileId, mediaId },
          runAt: new Date(),
          idempotencyKey: `automation-repair:${profileId}:${mediaId}`,
        });
      const scheduleExistingPairs = (automationId: string) =>
        Effect.gen(function* () {
          const pairs = yield* sql<{
            profileId: string;
            mediaId: string;
          }>`SELECT profile_id, media_id
          FROM automation_trigger_index WHERE automation_id = ${automationId}`;
          for (const pair of pairs) {
            yield* scheduleRepair(pair.profileId, pair.mediaId);
          }
        });
      // Hyperdrive does not invalidate cached SELECTs after writes. A stable
      // function makes mutable automation reads ineligible for query caching.
      const freshRead = sql`CURRENT_TIMESTAMP IS NOT NULL`;

      const findOne = SqlSchema.findOneOption({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          id: Schema.String,
          platform: Schema.optional(Schema.String),
          category: Schema.optional(Schema.String),
        }),
        Result: Automation,
        execute: ({ workspaceId, id, platform, category }) =>
          sql`SELECT * FROM automations WHERE ${freshRead} AND workspace_id = ${workspaceId} AND id = ${id} ${platform ? sql`AND platform = ${platform}` : sql``} ${category ? sql`AND category = ${category}` : sql``}`,
      });
      const get = Effect.fn("AutomationService.get")(function* (
        workspaceId: string,
        id: string,
        platform?: string,
        category?: string
      ) {
        const row = yield* findOne({
          workspaceId,
          id,
          platform,
          category,
        }).pipe(Effect.mapError((cause) => persistenceError("load", cause)));
        return yield* Option.match(row, {
          onNone: () =>
            new NotFoundError({
              message: "Automation not found",
              resource: "automation",
            }),
          onSome: Effect.succeed,
        });
      });
      const refreshPair = Effect.fn("AutomationService.refreshPair")(function* (
        profileId: string,
        mediaId: string
      ) {
        const rows = yield* sql<{
          automationId: AutomationId;
        }>`SELECT automation_id FROM automation_trigger_index WHERE ${freshRead} AND profile_id = ${profileId} AND media_id = ${mediaId} AND enabled = true ORDER BY automation_id`.pipe(
          Effect.mapError((cause) =>
            persistenceError("load trigger index", cause)
          )
        );
        const automationIds = rows.map((row) => row.automationId);
        const write = yield* (
          mediaId === ALL_MEDIA_TRIGGER_ID
            ? kv.putAllTriggerIds(profileId, automationIds)
            : kv.putTriggerIds(profileId, mediaId, automationIds)
        ).pipe(Effect.result);
        if (write._tag === "Failure") {
          yield* Effect.logWarning(
            "Automation KV write-through failed",
            write.failure
          );
          return yield* Effect.fail(
            persistenceError("repair trigger", write.failure)
          );
        }
      });
      const indexAutomation = Effect.fn("AutomationService.indexAutomation")(
        function* (automation: Automation) {
          const connection = yield* sql<{
            profileId: string;
          }>`SELECT profile_id FROM active_connections WHERE id = ${automation.connectionId} AND workspace_id = ${automation.workspaceId}`;
          if (!connection[0]) {
            return yield* persistenceError(
              "index",
              new Error("Connection not found")
            );
          }
          const mediaIds = automationTriggerIndexIds(automation.triggers);
          yield* scheduleExistingPairs(automation.id);
          yield* sql`DELETE FROM automation_trigger_index WHERE automation_id = ${automation.id}`;
          for (const mediaId of mediaIds) {
            yield* sql`INSERT INTO automation_trigger_index (automation_id, connection_id, profile_id, media_id, enabled) VALUES (${automation.id}, ${automation.connectionId}, ${connection[0].profileId}, ${mediaId}, ${automation.enabled})`;
            yield* scheduleRepair(connection[0].profileId, mediaId);
          }
          return { profileId: connection[0].profileId, mediaIds };
        }
      );
      const syncPairs = Effect.fn("AutomationService.syncPairs")(function* (
        profileId: string,
        mediaIds: readonly string[]
      ) {
        for (const mediaId of new Set(mediaIds)) {
          yield* refreshPair(profileId, mediaId).pipe(
            Effect.catch((error) =>
              Effect.logWarning("Deferred automation trigger repair", error)
            )
          );
        }
      });

      const listQuery = SqlSchema.findAll({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          limit: Schema.Number,
          offset: Schema.Number,
          platform: Schema.optional(Schema.String),
          category: Schema.optional(Schema.String),
        }),
        Result: Automation,
        execute: ({ workspaceId, limit, offset, platform, category }) =>
          sql`SELECT * FROM automations WHERE ${freshRead} AND workspace_id = ${workspaceId} ${platform ? sql`AND platform = ${platform}` : sql``} ${category ? sql`AND category = ${category}` : sql``} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      });
      const list = Effect.fn("AutomationService.list")(function* (
        workspaceId: string,
        limit: number,
        offset: number,
        platform: string,
        category: string
      ) {
        const data = yield* listQuery({
          workspaceId,
          limit,
          offset,
          platform,
          category,
        }).pipe(Effect.mapError((cause) => persistenceError("list", cause)));
        const count = yield* sql<{
          total: string;
        }>`SELECT count(*)::text AS total FROM automations WHERE ${freshRead} AND workspace_id = ${workspaceId} AND platform = ${platform} AND category = ${category}`.pipe(
          Effect.mapError((cause) => persistenceError("count", cause))
        );
        return { data, total: Number(count[0]?.total ?? 0), limit, offset };
      });
      const create = Effect.fn("AutomationService.create")(function* (
        workspaceId: WorkspaceId,
        input: AutomationWriteInput
      ) {
        const issues = [
          ...automationTriggerValidationIssues(input.triggers),
          ...automationStepValidationIssues(input.steps),
        ];
        if (issues.length > 0) {
          return yield* new ValidationError({
            message: "Automation configuration is invalid",
            issues: [...issues],
          });
        }
        const connection = yield* sql<{
          platform: string;
        }>`SELECT platform FROM active_connections
            WHERE id = ${input.connectionId}
              AND workspace_id = ${workspaceId}`.pipe(
          Effect.mapError((cause) =>
            persistenceError("validate connection", cause)
          )
        );
        if (!connection[0]) {
          return yield* new NotFoundError({
            message: "Automation connection not found",
            resource: "connection",
          });
        }
        if (connection[0].platform !== "INSTAGRAM") {
          return yield* new ConflictError({
            message: "DM automations require an Instagram connection",
            resource: "connection",
          });
        }
        const result = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              if (input.idempotencyKey) {
                yield* sql`SELECT pg_advisory_xact_lock(
                  hashtext(${`${workspaceId}:${input.idempotencyKey}`})
                )`;
                const existing = yield* sql<
                  Record<string, unknown>
                >`SELECT * FROM automations
                    WHERE ${freshRead}
                      AND workspace_id = ${workspaceId}
                      AND external_submission_id = ${input.idempotencyKey}
                    LIMIT 1`;
                if (existing[0]) {
                  return {
                    inserted: Schema.decodeUnknownSync(Automation)(existing[0]),
                    indexed: null,
                  };
                }
              }
              const inserted = yield* repo.insert(
                Automation.insert.make({
                  id: makeId(AutomationId),
                  legacyConvexId: null,
                  externalSubmissionId: input.idempotencyKey ?? null,
                  workspaceId,
                  connectionId: input.connectionId,
                  platform: input.platform,
                  category: input.category,
                  triggerConfig: {},
                  name: input.name,
                  description: input.description ?? null,
                  triggers: [...input.triggers],
                  steps: [...input.steps],
                  notes: [...(input.notes ?? [])],
                  nodePositions: input.nodePositions ?? {},
                  totalTriggered: 0,
                  totalDmsSent: 0,
                  totalFailed: 0,
                  enabled: input.enabled ?? true,
                })
              );
              const indexed = yield* indexAutomation(inserted);
              return { inserted, indexed };
            })
          )
          .pipe(Effect.mapError((cause) => persistenceError("create", cause)));
        if (result.indexed) {
          yield* syncPairs(result.indexed.profileId, result.indexed.mediaIds);
        }
        return result.inserted;
      });
      const update = Effect.fn("AutomationService.update")(function* (
        workspaceId: string,
        id: string,
        patch: AutomationPatchInput
      ) {
        const current = yield* get(workspaceId, id);
        const oldConnection = yield* sql<{
          profileId: string;
        }>`SELECT profile_id FROM connections WHERE id = ${current.connectionId}`.pipe(
          Effect.mapError((cause) => persistenceError("load connection", cause))
        );
        const nextTriggers = patch.triggers ?? current.triggers;
        const nextSteps = patch.steps ?? current.steps;
        const issues = [
          ...automationTriggerValidationIssues(nextTriggers),
          ...automationStepValidationIssues(nextSteps),
        ];
        if (issues.length > 0) {
          return yield* new ValidationError({
            message: "Automation configuration is invalid",
            issues: [...issues],
          });
        }
        const nextNotes = patch.notes ?? current.notes;
        const nextPositions = patch.nodePositions ?? current.nodePositions;
        const result = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`UPDATE automations SET name = ${patch.name ?? current.name}, description = ${patch.description === undefined ? current.description : patch.description}, enabled = ${patch.enabled ?? current.enabled}, triggers = ${JSON.stringify(nextTriggers)}::jsonb, steps = ${JSON.stringify(nextSteps)}::jsonb, notes = ${JSON.stringify(nextNotes)}::jsonb, node_positions = ${JSON.stringify(nextPositions)}::jsonb WHERE workspace_id = ${workspaceId} AND id = ${id}`;
              const updated = yield* get(workspaceId, id);
              const indexed = yield* indexAutomation(updated);
              return { updated, indexed };
            })
          )
          .pipe(Effect.mapError((cause) => persistenceError("update", cause)));
        yield* syncPairs(result.indexed.profileId, [
          ...automationTriggerIndexIds(current.triggers),
          ...result.indexed.mediaIds,
        ]);
        if (
          oldConnection[0] &&
          oldConnection[0].profileId !== result.indexed.profileId
        ) {
          yield* syncPairs(
            oldConnection[0].profileId,
            automationTriggerIndexIds(current.triggers)
          );
        }
        return result.updated;
      });
      const remove = Effect.fn("AutomationService.remove")(function* (
        workspaceId: string,
        id: string
      ) {
        const current = yield* get(workspaceId, id);
        const connection = yield* sql<{
          profileId: string;
        }>`SELECT profile_id FROM connections WHERE id = ${current.connectionId}`.pipe(
          Effect.mapError((cause) => persistenceError("load connection", cause))
        );
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* scheduleExistingPairs(id);
              yield* sql`DELETE FROM automations WHERE workspace_id = ${workspaceId} AND id = ${id}`;
            })
          )
          .pipe(Effect.mapError((cause) => persistenceError("delete", cause)));
        if (connection[0]) {
          yield* syncPairs(
            connection[0].profileId,
            automationTriggerIndexIds(current.triggers)
          );
        }
      });

      const runsQuery = SqlSchema.findAll({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          limit: Schema.Number,
          offset: Schema.Number,
          platform: Schema.String,
          category: Schema.String,
          automationId: Schema.optional(Schema.String),
        }),
        Result: RunRow,
        execute: ({
          workspaceId,
          limit,
          offset,
          platform,
          category,
          automationId,
        }) =>
          automationId
            ? sql`SELECT r.id, r.automation_id, r.status, r.input, r.output, r.error, r.started_at::text, r.completed_at::text FROM automation_runs r JOIN automations a ON a.id = r.automation_id WHERE r.workspace_id = ${workspaceId} AND a.platform = ${platform} AND a.category = ${category} AND r.automation_id = ${automationId} ORDER BY r.started_at DESC LIMIT ${limit} OFFSET ${offset}`
            : sql`SELECT r.id, r.automation_id, r.status, r.input, r.output, r.error, r.started_at::text, r.completed_at::text FROM automation_runs r JOIN automations a ON a.id = r.automation_id WHERE r.workspace_id = ${workspaceId} AND a.platform = ${platform} AND a.category = ${category} ORDER BY r.started_at DESC LIMIT ${limit} OFFSET ${offset}`,
      });
      const listRuns = Effect.fn("AutomationService.listRuns")(function* (
        workspaceId: string,
        limit: number,
        offset: number,
        platform: string,
        category: string,
        automationId?: string
      ) {
        const data = yield* runsQuery({
          workspaceId,
          limit,
          offset,
          platform,
          category,
          automationId,
        }).pipe(
          Effect.mapError((cause) => persistenceError("list runs", cause))
        );
        const count = yield* sql<{
          total: string;
        }>`SELECT count(*)::text AS total FROM automation_runs r JOIN automations a ON a.id = r.automation_id WHERE r.workspace_id = ${workspaceId} AND a.platform = ${platform} AND a.category = ${category} ${automationId ? sql`AND r.automation_id = ${automationId}` : sql``}`.pipe(
          Effect.mapError((cause) => persistenceError("count runs", cause))
        );
        return { data, total: Number(count[0]?.total ?? 0), limit, offset };
      });
      const inboxQuery = SqlSchema.findAll({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          limit: Schema.Number,
          offset: Schema.Number,
          platform: Schema.String,
          category: Schema.String,
        }),
        Result: InboxRow,
        execute: ({ workspaceId, limit, offset, platform, category }) =>
          sql`SELECT s.id AS session_id, s.automation_id, s.platform_user_id, s.platform_username, s.current_step_id, s.status, s.last_activity_at::text FROM automation_sessions s JOIN automations a ON a.id = s.automation_id WHERE s.workspace_id = ${workspaceId} AND a.platform = ${platform} AND a.category = ${category} ORDER BY s.last_activity_at DESC LIMIT ${limit} OFFSET ${offset}`,
      });
      const inbox = Effect.fn("AutomationService.inbox")(function* (
        workspaceId: string,
        limit: number,
        offset: number,
        platform: string,
        category: string
      ) {
        const data = yield* inboxQuery({
          workspaceId,
          limit,
          offset,
          platform,
          category,
        }).pipe(
          Effect.mapError((cause) => persistenceError("load inbox", cause))
        );
        const count = yield* sql<{
          total: string;
        }>`SELECT count(*)::text AS total FROM automation_sessions s JOIN automations a ON a.id = s.automation_id WHERE s.workspace_id = ${workspaceId} AND a.platform = ${platform} AND a.category = ${category}`.pipe(
          Effect.mapError((cause) => persistenceError("count inbox", cause))
        );
        return { data, total: Number(count[0]?.total ?? 0), limit, offset };
      });

      const loadByIds = SqlSchema.findAll({
        Request: Schema.Struct({
          ids: Schema.Array(AutomationId),
          profileId: Schema.String,
        }),
        Result: Automation,
        execute: ({ ids, profileId }) =>
          sql`SELECT DISTINCT a.* FROM automations a JOIN automation_trigger_index t ON t.automation_id = a.id WHERE ${freshRead} AND a.id IN ${sql.in(ids)} AND a.enabled = true AND t.enabled = true AND t.profile_id = ${profileId}`,
      });
      const findForTrigger = Effect.fn("AutomationService.findForTrigger")(
        function* (profileId: string, mediaId: string) {
          const loadIds = Effect.fn("AutomationService.loadTriggerIds")(
            function* (targetId: string) {
              const cached = yield* (
                targetId === ALL_MEDIA_TRIGGER_ID
                  ? kv.getAllTriggerIds(profileId)
                  : kv.getTriggerIds(profileId, targetId)
              ).pipe(Effect.catch(() => Effect.succeed(null)));
              if (
                cached !== null &&
                (targetId === ALL_MEDIA_TRIGGER_ID || cached.length > 0)
              ) {
                return cached;
              }
              const rows = yield* sql<{
                automationId: AutomationId;
              }>`SELECT automation_id FROM automation_trigger_index WHERE ${freshRead} AND profile_id = ${profileId} AND media_id = ${targetId} AND enabled = true`.pipe(
                Effect.mapError((cause) =>
                  persistenceError("load trigger fallback", cause)
                )
              );
              const automationIds = rows.map((row) => row.automationId);
              yield* (
                targetId === ALL_MEDIA_TRIGGER_ID
                  ? kv.putAllTriggerIds(profileId, automationIds)
                  : kv.putTriggerIds(profileId, targetId, automationIds)
              ).pipe(
                Effect.catch((error) =>
                  Effect.logWarning("Automation KV repair failed", error)
                )
              );
              return automationIds;
            }
          );
          const ids = [
            ...new Set([
              ...(yield* loadIds(mediaId)),
              ...(yield* loadIds(ALL_MEDIA_TRIGGER_ID)),
            ]),
          ];
          return ids.length === 0
            ? []
            : yield* loadByIds({
                ids,
                profileId,
              }).pipe(
                Effect.mapError((cause) =>
                  persistenceError("load triggers", cause)
                )
              );
        }
      );
      return AutomationService.of({
        list,
        get,
        create,
        update,
        remove,
        listRuns,
        inbox,
        findForTrigger,
        repairTrigger: refreshPair,
      });
    })
  );
}
