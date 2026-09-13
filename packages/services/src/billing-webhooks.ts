import { SUBSCRIPTION_UPGRADED } from "@delulu/analytics/events";
import { makeId, SubscriptionId, TransactionId } from "@delulu/core";
import {
  BillingStateError,
  type BillingWebhookEvent,
} from "@delulu/core/domain/billing";
import { isPaidPlan } from "@delulu/payments/plans";
import { Context, DateTime, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { JobService } from "./jobs";
import { ProductAnalytics } from "./product-analytics";
import { stopBilledWorkspaceWork } from "./subscription-access";

/** Active subscription statuses that mean the customer is currently paying. */
const ACTIVE_STATUSES = new Set(["active", "trialing", "on_trial"]);

/** Facts a `SubscriptionChanged` transition carries for post-commit analytics. */
interface PaidFacts {
  readonly billingOwnerUserId: string;
  readonly plan: string;
  readonly status: string;
}

const optionalDate = (value: string | null): Date | null => {
  if (value === null) {
    return null;
  }
  return Option.match(DateTime.make(value), {
    onNone: () => null,
    onSome: DateTime.toDateUtc,
  });
};

/**
 * Transport-independent billing webhook application. The ingress verifies and
 * decodes provider payloads, then passes a normalized event here.
 */
export const applyBillingWebhook = Effect.fn("applyBillingWebhook")(function* (
  event: BillingWebhookEvent
) {
  const sql = yield* SqlClient.SqlClient;
  const jobs = yield* JobService;
  return yield* sql
    .withTransaction(
      Effect.gen(function* () {
        const claimed = yield* sql<{ providerEventId: string }>`
          INSERT INTO billing_webhook_events (provider_event_id, event_type, payload)
          VALUES (${event.eventId}, ${event._tag}, ${JSON.stringify(event)}::jsonb)
          ON CONFLICT (provider_event_id) DO NOTHING
          RETURNING provider_event_id`;
        if (!claimed[0]) {
          return { applied: false as const, paid: null };
        }

        if (event._tag === "UnrecognizedSubscriptionChanged") {
          // The claimed webhook event is the audit record. Unknown products
          // must never mutate a base plan or create an entitlement.
          return { applied: true as const, paid: null };
        }

        if (event._tag === "AddonSubscriptionChanged") {
          if (
            (event.currentPeriodStart !== null &&
              optionalDate(event.currentPeriodStart) === null) ||
            (event.currentPeriodEnd !== null &&
              optionalDate(event.currentPeriodEnd) === null)
          ) {
            return yield* new BillingStateError({
              message: "Billing provider sent an invalid add-on period",
              reason: "invalid_period",
              retryable: false,
            });
          }
          const id = makeId(SubscriptionId);
          const providerUpdatedAt = optionalDate(
            event.providerOccurredAt ?? null
          );
          const base = yield* sql<{ id: string }>`
            INSERT INTO subscriptions
              (id, billing_owner_user_id, provider_customer_id, plan, status)
            VALUES (${id}, ${event.billingOwnerUserId},
              ${event.providerCustomerId}, 'FREE', 'active')
            ON CONFLICT (billing_owner_user_id) DO UPDATE SET
              provider_customer_id = COALESCE(
                subscriptions.provider_customer_id,
                EXCLUDED.provider_customer_id
              )
            RETURNING id`;
          const baseSubscriptionId = base[0]?.id;
          if (!baseSubscriptionId) {
            return yield* new BillingStateError({
              message: "Unable to resolve base subscription for add-on",
              reason: "missing_base_subscription",
              retryable: true,
            });
          }
          const addonId = makeId(SubscriptionId);
          const subscriptionChanges = yield* sql<{ id: string }>`
            INSERT INTO subscription_addons
              (id, base_subscription_id, addon_key,
                provider_subscription_id, status, current_period_start,
                current_period_end, cancel_at_period_end, provider_updated_at)
            VALUES (${addonId}, ${baseSubscriptionId}, ${event.addon},
              ${event.providerSubscriptionId}, ${event.status},
              ${optionalDate(event.currentPeriodStart)},
              ${optionalDate(event.currentPeriodEnd)},
              ${event.cancelAtPeriodEnd}, ${providerUpdatedAt})
            ON CONFLICT (base_subscription_id, addon_key) DO UPDATE SET
              provider_subscription_id = EXCLUDED.provider_subscription_id,
              status = EXCLUDED.status,
              current_period_start = EXCLUDED.current_period_start,
              current_period_end = EXCLUDED.current_period_end,
              cancel_at_period_end = EXCLUDED.cancel_at_period_end,
              provider_updated_at = EXCLUDED.provider_updated_at
            WHERE subscription_addons.provider_updated_at IS NULL
              OR (${providerUpdatedAt}::timestamptz IS NOT NULL
                AND subscription_addons.provider_updated_at <= ${providerUpdatedAt})
            RETURNING id`;
          if (!subscriptionChanges[0]) {
            return {
              applied: false as const,
              stale: true as const,
              paid: null,
            };
          }
          return { applied: true as const, paid: null };
        }

        if (event._tag === "SubscriptionChanged") {
          if (
            (event.currentPeriodStart !== null &&
              optionalDate(event.currentPeriodStart) === null) ||
            (event.currentPeriodEnd !== null &&
              optionalDate(event.currentPeriodEnd) === null)
          ) {
            return yield* new BillingStateError({
              message: "Billing provider sent an invalid period",
              reason: "invalid_period",
              retryable: false,
            });
          }
          const id = makeId(SubscriptionId);
          const subscriptionChanges = yield* sql<{
            id: string;
          }>`INSERT INTO subscriptions
            (id, billing_owner_user_id, provider_customer_id,
              provider_subscription_id, plan, status, current_period_start,
              current_period_end, billing_interval, currency,
              recurring_amount_minor, cancel_at_period_end, last_renewed_at,
              paid_since, provider_updated_at)
            VALUES (${id}, ${event.billingOwnerUserId}, ${event.providerCustomerId},
              ${event.providerSubscriptionId}, ${event.plan}, ${event.status},
              ${optionalDate(event.currentPeriodStart)},
              ${optionalDate(event.currentPeriodEnd)},
              ${event.billingInterval}, ${event.currency},
              ${event.recurringAmountMinor}, ${event.cancelAtPeriodEnd ?? false},
              ${event.providerEventType === "subscription.renewed" ? new Date() : null},
              ${event.status === "active" || event.status === "trialing" ? (optionalDate(event.currentPeriodStart) ?? new Date()) : null},
              ${optionalDate(event.providerOccurredAt ?? null)})
            ON CONFLICT (billing_owner_user_id) DO UPDATE SET
              provider_customer_id = EXCLUDED.provider_customer_id,
              provider_subscription_id = EXCLUDED.provider_subscription_id,
              plan = EXCLUDED.plan, status = EXCLUDED.status,
              monthly_posts = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN 0 ELSE subscriptions.monthly_posts END,
              api_requests_per_month = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN 0 ELSE subscriptions.api_requests_per_month END,
              dms_sent = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN 0 ELSE subscriptions.dms_sent END,
              dms_skipped = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN 0 ELSE subscriptions.dms_skipped END,
              transcriptions_used = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN 0 ELSE subscriptions.transcriptions_used END,
              api_requests_period_start = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN EXCLUDED.current_period_start ELSE subscriptions.api_requests_period_start END,
              dms_sent_period_start = CASE WHEN subscriptions.current_period_start IS DISTINCT FROM EXCLUDED.current_period_start THEN EXCLUDED.current_period_start ELSE subscriptions.dms_sent_period_start END,
              current_period_start = EXCLUDED.current_period_start,
              current_period_end = EXCLUDED.current_period_end,
              billing_interval = ${event.billingInterval},
              currency = ${event.currency},
              recurring_amount_minor = ${event.recurringAmountMinor},
              cancel_at_period_end = ${event.cancelAtPeriodEnd ?? false},
              last_renewed_at = CASE WHEN ${event.providerEventType === "subscription.renewed"} THEN now() ELSE subscriptions.last_renewed_at END,
              paid_since = COALESCE(subscriptions.paid_since, EXCLUDED.paid_since),
              provider_updated_at = EXCLUDED.provider_updated_at
            WHERE subscriptions.provider_updated_at IS NULL
              OR (EXCLUDED.provider_updated_at IS NOT NULL
                AND EXCLUDED.provider_updated_at >= subscriptions.provider_updated_at)
            RETURNING id`;
          if (!subscriptionChanges[0]) {
            return {
              applied: false as const,
              stale: true as const,
              paid: null,
            };
          }
          yield* jobs.enqueue({
            workspaceId: event.billingOwnerUserId,
            payload: {
              _tag: "BillingReconcile",
              ownerId: event.billingOwnerUserId,
            },
            runAt: new Date(),
            idempotencyKey: `billing-reconcile:${event.billingOwnerUserId}`,
          });
          yield* jobs.enqueue({
            workspaceId: event.billingOwnerUserId,
            payload: {
              _tag: "LifecycleDeadline",
              ownerId: event.billingOwnerUserId,
            },
            runAt: new Date(),
            idempotencyKey: `lifecycle:${event.billingOwnerUserId}`,
          });
          if (
            event.providerEventType === "subscription.cancelled" ||
            event.providerEventType === "subscription.expired"
          ) {
            const effective = yield* sql<{
              id: string;
            }>`UPDATE cancellation_requests SET status = 'effective'
              WHERE billing_owner_user_id = ${event.billingOwnerUserId}
                AND status = 'scheduled' RETURNING id`;
            if (effective[0]) {
              yield* stopBilledWorkspaceWork(event.billingOwnerUserId);
              yield* jobs.enqueue({
                workspaceId: event.billingOwnerUserId,
                payload: {
                  _tag: "CancellationDeadline",
                  requestId: effective[0].id,
                },
                runAt: new Date(),
                idempotencyKey: `cancellation:${effective[0].id}`,
              });
            }
          }
          if (
            event.cancelAtPeriodEnd !== true &&
            event.providerEventType !== "subscription.cancelled" &&
            event.providerEventType !== "subscription.expired"
          ) {
            yield* sql`UPDATE cancellation_requests SET status = 'reactivated',
              data_deletion_at = NULL
              WHERE billing_owner_user_id = ${event.billingOwnerUserId}
                AND status = 'scheduled'`;
            if (
              event.providerEventType === "subscription.active" &&
              event.providerSubscriptionId !== null
            ) {
              yield* sql`UPDATE cancellation_requests SET status = 'reactivated',
                data_deletion_at = NULL
                WHERE billing_owner_user_id = ${event.billingOwnerUserId}
                  AND status IN ('effective','deleting')
                  AND provider_subscription_id IS DISTINCT FROM ${event.providerSubscriptionId}`;
            }
          }
          const paid: PaidFacts | null =
            isPaidPlan(event.plan) && ACTIVE_STATUSES.has(event.status)
              ? {
                  billingOwnerUserId: event.billingOwnerUserId,
                  plan: event.plan,
                  status: event.status,
                }
              : null;
          return { applied: true as const, paid };
        }
        const id = makeId(TransactionId);
        yield* sql`INSERT INTO transactions
            (id, billing_owner_user_id, provider_transaction_id, amount_minor,
              currency, status, metadata)
            VALUES (${id}, ${event.billingOwnerUserId},
              ${event.providerTransactionId}, ${event.amountMinor},
              ${event.currency}, ${event.status},
              ${JSON.stringify(event.metadata)}::jsonb)
            ON CONFLICT (provider_transaction_id) DO UPDATE SET
              status = EXCLUDED.status, metadata = EXCLUDED.metadata`;
        return { applied: true as const, paid: null };
      })
    )
    .pipe(
      Effect.catchTag("SqlError", (cause) =>
        Effect.die(new Error("Unable to apply billing webhook", { cause }))
      )
    );
});

export class BillingWebhookApplication extends Context.Service<
  BillingWebhookApplication,
  {
    readonly apply: (
      event: BillingWebhookEvent
    ) => Effect.Effect<
      { readonly applied: boolean; readonly stale: boolean },
      BillingStateError
    >;
  }
>()("@delulu/services/BillingWebhookApplication") {
  static readonly layer = Layer.effect(
    BillingWebhookApplication,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const jobs = yield* JobService;
      const analytics = yield* ProductAnalytics;

      const apply = Effect.fn("BillingWebhookApplication.apply")(function* (
        event: BillingWebhookEvent
      ) {
        const result = yield* applyBillingWebhook(event).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(JobService, jobs)
        );
        // Fire the "became paid" event AFTER the billing transaction commits —
        // never inside it — so a telemetry hiccup can't roll back billing and
        // we never emit for a transaction that later aborts. Dedupe upstream
        // (`billing_webhook_events` claim) guarantees this runs once per event.
        if (result.paid) {
          const workspaces = yield* sql<{
            id: string;
          }>`SELECT id FROM workspaces
              WHERE billing_owner_user_id = ${result.paid.billingOwnerUserId}
                AND is_personal = true
              ORDER BY created_at LIMIT 1`.pipe(
            Effect.catchCause(() => Effect.succeed([] as { id: string }[]))
          );
          const workspace = workspaces[0];
          if (workspace) {
            yield* analytics.groupIdentify({
              type: "workspace",
              key: workspace.id,
              set: { plan: result.paid.plan },
            });
          }
          yield* analytics.capture({
            distinctId: result.paid.billingOwnerUserId,
            event: SUBSCRIPTION_UPGRADED,
            ...(workspace ? { groups: { workspace: workspace.id } } : {}),
            properties: {
              platform: "api",
              plan: result.paid.plan,
              status: result.paid.status,
            },
          });
        }
        return { applied: result.applied, stale: "stale" in result };
      });

      return BillingWebhookApplication.of({ apply });
    })
  );
}
