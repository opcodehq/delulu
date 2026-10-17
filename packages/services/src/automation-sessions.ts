import { AutomationPersistenceError } from "@delulu/core/domain/automation";
import {
  AutomationSession,
  AutomationSessionId,
} from "@delulu/core/domain/automation-session";
import {
  AutomationContactId,
  type AutomationId,
  makeId,
} from "@delulu/core/kernel/ids";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { AutomationKvService } from "./automation-kv";

const error = (operation: string, cause: unknown) =>
  new AutomationPersistenceError({
    operation,
    message: `Automation session ${operation} failed`,
    cause,
  });

export class AutomationSessionService extends Context.Service<
  AutomationSessionService,
  {
    readonly findActive: (
      profileId: string,
      platformUserId: string
    ) => Effect.Effect<AutomationSession | null, AutomationPersistenceError>;
    readonly start: (input: {
      readonly workspaceId: AutomationSession["workspaceId"];
      readonly automationId: AutomationId;
      readonly profileId: string;
      readonly platformUserId: string;
      readonly platformUsername: string | null;
      readonly currentStepId: string;
      readonly triggerEventId: string | null;
      readonly triggerMediaId: string | null;
      readonly variables?: Readonly<Record<string, unknown>>;
    }) => Effect.Effect<AutomationSession, AutomationPersistenceError>;
    readonly advance: (input: {
      readonly session: AutomationSession;
      readonly profileId: string;
      readonly currentStepId: string;
      readonly completed: boolean;
      readonly variables: Readonly<Record<string, unknown>>;
    }) => Effect.Effect<void, AutomationPersistenceError>;
    readonly upsertContact: (input: {
      readonly workspaceId: AutomationSession["workspaceId"];
      readonly automationId: AutomationId;
      readonly platformUserId: string;
      readonly email?: string;
      readonly metadata?: Readonly<Record<string, unknown>>;
    }) => Effect.Effect<void, AutomationPersistenceError>;
  }
