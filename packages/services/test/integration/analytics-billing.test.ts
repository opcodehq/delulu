import { AnalyticsProviderError } from "@delulu/core/domain/analytics";
import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect, it } from "vitest";
import { AnalyticsService, LiveInsightsProvider } from "../../src/analytics";
import { makeMemoryAnalyticsCacheLayer } from "../../src/analytics-cache";
import { JobService } from "../../src/jobs";

const Jobs = Layer.succeed(
  JobService,
  JobService.of({
    enqueue: () => Effect.succeed("test-job"),
    cancel: () => Effect.void,
  })
);

import { BillingService } from "../../src/billing";
import { BillingReconciliation } from "../../src/billing-reconciliation";
import { BillingOwnerTransfers } from "../../src/billing-transfer";
import { BillingWebhookApplication } from "../../src/billing-webhooks";
import { AuthConfig } from "../../src/config";
import { IdentityService } from "../../src/identity";
import { PostHogConfig, ProductAnalytics } from "../../src/product-analytics";
import { PooledQuotaReservations } from "../../src/quota-reservations";
import { provisionPaidSubscription } from "./paid-subscription";

const Pg = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: true,
});
const Provider = Layer.succeed(
  LiveInsightsProvider,
  LiveInsightsProvider.of({
    fetchPeriod: () =>
      Effect.fail(
        new AnalyticsProviderError({
          message: "not used by operational tests",
          retryable: false,
        })
      ),
    fetchRecentMedia: () =>
      Effect.fail(
        new AnalyticsProviderError({
          message: "not used by operational tests",
          retryable: false,
        })
      ),
  })
);
const Analytics = AnalyticsService.layer.pipe(
  Layer.provide([makeMemoryAnalyticsCacheLayer(), Provider])
);
const Config = Layer.succeed(
  AuthConfig,
  AuthConfig.of({
    clerkIssuer: "",
    clerkJwtKey: "",
    asIssuer: "https://api.delulu.test",
    apiResource: "https://api.delulu.test",
    appBaseUrl: "https://app.delulu.test",
  })
);
const Reservations = PooledQuotaReservations.layer.pipe(
  Layer.provide([Config, Jobs])
);
// Disabled telemetry — BillingWebhookApplication now depends on ProductAnalytics
// (for the "became paid" event). With `enabled: false` it is a no-op.
const Telemetry = ProductAnalytics.layer.pipe(
  Layer.provide(
    Layer.succeed(
      PostHogConfig,
      PostHogConfig.of({
        apiKey: "",
        host: "https://us.i.posthog.com",
        environment: "test",
        enabled: false,
      })
    )
  )
);
const AppLayer = Layer.mergeAll(
  IdentityService.layer,
  Analytics,
  BillingService.layer,
  BillingReconciliation.layer,
  BillingWebhookApplication.layer.pipe(Layer.provide([Telemetry, Jobs])),
  BillingOwnerTransfers.layer,
  Reservations
).pipe(Layer.provideMerge(Pg));

