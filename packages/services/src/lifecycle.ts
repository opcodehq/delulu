import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { JobService } from "./jobs";
import { MessagingService } from "./messaging";

export class LifecycleService extends Context.Service<
  LifecycleService,
  {
    readonly record: (input: {
      readonly billingOwnerUserId: string;
      readonly event: string;
      readonly properties?: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
      readonly touchActivity?: boolean;
    }) => Effect.Effect<void>;
    readonly syncWorkspace: (input: {
      readonly workspaceId: string;
      readonly event?: string;
      readonly idempotencyKey?: string;
    }) => Effect.Effect<void>;
    readonly runScheduled: (ownerId: string) => Effect.Effect<number | null>;
  }
>()("@delulu/services/LifecycleService") {
  static readonly layer = Layer.effect(
    LifecycleService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const jobs = yield* JobService;
      const scheduleOwner = (ownerId: string) =>
        Effect.gen(function* () {
          yield* jobs.enqueue({
            workspaceId: ownerId,
            payload: { _tag: "LifecycleDeadline", ownerId },
            runAt: new Date(),
            idempotencyKey: `lifecycle:${ownerId}`,
          });
          yield* jobs.enqueue({
            workspaceId: ownerId,
            payload: { _tag: "BillingReconcile", ownerId },
            runAt: new Date(),
            idempotencyKey: `billing-reconcile:${ownerId}`,
          });
        });
      const messaging = yield* MessagingService;
      const record = Effect.fn("LifecycleService.record")(function* (input: {
        billingOwnerUserId: string;
        event: string;
        properties?: Readonly<Record<string, unknown>>;
        idempotencyKey?: string;
        touchActivity?: boolean;
      }) {
        const rows =
          input.touchActivity === false
            ? yield* sql<{ email: string | null }>`SELECT email FROM users
              WHERE id = ${input.billingOwnerUserId}`.pipe(Effect.orDie)
            : yield* sql<{ email: string | null }>`UPDATE users
              SET last_active_at = now() WHERE id = ${input.billingOwnerUserId}
              RETURNING email`.pipe(Effect.orDie);
        if (input.touchActivity !== false) {
          yield* scheduleOwner(input.billingOwnerUserId);
        }
        const email = rows[0]?.email;
        if (!email) {
          return;
        }
        yield* messaging.track({
          userId: input.billingOwnerUserId,
          email,
          event: input.event,
          properties: input.properties,
          idempotencyKey: input.idempotencyKey,
        });
      });
      const syncWorkspace = Effect.fn("LifecycleService.syncWorkspace")(
        function* (input: {
          workspaceId: string;
          event?: string;
          idempotencyKey?: string;
        }) {
          const rows = yield* sql<{
            billingOwnerUserId: string;
            email: string | null;
            connections: string;
            instagramConnections: string;
            instagramAutomations: string;
          }>`SELECT w.billing_owner_user_id, u.email,
            (SELECT count(*)::text FROM active_connections c WHERE c.workspace_id = w.id) AS connections,
            (SELECT count(*)::text FROM active_connections c WHERE c.workspace_id = w.id AND lower(c.platform) = 'instagram') AS instagram_connections,
            (SELECT count(*)::text FROM automations a WHERE a.workspace_id = w.id AND lower(a.platform) = 'instagram') AS instagram_automations
            FROM workspaces w JOIN users u ON u.id = w.billing_owner_user_id
            WHERE w.id = ${input.workspaceId}`.pipe(Effect.orDie);
          const row = rows[0];
          if (!row?.email) {
            return;
          }
          yield* sql`UPDATE users SET last_active_at = now() WHERE id = ${row.billingOwnerUserId}`.pipe(
            Effect.orDie
          );
          yield* scheduleOwner(row.billingOwnerUserId);
          const attributes = {
            connected_account_count: Number(row.connections),
            instagram_connected: Number(row.instagramConnections) > 0,
            has_instagram_automation: Number(row.instagramAutomations) > 0,
          };
          yield* messaging.identify({
            userId: row.billingOwnerUserId,
            email: row.email,
            attributes,
            idempotencyKey: `workspace:${input.workspaceId}:identify:${input.idempotencyKey ?? crypto.randomUUID()}`,
          });
          if (input.event) {
            yield* messaging.track({
              userId: row.billingOwnerUserId,
              email: row.email,
              event: input.event,
              properties: attributes,
              idempotencyKey: input.idempotencyKey,
            });
          }
        }
      );
      const runScheduled = Effect.fn("LifecycleService.runScheduled")(
        function* (ownerId: string) {
          const owners = yield* sql<{
            lastActiveAt: Date;
          }>`SELECT u.last_active_at FROM users u
            JOIN subscriptions s ON s.billing_owner_user_id = u.id
            WHERE u.id = ${ownerId} AND s.status IN ('active','trialing')`.pipe(
            Effect.orDie
          );
          if (!owners[0]) {
            return null;
          }
          const inactive = yield* sql<{
            id: string;
            days: number;
            bucket: string;
          }>`SELECT u.id,
              floor(EXTRACT(EPOCH FROM (now() - u.last_active_at)) / 86400)::integer AS days,
              to_char(now(), 'IYYY-IW') AS bucket
            FROM users u JOIN subscriptions s ON s.billing_owner_user_id = u.id
            WHERE u.id = ${ownerId} AND s.status IN ('active','trialing') AND (
              u.last_active_at BETWEEN now() - interval '8 days' AND now() - interval '7 days'
              OR u.last_active_at BETWEEN now() - interval '15 days' AND now() - interval '14 days'
              OR u.last_active_at BETWEEN now() - interval '31 days' AND now() - interval '30 days'
            )`.pipe(Effect.orDie);
          for (const user of inactive) {
            yield* record({
              billingOwnerUserId: user.id,
              event: "user_inactive",
              properties: { inactive_days: user.days },
              idempotencyKey: `inactive:${user.id}:${user.days}:${user.bucket}`,
              touchActivity: false,
            });
          }
          const weekly = yield* sql<{
            id: string;
            bucket: string;
            posts: string;
            automations: string;
          }>`SELECT u.id, to_char(now(), 'IYYY-IW') AS bucket,
              (SELECT count(*)::text FROM posts p JOIN workspaces w ON w.id = p.workspace_id
                WHERE w.billing_owner_user_id = u.id AND p.created_at >= now() - interval '7 days') AS posts,
              (SELECT count(*)::text FROM automation_runs r JOIN workspaces w ON w.id = r.workspace_id
                WHERE w.billing_owner_user_id = u.id AND r.started_at >= now() - interval '7 days') AS automations
            FROM users u JOIN subscriptions s ON s.billing_owner_user_id = u.id
            WHERE u.id = ${ownerId} AND s.status IN ('active','trialing')
              AND u.last_active_at >= now() - interval '7 days'`.pipe(
            Effect.orDie
          );
          for (const user of weekly) {
            yield* record({
              billingOwnerUserId: user.id,
              event: "weekly_usage_digest",
              properties: {
                posts_created: Number(user.posts),
                automation_runs: Number(user.automations),
              },
              idempotencyKey: `weekly:${user.id}:${user.bucket}`,
              touchActivity: false,
            });
          }
          const now = Date.now();
          const monday = new Date(now);
          monday.setUTCHours(0, 0, 0, 0);
          monday.setUTCDate(
            monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7)
          );
          const deadlines = [
            monday.getTime(),
            ...[7, 14, 30].map(
              (days) => owners[0].lastActiveAt.getTime() + days * 86_400_000
            ),
          ].filter((deadline) => deadline > now);
          return Math.min(...deadlines);
        }
      );
      return LifecycleService.of({ record, syncWorkspace, runScheduled });
    })
  );
}
