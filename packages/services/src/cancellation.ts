import { ConflictError, NotFoundError } from "@delulu/contracts";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import {
  BillingProviderConfig,
  BillingProviderService,
} from "./billing-provider";
import {
  CANCELLATION_CONFIRMATION,
  type CancellationReason,
  cancellationDeletionAt,
  canOfferMonthlySave,
} from "./cancellation-policy";
import { JobService } from "./jobs";
import { MessagingService } from "./messaging";
import { R2Service } from "./r2";

export interface CancellationImpactView {
  readonly workspaces: number;
  readonly members: number;
  readonly posts: number;
  readonly scheduledPosts: number;
  readonly automations: number;
  readonly connections: number;
  readonly apiKeys: number;
  readonly mediaItems: number;
  readonly mediaBytes: number;
  readonly automationContacts: number;
  readonly automationRuns: number;
  readonly transcriptions: number;
  readonly workspaceNames: readonly string[];
}

export interface CancellationView {
  readonly id: string | null;
  readonly status: string | null;
  readonly reason: CancellationReason | null;
  readonly comment: string | null;
  readonly currentPeriodEnd: string | null;
  readonly dataDeletionAt: string | null;
  readonly impact: CancellationImpactView;
  readonly canOfferSave: boolean;
  readonly offerAmountMinor: number | null;
  readonly offerCurrency: string | null;
  readonly calendarReference: string | null;
  readonly calendarBookingAt: string | null;
  readonly recoveryUrl: string | null;
  readonly canManageCancellation: boolean;
}

interface SubscriptionRow {
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  billingInterval: string | null;
  currency: string | null;
  recurringAmountMinor: string | number | null;
  plan: string;
}

interface GrantableSaveSubscription extends SubscriptionRow {
  providerCustomerId: string;
  currency: string;
  recurringAmountMinor: string | number;
}

const canGrantMonthlySave = (
  subscription: SubscriptionRow,
  saveAlreadyUsed: boolean
): subscription is GrantableSaveSubscription =>
  canOfferMonthlySave({
    billingPeriod: subscription.billingInterval,
    currentPeriodStart: subscription.currentPeriodStart,
    saveAlreadyUsed,
  }) &&
  Boolean(
    subscription.providerCustomerId &&
      subscription.recurringAmountMinor &&
      Number(subscription.recurringAmountMinor) > 0 &&
      subscription.currency
  );

interface RequestRow {
  id: string;
  status: string;
  reason: CancellationReason;
  comment: string | null;
  impact: CancellationImpactView;
  scheduledFor: Date | null;
  dataDeletionAt: Date | null;
  saveOfferAccepted: boolean;
  offerAmountMinor: string | number | null;
  offerCurrency: string | null;
  calendarBookingAt: Date | null;
}

const emptyImpact: CancellationImpactView = {
  workspaces: 0,
  members: 0,
  posts: 0,
  scheduledPosts: 0,
  automations: 0,
  connections: 0,
  apiKeys: 0,
  mediaItems: 0,
  mediaBytes: 0,
  automationContacts: 0,
  automationRuns: 0,
  transcriptions: 0,
  workspaceNames: [],
};

const iso = (value: Date | null): string | null =>
  value ? DateTime.formatIso(DateTime.fromDateUnsafe(value)) : null;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const hashReference = (reference: string) =>
  Effect.promise(async () => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(reference)
    );
    return [...new Uint8Array(bytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });

const cancellationEmail = (input: {
  title: string;
  message: string;
  termEnd: string;
  deletionAt: string;
  workspaces: number;
  posts: number;
  workspaceNames: readonly string[];
  reason: CancellationReason;
  recoveryUrl: string;
}) => {
  const names = input.workspaceNames.join(", ") || "None";
  const text = `${input.title}\n\n${input.message}\n\nAccess ends: ${input.termEnd}\nPermanent deletion: ${input.deletionAt}\nReason: ${input.reason.replaceAll("_", " ")}\nAffected workspaces: ${input.workspaces} (${names})\nPosts: ${input.posts}\nRestore access: ${input.recoveryUrl}`;
  return {
    text,
    html: `<h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.message)}</p><ul><li>Access ends: ${escapeHtml(input.termEnd)}</li><li>Permanent deletion: ${escapeHtml(input.deletionAt)}</li><li>Reason: ${escapeHtml(input.reason.replaceAll("_", " "))}</li><li>Affected workspaces: ${input.workspaces} (${escapeHtml(names)})</li><li>Posts: ${input.posts}</li></ul><p><a href="${escapeHtml(input.recoveryUrl)}">Restore access</a></p>`,
  };
};