>()("@delulu/services/AutomationSessionService") {
  static readonly layer = Layer.effect(
    AutomationSessionService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const kv = yield* AutomationKvService;
      const byId = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: AutomationSession,
        execute: (id) =>
          sql`SELECT * FROM automation_sessions WHERE id = ${id} AND status = 'active'`,
      });
      const fallback = SqlSchema.findOneOption({
        Request: Schema.Struct({
          profileId: Schema.String,
          platformUserId: Schema.String,
        }),
        Result: AutomationSession,
        execute: ({ profileId, platformUserId }) =>
          sql`SELECT s.* FROM automation_sessions s JOIN automations a ON a.id = s.automation_id JOIN active_connections c ON c.id = a.connection_id WHERE c.profile_id = ${profileId} AND s.platform_user_id = ${platformUserId} AND s.status = 'active' ORDER BY s.last_activity_at DESC LIMIT 1`,
      });
      const findActive = Effect.fn("AutomationSessionService.findActive")(
        function* (profileId: string, platformUserId: string) {
          const cachedId = yield* kv
            .getSession(profileId, platformUserId)
            .pipe(Effect.catch(() => Effect.succeed(null)));
          if (cachedId) {
            const cached = yield* byId(cachedId).pipe(
              Effect.mapError((cause) => error("load", cause))
            );
            if (Option.isSome(cached)) {
              return cached.value;
            }
          }
          const found = yield* fallback({ profileId, platformUserId }).pipe(
            Effect.mapError((cause) => error("fallback", cause))
          );
          if (Option.isNone(found)) {
            return null;
          }
          yield* kv
            .putSession({
              profileId,
              automationId: found.value.automationId,
              platformUserId,
              sessionId: found.value.id,
            })
            .pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Session KV repair failed", cause)
              )
            );
          return found.value;
        }
      );
      const start = Effect.fn("AutomationSessionService.start")(
        function* (input: {
          readonly workspaceId: AutomationSession["workspaceId"];
          readonly automationId: AutomationId;
          readonly profileId: string;
          readonly platformUserId: string;
          readonly platformUsername: string | null;
          readonly currentStepId: string;
          readonly triggerEventId: string | null;
          readonly triggerMediaId: string | null;
          readonly variables?: Readonly<Record<string, unknown>>;
        }) {
          const id = Schema.decodeUnknownSync(AutomationSessionId)(
            `automation_session_${crypto.randomUUID()}`
          );
          const now = yield* DateTime.now;
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`UPDATE automation_sessions SET status = 'expired', last_activity_at = ${DateTime.toDateUtc(now)} WHERE automation_id = ${input.automationId} AND platform_user_id = ${input.platformUserId} AND status = 'active'`;
                yield* sql`INSERT INTO automation_sessions (id, workspace_id, automation_id, platform_user_id, platform_username, current_step_id, trigger_event_id, trigger_media_id, status, variables, last_activity_at) VALUES (${id}, ${input.workspaceId}, ${input.automationId}, ${input.platformUserId}, ${input.platformUsername}, ${input.currentStepId}, ${input.triggerEventId}, ${input.triggerMediaId}, 'active', ${JSON.stringify(input.variables ?? {})}::jsonb, ${DateTime.toDateUtc(now)})`;
              })
            )
            .pipe(Effect.mapError((cause) => error("start", cause)));
          const session = yield* byId(id).pipe(
            Effect.mapError((cause) => error("reload", cause))
          );
          if (Option.isNone(session)) {
            return yield* error(
              "reload",
              new Error("Session was not persisted")
            );
          }
          yield* kv
            .putSession({
              profileId: input.profileId,
              automationId: input.automationId,
              platformUserId: input.platformUserId,
              sessionId: id,
            })
            .pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Session KV write-through failed", cause)
              )
            );
          return session.value;
        }
      );
      const advance = Effect.fn("AutomationSessionService.advance")(
        function* (input: {
          readonly session: AutomationSession;
          readonly profileId: string;
          readonly currentStepId: string;
          readonly completed: boolean;
          readonly variables: Readonly<Record<string, unknown>>;
        }) {
          const now = yield* DateTime.now;
          yield* sql`UPDATE automation_sessions SET current_step_id = ${input.currentStepId}, status = ${input.completed ? "completed" : "active"}, variables = ${JSON.stringify(input.variables)}::jsonb, last_activity_at = ${DateTime.toDateUtc(now)} WHERE id = ${input.session.id}`.pipe(
            Effect.mapError((cause) => error("advance", cause))
          );
          if (input.completed) {
            yield* kv
              .removeSession(input.profileId, input.session.platformUserId)
              .pipe(
                Effect.catch((cause) =>
                  Effect.logWarning("Session KV delete failed", cause)
                )
              );
          } else {
            yield* kv
              .putSession({
                profileId: input.profileId,
                automationId: input.session.automationId,
                platformUserId: input.session.platformUserId,
                sessionId: input.session.id,
              })
              .pipe(
                Effect.catch((cause) =>
                  Effect.logWarning("Session KV write-through failed", cause)
                )
              );
          }
        }
      );
      const upsertContact = Effect.fn("AutomationSessionService.upsertContact")(
        function* (input: {
          readonly workspaceId: AutomationSession["workspaceId"];
          readonly automationId: AutomationId;
          readonly platformUserId: string;
          readonly email?: string;
          readonly metadata?: Readonly<Record<string, unknown>>;
        }) {
          yield* sql`INSERT INTO automation_contacts (id, workspace_id, automation_id, platform_user_id, email, metadata) VALUES (${makeId(AutomationContactId)}, ${input.workspaceId}, ${input.automationId}, ${input.platformUserId}, ${input.email ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb) ON CONFLICT (automation_id, platform_user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, automation_contacts.email), metadata = automation_contacts.metadata || EXCLUDED.metadata`.pipe(
            Effect.mapError((cause) => error("contact upsert", cause))
          );
        }
      );
      return AutomationSessionService.of({
        findActive,
        start,
        advance,
        upsertContact,
      });
    })
  );
}