describe("M4 analytics and billing services", () => {
  it("invalidates versioned operational counts after a post write", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const analytics = yield* AnalyticsService;
      const sql = yield* SqlClient.SqlClient;
      const resolved = yield* identity.resolve({
        sub: `analytics_${crypto.randomUUID()}`,
      });
      const workspaceId = resolved.personalWorkspace!.id;
      const members = yield* sql<{
        id: string;
      }>`SELECT id FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND user_id = ${resolved.user.id}`;
      const postId = `post_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
      yield* sql`INSERT INTO posts
        (id, workspace_id, status, content, created_by_member_id, source)
        VALUES (${postId}, ${workspaceId}, 'draft',
          ${JSON.stringify({ groups: [{ id: "post_group_aaaaaaaaaaaa", isDefault: true, segments: [] }] })}::jsonb,
          ${members[0]!.id}, 'app')`;
      const before = yield* analytics.operational(workspaceId);
      yield* sql`UPDATE posts SET status = 'published', published_at = now()
        WHERE id = ${postId}`;
      yield* analytics.invalidate(workspaceId);
      const after = yield* analytics.operational(workspaceId);
      return { before, after };
    });
    const { before, after } = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(before.counts.drafts).toBe(1);
    expect(after.counts.published).toBe(1);
    expect(after.statsVersion).toBeGreaterThan(before.statsVersion);
    expect(after.streak.currentDays).toBe(1);
  });

  it("applies normalized billing webhooks idempotently", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const webhook = yield* BillingWebhookApplication;
      const billing = yield* BillingService;
      const sql = yield* SqlClient.SqlClient;
      const resolved = yield* identity.resolve({
        sub: `billing_${crypto.randomUUID()}`,
      });
      const event = {
        _tag: "SubscriptionChanged" as const,
        eventId: `event_${crypto.randomUUID()}`,
        billingOwnerUserId: resolved.user.id,
        providerCustomerId: `customer_${crypto.randomUUID()}`,
        providerSubscriptionId: `subscription_${crypto.randomUUID()}`,
        plan: "ECHO",
        status: "active",
        currentPeriodStart: "2026-07-01T00:00:00.000Z",
        currentPeriodEnd: "2026-08-01T00:00:00.000Z",
        addons: {},
      };
      const first = yield* webhook.apply(event);
      const second = yield* webhook.apply(event);
      yield* sql`UPDATE subscriptions SET monthly_posts = 5,
        api_requests_per_month = 7, dms_sent = 9, transcriptions_used = 3
        WHERE billing_owner_user_id = ${resolved.user.id}`;
      yield* webhook.apply({
        ...event,
        eventId: `event_${crypto.randomUUID()}`,
        currentPeriodStart: "2026-08-01T00:00:00.000Z",
        currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      });
      yield* webhook.apply({
        _tag: "TransactionChanged",
        eventId: `event_${crypto.randomUUID()}`,
        billingOwnerUserId: resolved.user.id,
        providerTransactionId: `transaction_${crypto.randomUUID()}`,
        amountMinor: 499,
        currency: "USD",
        status: "succeeded",
        metadata: { source: "test" },
      });
      const subscription = yield* billing.subscription(resolved.user.id);
      const usage = yield* billing.usage(resolved.user.id);
      const transactions = yield* billing.transactions({
        billingOwnerUserId: resolved.user.id,
        limit: 20,
        offset: 0,
      });
      return { first, second, subscription, usage, transactions };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.first.applied).toBe(true);
    expect(result.second.applied).toBe(false);
    expect(result.subscription.plan).toBe("ECHO");
    expect(result.subscription.addons).toEqual({});
    expect(result.usage.usage.monthlyPosts).toBe(0);
    expect(result.usage.usage.dmsSent).toBe(0);
    expect(result.transactions.data[0]?.amountMinor).toBe(499);
  });

  it("does not let an older provider event roll subscription state backward", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const webhook = yield* BillingWebhookApplication;
      const billing = yield* BillingService;
      const resolved = yield* identity.resolve({
        sub: `billing_order_${crypto.randomUUID()}`,
      });
      const base = {
        _tag: "SubscriptionChanged" as const,
        billingOwnerUserId: resolved.user.id,
        providerCustomerId: `customer_${crypto.randomUUID()}`,
        providerSubscriptionId: `subscription_${crypto.randomUUID()}`,
        plan: "ECHO",
        currentPeriodStart: "2026-07-01T00:00:00.000Z",
        currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      };
      yield* webhook.apply({
        ...base,
        eventId: `event_${crypto.randomUUID()}`,
        providerEventType: "subscription.active",
        providerOccurredAt: "2026-07-10T00:00:00.000Z",
        status: "active",
      });
      const stale = yield* webhook.apply({
        ...base,
        eventId: `event_${crypto.randomUUID()}`,
        providerEventType: "subscription.expired",
        providerOccurredAt: "2026-07-09T00:00:00.000Z",
        status: "expired",
      });
      return {
        stale,
        subscription: yield* billing.subscription(resolved.user.id),
      };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.stale.applied).toBe(false);
    expect(result.stale.stale).toBe(true);
    expect(result.subscription.status).toBe("active");
  });

  it("reserves pooled quota transactionally before committing usage", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const reservations = yield* PooledQuotaReservations;
      const billing = yield* BillingService;
      const resolved = yield* identity.resolve({
        sub: `reservation_${crypto.randomUUID()}`,
      });
      yield* provisionPaidSubscription(resolved.user.id, "FREE");
      const first = yield* reservations.reserve({
        id: `quota_reservation_${crypto.randomUUID()}`,
        workspaceId: resolved.personalWorkspace!.id,
        billingOwnerUserId: resolved.user.id,
        resource: "monthlyPosts",
        amount: 10,
        idempotencyKey: `quota:${crypto.randomUUID()}`,
      });
      const overLimit = yield* reservations
        .reserve({
          id: `quota_reservation_${crypto.randomUUID()}`,
          workspaceId: resolved.personalWorkspace!.id,
          billingOwnerUserId: resolved.user.id,
          resource: "monthlyPosts",
          amount: 1,
          idempotencyKey: `quota:${crypto.randomUUID()}`,
        })
        .pipe(Effect.result);
      yield* reservations.commit(first.id);
      const usage = yield* billing.usage(resolved.user.id);
      return { overLimit, usage };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.overLimit._tag).toBe("Failure");
    expect(result.usage.usage.monthlyPosts).toBe(10);
  });

  it("serializes concurrent pooled quota reservations at the plan boundary", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const reservations = yield* PooledQuotaReservations;
      const resolved = yield* identity.resolve({
        sub: `reservation_race_${crypto.randomUUID()}`,
      });
      yield* provisionPaidSubscription(resolved.user.id, "FREE");
      return yield* Effect.all(
        Array.from({ length: 20 }, (_, index) =>
          reservations
            .reserve({
              id: `quota_reservation_${crypto.randomUUID()}`,
              workspaceId: resolved.personalWorkspace!.id,
              billingOwnerUserId: resolved.user.id,
              resource: "monthlyPosts",
              amount: 1,
              idempotencyKey: `quota-race:${index}:${crypto.randomUUID()}`,
            })
            .pipe(Effect.result)
        ),
        { concurrency: "unbounded" }
      );
    });
    const results = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(
      10
    );
    expect(results.filter((result) => result._tag === "Failure")).toHaveLength(
      10
    );
  });

  it("reconciles drifted counters from authoritative workspace rows", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const reconciliation = yield* BillingReconciliation;
      const billing = yield* BillingService;
      const sql = yield* SqlClient.SqlClient;
      const resolved = yield* identity.resolve({
        sub: `reconcile_${crypto.randomUUID()}`,
      });
      yield* provisionPaidSubscription(resolved.user.id);
      yield* sql`UPDATE subscriptions SET monthly_posts = 99,
        social_accounts = 88, media_storage_bytes = 77,
        transcriptions_used = 66
        WHERE billing_owner_user_id = ${resolved.user.id}`;
      const result = yield* reconciliation.run({
        billingOwnerUserId: resolved.user.id,
      });
      const usage = yield* billing.usage(resolved.user.id);
      return { result, usage };
    });
    const { result, usage } = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.subscriptionsUpdated).toBe(1);
    expect(usage.usage.monthlyPosts).toBe(0);
    expect(usage.usage.socialAccounts).toBe(0);
    expect(usage.usage.mediaStorageBytes).toBe(0);
    expect(usage.usage.transcriptionsUsed).toBe(0);
  });

  it("repoints billing only after the eligible target accepts", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const webhook = yield* BillingWebhookApplication;
      const transfers = yield* BillingOwnerTransfers;
      const sql = yield* SqlClient.SqlClient;
      const payer = yield* identity.resolve({
        sub: `payer_${crypto.randomUUID()}`,
      });
      const target = yield* identity.resolve({
        sub: `target_${crypto.randomUUID()}`,
      });
      const workspaceId = payer.personalWorkspace!.id;
      yield* sql`INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${`member_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`},
          ${workspaceId}, ${target.user.id}, 'viewer')`;
      yield* webhook.apply({
        _tag: "SubscriptionChanged",
        eventId: `event_${crypto.randomUUID()}`,
        billingOwnerUserId: target.user.id,
        providerCustomerId: `customer_${crypto.randomUUID()}`,
        providerSubscriptionId: `subscription_${crypto.randomUUID()}`,
        plan: "ECHO",
        status: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      });
      const requested = yield* transfers.request({
        workspaceId,
        actorUserId: payer.user.id,
        actorRole: "viewer",
        toUserId: target.user.id,
      });
      const accepted = yield* transfers.accept({
        workspaceId,
        transferId: requested.id,
        actorUserId: target.user.id,
      });
      const workspace = yield* sql<{ billingOwnerUserId: string }>`SELECT
        billing_owner_user_id FROM workspaces WHERE id = ${workspaceId}`;
      return { accepted, billingOwnerUserId: workspace[0]!.billingOwnerUserId };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.accepted.status).toBe("accepted");
    expect(result.billingOwnerUserId).toBe(result.accepted.toUserId);
  });

  it("allows exactly one winner when acceptance races cancellation", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const transfers = yield* BillingOwnerTransfers;
      const webhook = yield* BillingWebhookApplication;
      const sql = yield* SqlClient.SqlClient;
      const payer = yield* identity.resolve({
        sub: `payer_race_${crypto.randomUUID()}`,
      });
      const target = yield* identity.resolve({
        sub: `target_race_${crypto.randomUUID()}`,
      });
      const workspaceId = payer.personalWorkspace!.id;
      yield* sql`INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${`member_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`},
          ${workspaceId}, ${target.user.id}, 'viewer')`;
      yield* webhook.apply({
        _tag: "SubscriptionChanged",
        eventId: `event_${crypto.randomUUID()}`,
        billingOwnerUserId: target.user.id,
        providerCustomerId: `customer_${crypto.randomUUID()}`,
        providerSubscriptionId: `subscription_${crypto.randomUUID()}`,
        plan: "ECHO",
        status: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      });
      const requested = yield* transfers.request({
        workspaceId,
        actorUserId: payer.user.id,
        actorRole: "owner",
        toUserId: target.user.id,
      });
      const outcomes = yield* Effect.all(
        [
          transfers.accept({
            workspaceId,
            transferId: requested.id,
            actorUserId: target.user.id,
          }),
          transfers.cancel({
            workspaceId,
            transferId: requested.id,
            actorUserId: payer.user.id,
          }),
        ].map((effect) => effect.pipe(Effect.result)),
        { concurrency: "unbounded" }
      );
      const rows = yield* sql<{ status: string }>`SELECT status
        FROM billing_owner_transfers WHERE id = ${requested.id}`;
      return { outcomes, status: rows[0]?.status };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(
      result.outcomes.filter((outcome) => outcome._tag === "Success")
    ).toHaveLength(1);
    expect(["accepted", "cancelled"]).toContain(result.status);
  });
});