export class CancellationService extends Context.Service<
  CancellationService,
  {
    readonly get: (
      billingOwnerUserId: string
    ) => Effect.Effect<CancellationView, NotFoundError>;
    readonly portal: (
      billingOwnerUserId: string
    ) => Effect.Effect<string, NotFoundError | ConflictError>;
    readonly start: (input: {
      readonly billingOwnerUserId: string;
      readonly reason: CancellationReason;
      readonly comment?: string;
    }) => Effect.Effect<CancellationView, NotFoundError | ConflictError>;
    readonly acceptOffer: (input: {
      readonly billingOwnerUserId: string;
      readonly requestId: string;
    }) => Effect.Effect<CancellationView, NotFoundError | ConflictError>;
    readonly schedule: (input: {
      readonly billingOwnerUserId: string;
      readonly requestId: string;
      readonly confirmation: string;
    }) => Effect.Effect<CancellationView, NotFoundError | ConflictError>;
    readonly reactivate: (input: {
      readonly billingOwnerUserId: string;
      readonly requestId: string;
    }) => Effect.Effect<CancellationView, NotFoundError | ConflictError>;
    readonly abandon: (input: {
      readonly billingOwnerUserId: string;
      readonly requestId: string;
    }) => Effect.Effect<CancellationView, NotFoundError | ConflictError>;
    readonly handleCalendar: (input: {
      readonly event:
        | "BOOKING_CREATED"
        | "BOOKING_RESCHEDULED"
        | "BOOKING_CANCELLED";
      readonly reference: string;
      readonly bookingUid: string;
      readonly bookingAt?: string;
      readonly attendeeEmail?: string;
    }) => Effect.Effect<boolean>;
    readonly runRetention: (requestId: string) => Effect.Effect<number | null>;
  }
