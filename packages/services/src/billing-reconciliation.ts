import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

export interface ReconciliationResult {
  readonly subscriptionsUpdated: number;
  readonly reservationsExpired: number;
}

/** Correct running counters from source-of-truth rows without touching DMs. */
export class BillingReconciliation extends Context.Service<
  BillingReconciliation,
  {
    readonly run: (input: {
      readonly billingOwnerUserId: string;
    }) => Effect.Effect<ReconciliationResult>;
  }
>()("@delulu/services/BillingReconciliation") {
  static readonly layer = Layer.effect(
    BillingReconciliation,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const run = Effect.fn("BillingReconciliation.run")(function* (input: {
        readonly billingOwnerUserId: string;
      }) {
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const expired = yield* sql<{ count: string }>`WITH changed AS (
              UPDATE quota_reservations SET status = 'expired'
              WHERE status = 'pending' AND expires_at <= now()
                AND billing_owner_user_id = ${input.billingOwnerUserId} RETURNING 1
            ) SELECT count(*)::text AS count FROM changed`;
              const updated = yield* sql<{ billingOwnerUserId: string }>`
              WITH selected AS (
                SELECT billing_owner_user_id, current_period_start
                FROM subscriptions
                WHERE billing_owner_user_id = ${input.billingOwnerUserId}
              ), actual AS (
                SELECT selected.billing_owner_user_id,
                  (SELECT count(*) FROM active_connections c JOIN workspaces w ON w.id = c.workspace_id
                    WHERE w.billing_owner_user_id = selected.billing_owner_user_id AND w.deleted_at IS NULL)::bigint AS social_accounts,
                  (SELECT count(*) FROM posts p JOIN workspaces w ON w.id = p.workspace_id
                    WHERE w.billing_owner_user_id = selected.billing_owner_user_id AND w.deleted_at IS NULL
                      AND p.deleted_at IS NULL
                      AND p.created_at >= COALESCE(selected.current_period_start, date_trunc('month', now())))::bigint AS monthly_posts,
                  (SELECT COALESCE(sum(m.size_bytes), 0) FROM media m JOIN workspaces w ON w.id = m.workspace_id
                    WHERE w.billing_owner_user_id = selected.billing_owner_user_id AND w.deleted_at IS NULL
                      AND m.deleted_at IS NULL)::bigint AS media_storage_bytes,
                  (SELECT count(*) FROM transcriptions t JOIN workspaces w ON w.id = t.workspace_id
                    WHERE w.billing_owner_user_id = selected.billing_owner_user_id AND w.deleted_at IS NULL)::bigint AS transcriptions_used
                FROM selected
              )
              UPDATE subscriptions s SET
                social_accounts = actual.social_accounts,
                monthly_posts = actual.monthly_posts,
                media_storage_bytes = actual.media_storage_bytes,
                transcriptions_used = actual.transcriptions_used
              FROM actual WHERE s.billing_owner_user_id = actual.billing_owner_user_id
              RETURNING s.billing_owner_user_id`;
              return {
                subscriptionsUpdated: updated.length,
                reservationsExpired: Number(expired[0]?.count ?? 0),
              };
            })
          )
          .pipe(Effect.orDie);
      });
      return BillingReconciliation.of({ run });
    })
  );
}