>()("@delulu/services/CancellationService") {
  static readonly layer = Layer.effect(
    CancellationService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const jobs = yield* JobService;
      const billingProvider = yield* BillingProviderService;
      const providerConfig = yield* BillingProviderConfig;
      const messaging = yield* MessagingService;
      const r2 = yield* R2Service;

      const subscription = Effect.fn("CancellationService.subscription")(
        function* (ownerId: string) {
          const rows =
            yield* sql<SubscriptionRow>`SELECT provider_subscription_id,
            provider_customer_id, COALESCE(paid_since, current_period_start) AS current_period_start, current_period_end,
            billing_interval, currency, recurring_amount_minor, plan
            FROM subscriptions WHERE billing_owner_user_id = ${ownerId}`.pipe(
              Effect.orDie
            );
          if (!rows[0]?.providerSubscriptionId) {
            return yield* new NotFoundError({
              message: "Paid subscription not found",
              resource: "subscription",
            });
          }
          return rows[0];
        }
      );
      const impact = Effect.fn("CancellationService.impact")(function* (
        ownerId: string
      ) {
        const rows = yield* sql<Record<string, unknown>>`WITH owned AS (
          SELECT id, name FROM workspaces WHERE billing_owner_user_id = ${ownerId}
        ) SELECT
          (SELECT count(*) FROM owned)::text AS workspaces,
          (SELECT count(DISTINCT wm.user_id) FROM workspace_members wm JOIN owned o ON o.id = wm.workspace_id)::text AS members,
          (SELECT count(*) FROM posts p JOIN owned o ON o.id = p.workspace_id)::text AS posts,
          (SELECT count(*) FROM posts p JOIN owned o ON o.id = p.workspace_id WHERE p.status IN ('scheduled','publishing'))::text AS scheduled_posts,
          (SELECT count(*) FROM automations a JOIN owned o ON o.id = a.workspace_id)::text AS automations,
          (SELECT count(*) FROM active_connections c JOIN owned o ON o.id = c.workspace_id)::text AS connections,
          (SELECT count(*) FROM api_keys k JOIN owned o ON o.id = k.workspace_id)::text AS api_keys,
          (SELECT count(*) FROM media m JOIN owned o ON o.id = m.workspace_id)::text AS media_items,
          (SELECT COALESCE(sum(m.size_bytes),0) FROM media m JOIN owned o ON o.id = m.workspace_id)::text AS media_bytes,
          (SELECT count(*) FROM automation_contacts c JOIN owned o ON o.id = c.workspace_id)::text AS automation_contacts,
          (SELECT count(*) FROM automation_runs r JOIN owned o ON o.id = r.workspace_id)::text AS automation_runs,
          (SELECT count(*) FROM transcriptions t JOIN owned o ON o.id = t.workspace_id)::text AS transcriptions,
          (SELECT COALESCE(json_agg(name ORDER BY name),'[]'::json) FROM owned) AS workspace_names`.pipe(
          Effect.orDie
        );
        const row = rows[0];
        if (!row) {
          return emptyImpact;
        }
        return {
          workspaces: Number(row.workspaces),
          members: Number(row.members),
          posts: Number(row.posts),
          scheduledPosts: Number(row.scheduledPosts),
          automations: Number(row.automations),
          connections: Number(row.connections),
          apiKeys: Number(row.apiKeys),
          mediaItems: Number(row.mediaItems),
          mediaBytes: Number(row.mediaBytes),
          automationContacts: Number(row.automationContacts),
          automationRuns: Number(row.automationRuns),
          transcriptions: Number(row.transcriptions),
          workspaceNames: (row.workspaceNames ?? []) as string[],
        };
      });
      const activeRequest = (ownerId: string) =>
        sql<RequestRow>`SELECT * FROM cancellation_requests
          WHERE billing_owner_user_id = ${ownerId}
            AND status IN ('open','call_booked','offer_accepted','scheduled','effective','deleting')
          ORDER BY created_at DESC LIMIT 1`.pipe(Effect.orDie);
      const alreadyUsedOffer = (ownerId: string) =>
        sql<{ used: boolean }>`SELECT EXISTS(SELECT 1 FROM cancellation_requests
          WHERE billing_owner_user_id = ${ownerId} AND save_offer_accepted = true) AS used`.pipe(
          Effect.map((rows) => rows[0]?.used ?? false),
          Effect.orDie
        );
      const view = Effect.fn("CancellationService.view")(function* (
        ownerId: string,
        calendarReference: string | null = null,
        recoveryUrl: string | null = null
      ) {
        const sub = yield* subscription(ownerId);
        const requests = yield* activeRequest(ownerId);
        const request = requests[0];
        const currentImpact = request?.impact ?? (yield* impact(ownerId));
        const used = yield* alreadyUsedOffer(ownerId);
        return {
          id: request?.id ?? null,
          status: request?.status ?? null,
          reason: request?.reason ?? null,
          comment: request?.comment ?? null,
          currentPeriodEnd: iso(sub.currentPeriodEnd),
          dataDeletionAt: request?.dataDeletionAt
            ? iso(request.dataDeletionAt)
            : sub.currentPeriodEnd
              ? iso(cancellationDeletionAt(sub.currentPeriodEnd))
              : null,
          impact: currentImpact,
          canOfferSave: canGrantMonthlySave(sub, used),
          offerAmountMinor: request?.offerAmountMinor
            ? Number(request.offerAmountMinor)
            : sub.recurringAmountMinor
              ? Number(sub.recurringAmountMinor)
              : null,
          offerCurrency: request?.offerCurrency ?? sub.currency,
          calendarReference,
          calendarBookingAt: request ? iso(request.calendarBookingAt) : null,
          recoveryUrl,
          canManageCancellation: true,
        } satisfies CancellationView;
      });
      const requireRequest = Effect.fn("CancellationService.requireRequest")(
        function* (ownerId: string, requestId: string) {
          const rows =
            yield* sql<RequestRow>`SELECT * FROM cancellation_requests
            WHERE id = ${requestId} AND billing_owner_user_id = ${ownerId}`.pipe(
              Effect.orDie
            );
          if (!rows[0]) {
            return yield* new NotFoundError({
              message: "Cancellation request not found",
              resource: "cancellation_request",
            });
          }
          return rows[0];
        }
      );
      const start = Effect.fn("CancellationService.start")(function* (input: {
        billingOwnerUserId: string;
        reason: CancellationReason;
        comment?: string;
      }) {
        if ((input.comment?.length ?? 0) > 1000) {
          return yield* new ConflictError({
            message: "Cancellation comment must be 1000 characters or fewer",
            resource: "cancellation_request",
          });
        }
        const sub = yield* subscription(input.billingOwnerUserId);
        const existing = yield* activeRequest(input.billingOwnerUserId);
        if (
          existing[0] &&
          !(
            existing[0].status === "open" ||
            existing[0].status === "offer_accepted"
          )
        ) {
          return yield* view(input.billingOwnerUserId);
        }
        const currentImpact = yield* impact(input.billingOwnerUserId);
        const reference = `${crypto.randomUUID()}${crypto.randomUUID()}`;
        const referenceHash = yield* hashReference(reference);
        const requestId =
          existing[0]?.id ?? `cancellation_${crypto.randomUUID()}`;
        yield* sql`INSERT INTO cancellation_requests
          (id, billing_owner_user_id, provider_subscription_id, reason, comment,
            impact, reference_hash, reference_expires_at)
          VALUES (${requestId}, ${input.billingOwnerUserId}, ${sub.providerSubscriptionId},
            ${input.reason}, ${input.comment ?? null}, ${JSON.stringify(currentImpact)}::jsonb,
            ${referenceHash}, now() + interval '24 hours')
          ON CONFLICT (id) DO UPDATE SET reason = EXCLUDED.reason,
            comment = EXCLUDED.comment, impact = EXCLUDED.impact,
            reference_hash = EXCLUDED.reference_hash,
            reference_expires_at = EXCLUDED.reference_expires_at,
            status = 'open'`.pipe(Effect.orDie);
        yield* sql`INSERT INTO cancellation_recipients
          (cancellation_request_id, user_id, email, workspace_names, is_payer)
          SELECT ${requestId}, u.id, u.email,
            array_agg(DISTINCT w.name ORDER BY w.name), u.id = ${input.billingOwnerUserId}
          FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
          JOIN users u ON u.id = wm.user_id
          WHERE w.billing_owner_user_id = ${input.billingOwnerUserId} AND u.email IS NOT NULL
          GROUP BY u.id, u.email
          ON CONFLICT (cancellation_request_id, email) DO UPDATE SET
            workspace_names = EXCLUDED.workspace_names, is_payer = EXCLUDED.is_payer`.pipe(
          Effect.orDie
        );
        yield* sql`INSERT INTO cancellation_recipients
          (cancellation_request_id, user_id, email, workspace_names, is_payer)
          SELECT ${requestId}, u.id, u.email, ${currentImpact.workspaceNames}::text[], true
          FROM users u WHERE u.id = ${input.billingOwnerUserId} AND u.email IS NOT NULL
          ON CONFLICT (cancellation_request_id, email) DO UPDATE SET
            workspace_names = EXCLUDED.workspace_names, is_payer = true`.pipe(
          Effect.orDie
        );
        return yield* view(input.billingOwnerUserId, reference);
      });
      const acceptOffer = Effect.fn("CancellationService.acceptOffer")(
        function* (input: { billingOwnerUserId: string; requestId: string }) {
          const request = yield* requireRequest(
            input.billingOwnerUserId,
            input.requestId
          );
          const sub = yield* subscription(input.billingOwnerUserId);
          if (request.saveOfferAccepted) {
            return yield* view(input.billingOwnerUserId);
          }
          if (request.status !== "open") {
            return yield* new ConflictError({
              message: "The cancellation request cannot accept an offer now",
              resource: "cancellation_request",
            });
          }
          const used = yield* alreadyUsedOffer(input.billingOwnerUserId);
          if (!canGrantMonthlySave(sub, used)) {
            return yield* new ConflictError({
              message: "This subscription is not eligible for the save offer",
              resource: "cancellation_offer",
            });
          }
          const amount = Number(sub.recurringAmountMinor);
          yield* billingProvider.creditWallet({
            customerId: sub.providerCustomerId,
            amountMinor: amount,
            currency: sub.currency,
            idempotencyKey: `retention:${request.id}`,
          });
          const accepted = yield* sql<{
            id: string;
          }>`UPDATE cancellation_requests SET status = 'offer_accepted',
            save_offer_accepted = true, offer_amount_minor = ${amount},
            offer_currency = ${sub.currency} WHERE id = ${request.id}
            AND status = 'open' AND save_offer_accepted = false RETURNING id`.pipe(
            Effect.orDie
          );
          if (!accepted[0]) {
            return yield* new ConflictError({
              message:
                "The cancellation request changed while applying the offer",
              resource: "cancellation_request",
            });
          }
          return yield* view(input.billingOwnerUserId);
        }
      );
      const notify = Effect.fn("CancellationService.notify")(function* (
        requestId: string,
        ownerId: string,
        messageType: string,
        title: string,
        message: string
      ) {
        const request = yield* requireRequest(ownerId, requestId);
        const termEnd = iso(request.scheduledFor) ?? "the end of the paid term";
        const deletionAt = iso(request.dataDeletionAt) ?? "60 days later";
        const recipients = yield* sql<{
          userId: string | null;
          email: string;
          workspaceNames: readonly string[];
        }>`
          SELECT user_id, email, workspace_names FROM cancellation_recipients
          WHERE cancellation_request_id = ${requestId}`.pipe(Effect.orDie);
        for (const recipient of recipients) {
          if (!recipient.userId) {
            continue;
          }
          const body = cancellationEmail({
            title,
            message,
            termEnd,
            deletionAt,
            workspaces: request.impact.workspaces,
            posts: request.impact.posts,
            workspaceNames: recipient.workspaceNames,
            reason: request.reason,
            recoveryUrl: `${providerConfig.appBaseUrl}/billing`,
          });
          yield* messaging.sendTransactional({
            userId: recipient.userId,
            email: recipient.email,
            messageType,
            subject: title,
            ...body,
            replyTo: "notify@delulu.social",
            idempotencyKey: `${messageType}:${requestId}:${recipient.email}`,
          });
        }
      });
      const schedule = Effect.fn("CancellationService.schedule")(
        function* (input: {
          billingOwnerUserId: string;
          requestId: string;
          confirmation: string;
        }) {
          if (input.confirmation !== CANCELLATION_CONFIRMATION) {
            return yield* new ConflictError({
              message: `Type ${CANCELLATION_CONFIRMATION} to confirm`,
              resource: "cancellation_request",
            });
          }
          const request = yield* requireRequest(
            input.billingOwnerUserId,
            input.requestId
          );
          if (request.status === "scheduled") {
            return yield* view(input.billingOwnerUserId);
          }
          if (request.status !== "open") {
            return yield* new ConflictError({
              message: "The cancellation request cannot be scheduled now",
              resource: "cancellation_request",
            });
          }
          const sub = yield* subscription(input.billingOwnerUserId);
          const currentImpact = yield* impact(input.billingOwnerUserId);
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`UPDATE cancellation_requests SET
                impact = ${JSON.stringify(currentImpact)}::jsonb WHERE id = ${request.id}`;
                yield* sql`DELETE FROM cancellation_recipients
                WHERE cancellation_request_id = ${request.id}`;
                yield* sql`INSERT INTO cancellation_recipients
                (cancellation_request_id, user_id, email, workspace_names, is_payer)
                SELECT ${request.id}, u.id, u.email,
                  array_agg(DISTINCT w.name ORDER BY w.name), u.id = ${input.billingOwnerUserId}
                FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
                JOIN users u ON u.id = wm.user_id
                WHERE w.billing_owner_user_id = ${input.billingOwnerUserId} AND u.email IS NOT NULL
                GROUP BY u.id, u.email`;
                yield* sql`INSERT INTO cancellation_recipients
                (cancellation_request_id, user_id, email, workspace_names, is_payer)
                SELECT ${request.id}, u.id, u.email, ${currentImpact.workspaceNames}::text[], true
                FROM users u WHERE u.id = ${input.billingOwnerUserId} AND u.email IS NOT NULL
                ON CONFLICT (cancellation_request_id, email) DO UPDATE SET
                  workspace_names = EXCLUDED.workspace_names, is_payer = true`;
              })
            )
            .pipe(Effect.orDie);
          if (!sub.currentPeriodEnd) {
            return yield* new ConflictError({
              message: "The subscription has no paid term end",
              resource: "subscription",
            });
          }
          const providerResponse = yield* billingProvider.scheduleCancellation({
            subscriptionId: sub.providerSubscriptionId!,
            reason: request.reason,
            comment: request.comment ?? undefined,
          });
          const deletionAt = cancellationDeletionAt(sub.currentPeriodEnd);
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const scheduled = yield* sql<{
                  id: string;
                }>`UPDATE cancellation_requests SET status = 'scheduled',
          scheduled_for = ${sub.currentPeriodEnd}, data_deletion_at = ${deletionAt},
          provider_response = ${JSON.stringify(providerResponse)}::jsonb
          WHERE id = ${request.id} AND status = 'open' RETURNING id`.pipe(
                  Effect.orDie
                );
                if (!scheduled[0]) {
                  return yield* new ConflictError({
                    message:
                      "The cancellation request changed while scheduling",
                    resource: "cancellation_request",
                  });
                }
                yield* jobs.enqueue({
                  workspaceId: input.billingOwnerUserId,
                  payload: {
                    _tag: "CancellationDeadline",
                    requestId: request.id,
                  },
                  runAt: new Date(),
                  idempotencyKey: `cancellation:${request.id}`,
                });
                yield* sql`UPDATE subscriptions SET cancel_at_period_end = true
          WHERE billing_owner_user_id = ${input.billingOwnerUserId}`.pipe(
                  Effect.orDie
                );
              })
            )
            .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));
          yield* notify(
            request.id,
            input.billingOwnerUserId,
            "cancellation_scheduled",
            "Subscription cancellation scheduled",
            "Every workspace funded by this subscription and its product data will be permanently deleted unless the subscription is restored."
          );
          const owners = yield* sql<{
            email: string | null;
          }>`SELECT email FROM users WHERE id = ${input.billingOwnerUserId}`.pipe(
            Effect.orDie
          );
          if (owners[0]?.email) {
            yield* messaging.track({
              userId: input.billingOwnerUserId,
              email: owners[0].email,
              event: "cancellation_scheduled",
              properties: {
                deletion_at: iso(deletionAt),
                reason: request.reason,
              },
              idempotencyKey: `lifecycle:cancellation:${request.id}`,
            });
          }
          return yield* view(input.billingOwnerUserId);
        }
      );
      const reactivate = Effect.fn("CancellationService.reactivate")(
        function* (input: { billingOwnerUserId: string; requestId: string }) {
          const request = yield* requireRequest(
            input.billingOwnerUserId,
            input.requestId
          );
          const sub = yield* subscription(input.billingOwnerUserId);
          if (["effective", "deleting"].includes(request.status)) {
            if (!sub.providerCustomerId) {
              return yield* new ConflictError({
                message: "Billing customer not found",
                resource: "subscription",
              });
            }
            const recoveryUrl = yield* billingProvider.checkout({
              customerId: sub.providerCustomerId,
              billingOwnerUserId: input.billingOwnerUserId,
              plan: sub.plan.toUpperCase(),
              billingInterval: sub.billingInterval,
              currency: sub.currency,
            });
            return yield* view(input.billingOwnerUserId, null, recoveryUrl);
          }
          if (request.status === "deleted") {
            return yield* new ConflictError({
              message: "Deleted workspace data cannot be restored",
              resource: "subscription",
            });
          }
          if (request.status === "reactivated") {
            return yield* view(input.billingOwnerUserId);
          }
          if (request.status !== "scheduled") {
            return yield* new ConflictError({
              message: "The cancellation request is not awaiting reactivation",
              resource: "cancellation_request",
            });
          }
          yield* billingProvider.undoCancellation(sub.providerSubscriptionId!);
          const reactivated = yield* sql<{
            id: string;
          }>`UPDATE cancellation_requests SET status = 'reactivated',
            data_deletion_at = NULL WHERE id = ${request.id}
            AND status = 'scheduled' RETURNING id`.pipe(Effect.orDie);
          if (!reactivated[0]) {
            return yield* new ConflictError({
              message:
                "The cancellation request changed while restoring access",
              resource: "cancellation_request",
            });
          }
          yield* sql`UPDATE subscriptions SET cancel_at_period_end = false
            WHERE billing_owner_user_id = ${input.billingOwnerUserId}`.pipe(
            Effect.orDie
          );
          return yield* view(input.billingOwnerUserId);
        }
      );
      const abandon = Effect.fn("CancellationService.abandon")(
        function* (input: { billingOwnerUserId: string; requestId: string }) {
          const request = yield* requireRequest(
            input.billingOwnerUserId,
            input.requestId
          );
          if (
            !(request.status === "open" || request.status === "call_booked")
          ) {
            return yield* new ConflictError({
              message:
                "Only an unfinished cancellation request can be abandoned",
              resource: "cancellation_request",
            });
          }
          const abandoned = yield* sql<{
            id: string;
          }>`UPDATE cancellation_requests SET status = 'abandoned'
          WHERE id = ${input.requestId} AND status IN ('open','call_booked')
          RETURNING id`.pipe(Effect.orDie);
          if (!abandoned[0]) {
            return yield* new ConflictError({
              message: "The cancellation request changed before it was closed",
              resource: "cancellation_request",
            });
          }
          return yield* view(input.billingOwnerUserId);
        }
      );
      const handleCalendar = Effect.fn("CancellationService.handleCalendar")(
        function* (input: {
          event:
            | "BOOKING_CREATED"
            | "BOOKING_RESCHEDULED"
            | "BOOKING_CANCELLED";
          reference: string;
          bookingUid: string;
          bookingAt?: string;
          attendeeEmail?: string;
        }) {
          const referenceHash = yield* hashReference(input.reference);
          const rows = yield* sql<{
            id: string;
          }>`SELECT id FROM cancellation_requests
            WHERE reference_hash = ${referenceHash}
              AND (${input.event} <> 'BOOKING_CREATED' OR reference_expires_at > now())
              AND CASE
                WHEN ${input.event} = 'BOOKING_CREATED' THEN
                  (status = 'open' AND calendar_booking_uid IS NULL)
                  OR (status = 'call_booked' AND calendar_booking_uid = ${input.bookingUid})
                WHEN ${input.event} = 'BOOKING_RESCHEDULED' THEN status = 'call_booked'
                ELSE status = 'call_booked' AND calendar_booking_uid = ${input.bookingUid}
              END LIMIT 1`.pipe(Effect.orDie);
          if (!rows[0]) {
            return false;
          }
          if (input.event === "BOOKING_CANCELLED") {
            yield* sql`UPDATE cancellation_requests SET status = 'open',
              calendar_booking_uid = NULL, calendar_booking_at = NULL,
              calendar_attendee_email = NULL WHERE id = ${rows[0].id}`.pipe(
              Effect.orDie
            );
          } else {
            yield* sql`UPDATE cancellation_requests SET status = 'call_booked',
              calendar_booking_uid = ${input.bookingUid},
              calendar_booking_at = ${input.bookingAt ? new Date(input.bookingAt) : new Date()},
              calendar_attendee_email = ${input.attendeeEmail ?? null}
              WHERE id = ${rows[0].id}`.pipe(Effect.orDie);
          }
          return true;
        }
      );
      const runRetention = Effect.fn("CancellationService.runRetention")(
        function* (requestId: string) {
          const due = yield* sql<{
            id: string;
            billingOwnerUserId: string;
            status: string;
            dataDeletionAt: Date;
            scheduledFor: Date;
          }>`SELECT id, billing_owner_user_id, status, data_deletion_at, scheduled_for
            FROM cancellation_requests WHERE id = ${requestId} AND status IN ('scheduled','effective','deleting','deleted')
              AND data_deletion_at IS NOT NULL`.pipe(Effect.orDie);
          const now = Date.now();
          let next: number | null = null;
          for (const request of due) {
            if (request.status === "deleted") {
              yield* notify(
                request.id,
                request.billingOwnerUserId,
                "data_deleted",
                "Workspace data permanently deleted",
                "The workspaces funded by the cancelled subscription and their product data have been deleted."
              ).pipe(Effect.orDie);
              continue;
            }
            if (request.status === "scheduled") {
              yield* notify(
                request.id,
                request.billingOwnerUserId,
                "cancellation_scheduled",
                "Subscription cancellation scheduled",
                "Every workspace funded by this subscription and its product data will be permanently deleted unless the subscription is restored."
              ).pipe(Effect.orDie);
            }
            const remaining = request.dataDeletionAt.getTime() - now;
            const deadlines = [
              request.dataDeletionAt.getTime() - 30 * 86_400_000,
              request.dataDeletionAt.getTime() - 7 * 86_400_000,
              request.dataDeletionAt.getTime(),
            ];
            next = deadlines.find((deadline) => deadline > now) ?? null;
            if (remaining <= 0 && request.status !== "scheduled") {
              next = now + 30_000;
            }
            if (remaining <= 30 * 86_400_000 && remaining > 7 * 86_400_000) {
              yield* notify(
                request.id,
                request.billingOwnerUserId,
                "deletion_warning_30d",
                "Your workspaces will be deleted in 30 days",
                "Restore your subscription to prevent permanent deletion."
              ).pipe(Effect.orDie);
            }
            if (remaining <= 7 * 86_400_000 && remaining > 0) {
              yield* notify(
                request.id,
                request.billingOwnerUserId,
                "deletion_warning_7d",
                "Your workspaces will be deleted in 7 days",
                "This is the final recovery warning before permanent deletion."
              ).pipe(Effect.orDie);
            }
            if (remaining <= 0) {
              yield* sql`UPDATE cancellation_requests SET status = 'deleting'
                WHERE id = ${request.id} AND status = 'effective'`.pipe(
                Effect.orDie
              );
              const objects = yield* sql<{ id: string; bucketKey: string }>`
                SELECT m.id, m.bucket_key FROM media m JOIN workspaces w ON w.id = m.workspace_id
                WHERE w.billing_owner_user_id = ${request.billingOwnerUserId}
                ORDER BY m.created_at LIMIT 100`.pipe(Effect.orDie);
              for (const object of objects) {
                const state = yield* sql<{ active: boolean }>`SELECT EXISTS(
                  SELECT 1 FROM cancellation_requests
                  WHERE id = ${request.id} AND status = 'deleting'
                ) AS active`.pipe(Effect.orDie);
                if (!state[0]?.active) {
                  break;
                }
                const removed = yield* r2
                  .remove(object.bucketKey)
                  .pipe(Effect.result);
                if (removed._tag === "Success") {
                  yield* sql`DELETE FROM media WHERE id = ${object.id}`.pipe(
                    Effect.orDie
                  );
                }
              }
              if (objects.length === 0) {
                const state = yield* sql<{ active: boolean }>`SELECT EXISTS(
                  SELECT 1 FROM cancellation_requests
                  WHERE id = ${request.id} AND status = 'deleting'
                ) AS active`.pipe(Effect.orDie);
                if (!state[0]?.active) {
                  continue;
                }
                yield* sql
                  .withTransaction(
                    Effect.gen(function* () {
                      const locked = yield* sql<{
                        id: string;
                      }>`SELECT id FROM cancellation_requests
                      WHERE id = ${request.id} AND status = 'deleting' FOR UPDATE`;
                      if (!locked[0]) {
                        return;
                      }
                      yield* sql`UPDATE oauth_grants SET revoked_at = now()
                      WHERE user_id = ${request.billingOwnerUserId} AND revoked_at IS NULL`;
                      yield* sql`UPDATE oauth_refresh_tokens SET revoked_at = now()
                      WHERE user_id = ${request.billingOwnerUserId} AND revoked_at IS NULL`;
                      yield* sql`UPDATE workspaces SET parent_org_id = NULL
                      WHERE parent_org_id IN (SELECT id FROM workspaces
                        WHERE billing_owner_user_id = ${request.billingOwnerUserId})`;
                      yield* sql`DELETE FROM workspaces
                      WHERE billing_owner_user_id = ${request.billingOwnerUserId}`;
                      yield* sql`UPDATE cancellation_requests SET status = 'deleted',
                      completed_at = now() WHERE id = ${request.id}`;
                    })
                  )
                  .pipe(Effect.orDie);
                yield* notify(
                  request.id,
                  request.billingOwnerUserId,
                  "data_deleted",
                  "Workspace data permanently deleted",
                  "The workspaces funded by the cancelled subscription and their product data have been deleted."
                ).pipe(Effect.orDie);
              }
            }
          }
          return next;
        }
      );
      return CancellationService.of({
        get: view,
        portal: Effect.fn("CancellationService.portal")(function* (ownerId) {
          const sub = yield* subscription(ownerId);
          if (!sub.providerCustomerId) {
            return yield* new NotFoundError({
              message: "Billing customer not found",
              resource: "billing_customer",
            });
          }
          return yield* billingProvider.portal(sub.providerCustomerId);
        }),
        start,
        acceptOffer,
        schedule,
        reactivate,
        abandon,
        handleCalendar,
        runRetention,
      });
    })
  );
}
