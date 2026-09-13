import {
  automationButtonValidationIssues,
  TokenCipher,
  type UserId,
  type WorkspaceId,
} from "@delulu/core";
import { BillingWebhookEvent } from "@delulu/core/domain/billing";
import { WebhookIngressError } from "@delulu/core/domain/webhook-delivery";
import { getPlanFromProductId } from "@delulu/payments";
import { isSortedProductId } from "@delulu/payments/product-ids";
import {
  BillingWebhookApplication,
  MessagingService,
  PaymentWebhookSink,
  ProviderAudienceError,
  ProviderAudienceService,
  ProviderCommentReplyError,
  ProviderCommentReplyService,
  ProviderDmError,
  type ProviderDmRequest,
  ProviderDmService,
  SetupService,
} from "@delulu/services";
import { Effect, Layer, Predicate, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

const API_BASE = "https://graph.instagram.com/v24.0";

interface Credentials {
  readonly profileId: string;
  readonly accessToken: string;
}

const connectionCredentials = Effect.fn("AutomationProvider.credentials")(
  function* (connectionId: string) {
    const sql = yield* SqlClient.SqlClient;
    const cipher = yield* TokenCipher;
    const rows = yield* sql<{
      platform: string;
      profileId: string;
      accessToken: string;
      cipherVersion: "v1";
    }>`SELECT platform, profile_id, access_token, cipher_version
        FROM connections WHERE id = ${connectionId}`.pipe(
      Effect.mapError(() => "Automation connection query failed" as const)
    );
    const row = rows[0];
    if (!row) {
      return yield* Effect.fail("Automation connection was not found" as const);
    }
    if (row.platform !== "INSTAGRAM") {
      return yield* Effect.fail(
        `Automation connection platform was ${row.platform}` as const
      );
    }
    const accessToken = yield* cipher
      .decrypt({
        ciphertext: row.accessToken,
        cipherVersion: row.cipherVersion,
      })
      .pipe(
        Effect.mapError(
          () =>
            "Unable to decrypt the automation connection credential" as const
        )
      );
    return { profileId: row.profileId, accessToken } satisfies Credentials;
  }
);

const ProviderSendResponse = Schema.Struct({
  message_id: Schema.optional(Schema.String),
  recipient_id: Schema.optional(Schema.String),
});

export const metaProviderErrorMessage = (
  operation: "DM" | "comment reply",
  status: number,
  payload: unknown
): string => {
  const error =
    Predicate.isObject(payload) && Predicate.isObject(payload.error)
      ? payload.error
      : null;
  const message =
    error && Predicate.isString(error.message)
      ? `: ${error.message.slice(0, 500)}`
      : "";
  const code =
    error && Predicate.isNumber(error.code) ? ` code=${error.code}` : "";
  const subcode =
    error && Predicate.isNumber(error.error_subcode)
      ? ` subcode=${error.error_subcode}`
      : "";
  return `${operation} provider returned ${status}${code}${subcode}${message}`;
};

const readMetaProviderError = (
  operation: "DM" | "comment reply",
  response: Response
) =>
  Effect.promise(() =>
    (response.json() as Promise<unknown>).catch(() => null)
  ).pipe(
    Effect.map((payload) =>
      metaProviderErrorMessage(operation, response.status, payload)
    )
  );

export const instagramDmRecipient = (
  input: Pick<ProviderDmRequest, "recipientId" | "recipientCommentId">
) =>
  input.recipientCommentId
    ? { comment_id: input.recipientCommentId }
    : { id: input.recipientId };

export const instagramDmMessage = (
  input: Pick<ProviderDmRequest, "message" | "buttons" | "recipientCommentId">
) => {
  const quickReplies = input.buttons
    .filter((button) => button.type === "quick_reply")
    .map((button) => ({
      content_type: "text",
      title: button.title,
      payload: button.payload,
    }));
  const urlButtons = input.buttons
    .filter((button) => button.type === "url")
    .map((button) => ({
      type: "web_url" as const,
      title: button.title,
      url: button.url,
    }));
  if (input.recipientCommentId && urlButtons.length > 0) {
    const links = urlButtons
      .map((button) => `${button.title}: ${button.url}`)
      .join("\n");
    return { text: `${input.message.trimEnd()}\n\n${links}` };
  }
  if (urlButtons.length > 0) {
    const postbackButtons = quickReplies.map((button) => ({
      type: "postback" as const,
      title: button.title,
      payload: button.payload,
    }));
    return {
      attachment: {
        type: "template" as const,
        payload: {
          template_type: "button" as const,
          text: input.message,
          buttons: [...urlButtons, ...postbackButtons],
        },
      },
    };
  }
  return {
    text: input.message,
    ...(quickReplies.length > 0 ? { quick_replies: quickReplies } : {}),
  };
};

export const AutomationProviderLive = Layer.mergeAll(
  Layer.effect(
    ProviderDmService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const cipher = yield* TokenCipher;
      const send = Effect.fn("AutomationProvider.sendDm")(function* (input) {
        const buttonIssues = automationButtonValidationIssues(input.buttons);
        if (buttonIssues.length > 0) {
          return yield* new ProviderDmError({
            message: buttonIssues[0].message,
            retryable: false,
            deliveryState: "not_sent",
          });
        }
        const credentials = yield* connectionCredentials(
          input.connectionId
        ).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(TokenCipher, cipher),
          Effect.mapError(
            (message) =>
              new ProviderDmError({
                message,
                retryable: false,
                deliveryState: "not_sent",
              })
          )
        );
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${API_BASE}/${credentials.profileId}/messages`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${credentials.accessToken}`,
                "content-type": "application/json",
                "idempotency-key": input.idempotencyKey,
              },
              body: JSON.stringify({
                recipient: instagramDmRecipient(input),
                message: instagramDmMessage(input),
              }),
            }),
          catch: () =>
            new ProviderDmError({
              message: "DM provider request failed before acceptance",
              retryable: true,
              deliveryState: "not_sent",
            }),
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const message = yield* readMetaProviderError("DM", response);
          yield* Effect.logError("Instagram DM request failed", {
            connectionId: input.connectionId,
            status: response.status,
            retryable,
            failure: message,
          });
          return yield* new ProviderDmError({
            message,
            retryable,
            deliveryState: "not_sent",
          });
        }
        const payload = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: () =>
            new ProviderDmError({
              message: "DM provider accepted the request without valid JSON",
              retryable: true,
              deliveryState: "unknown",
            }),
        }).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ProviderSendResponse)),
          Effect.mapError((error) =>
            error instanceof ProviderDmError
              ? error
              : new ProviderDmError({
                  message: "DM provider returned an invalid response",
                  retryable: true,
                  deliveryState: "unknown",
                })
          )
        );
        const messageId = payload.message_id ?? payload.recipient_id;
        if (!messageId) {
          return yield* new ProviderDmError({
            message: "DM provider response did not identify the delivery",
            retryable: true,
            deliveryState: "unknown",
          });
        }
        return { messageId };
      });
      return ProviderDmService.of({ send });
    })
  ),
  Layer.effect(
    ProviderCommentReplyService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const cipher = yield* TokenCipher;
      const reply = Effect.fn("AutomationProvider.replyToComment")(
        function* (input) {
          const credentials = yield* connectionCredentials(
            input.connectionId
          ).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.provideService(TokenCipher, cipher),
            Effect.mapError(
              (message) =>
                new ProviderCommentReplyError({
                  message,
                  retryable: false,
                  deliveryState: "not_sent",
                })
            )
          );
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`${API_BASE}/${input.commentId}/replies`, {
                method: "POST",
                headers: {
                  authorization: `Bearer ${credentials.accessToken}`,
                  "content-type": "application/json",
                },
                body: JSON.stringify({ message: input.message }),
              }),
            catch: () =>
              new ProviderCommentReplyError({
                message: "Comment reply request failed before confirmation",
                retryable: true,
                deliveryState: "unknown",
              }),
          });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            const message = yield* readMetaProviderError(
              "comment reply",
              response
            );
            yield* Effect.logError("Instagram comment reply request failed", {
              connectionId: input.connectionId,
              status: response.status,
              retryable,
              failure: message,
            });
            return yield* new ProviderCommentReplyError({
              message,
              retryable,
              deliveryState: "not_sent",
            });
          }
          const payload = yield* Effect.tryPromise({
            try: () => response.json() as Promise<unknown>,
            catch: () =>
              new ProviderCommentReplyError({
                message: "Comment reply response was not valid JSON",
                retryable: true,
                deliveryState: "unknown",
              }),
          });
          const decoded = yield* Schema.decodeUnknownEffect(
            Schema.Struct({ id: Schema.String })
          )(payload).pipe(
            Effect.mapError(
              () =>
                new ProviderCommentReplyError({
                  message: "Comment reply response was malformed",
                  retryable: true,
                  deliveryState: "unknown",
                })
            )
          );
          return { responseId: decoded.id };
        }
      );
      return ProviderCommentReplyService.of({ reply });
    })
  ),
  Layer.effect(
    ProviderAudienceService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const cipher = yield* TokenCipher;
      const Response = Schema.Struct({
        is_user_follow_business: Schema.optional(Schema.Boolean),
      });
      const isFollower = Effect.fn("AutomationProvider.isFollower")(
        function* (input) {
          const credentials = yield* connectionCredentials(
            input.connectionId
          ).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.provideService(TokenCipher, cipher),
            Effect.mapError(
              (message) =>
                new ProviderAudienceError({
                  message,
                  retryable: false,
                })
            )
          );
          const url = new URL(`${API_BASE}/${input.platformUserId}`);
          url.searchParams.set("fields", "is_user_follow_business");
          url.searchParams.set("access_token", credentials.accessToken);
          const response = yield* Effect.tryPromise({
            try: () => fetch(url),
            catch: () =>
              new ProviderAudienceError({
                message: "Audience lookup failed",
                retryable: true,
              }),
          });
          if (!response.ok) {
            return yield* new ProviderAudienceError({
              message: `Audience provider returned ${response.status}`,
              retryable: response.status === 429 || response.status >= 500,
            });
          }
          const json = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: () =>
              new ProviderAudienceError({
                message: "Audience provider returned invalid JSON",
                retryable: false,
              }),
          });
          const decoded = yield* Schema.decodeUnknownEffect(Response)(
            json
          ).pipe(
            Effect.mapError(
              () =>
                new ProviderAudienceError({
                  message: "Audience provider returned an invalid response",
                  retryable: false,
                })
            )
          );
          return decoded.is_user_follow_business ?? false;
        }
      );
      return ProviderAudienceService.of({ isFollower });
    })
  )
);

const stringField = (value: unknown, key: string): string | undefined =>
  Predicate.isObject(value) && Predicate.isString(value[key])
    ? value[key]
    : undefined;

const numberField = (value: unknown, key: string): number | undefined =>
  Predicate.isObject(value) && Predicate.isNumber(value[key])
    ? value[key]
    : undefined;

const booleanField = (value: unknown, key: string): boolean | undefined =>
  Predicate.isObject(value) && Predicate.isBoolean(value[key])
    ? value[key]
    : undefined;

const objectField = (value: unknown, key: string): object | undefined =>
  Predicate.isObject(value) && Predicate.isObject(value[key])
    ? value[key]
    : undefined;

const providerData = (input: unknown): object | undefined => {
  if (!Predicate.isObject(input)) {
    return undefined;
  }
  return objectField(input, "object") ?? input;
};

const invalidBillingPayload = (message: string) =>
  new WebhookIngressError({
    reason: "invalid_payload",
    message,
    retryable: false,
  });

const billingLookupFailed = () =>
  new WebhookIngressError({
    reason: "processing_failed",
    message: "Unable to resolve the payment webhook owner",
    retryable: true,
  });

const billingOutboxKeys = (
  event: typeof BillingWebhookEvent.Type
): readonly string[] => {
  if (event._tag === "SubscriptionChanged") {
    return [
      `billing:${event.eventId}:identify`,
      `billing:${event.eventId}:subscription`,
    ] as const;
  }
  if (event._tag === "AddonSubscriptionChanged") {
    return [`billing:${event.eventId}:addon`] as const;
  }
  if (event._tag === "UnrecognizedSubscriptionChanged") {
    return [`billing:${event.eventId}:unrecognized`] as const;
  }
  return event.providerEventType === "payment.failed"
    ? ([
        `billing:${event.eventId}:payment`,
        `payment-failed:${event.eventId}`,
      ] as const)
    : ([`billing:${event.eventId}:payment`] as const);
};

export const PaymentWebhookSinkLive = Layer.effect(
  PaymentWebhookSink,
  Effect.gen(function* () {
    const billing = yield* BillingWebhookApplication;
    const setup = yield* SetupService;
    const messaging = yield* MessagingService;
    const sql = yield* SqlClient.SqlClient;

    const resolveBillingOwner = Effect.fn("PaymentWebhook.resolveOwner")(
      function* (data: object) {
        const metadata = objectField(data, "metadata");
        const metadataOwner = metadata
          ? (stringField(metadata, "billing_owner_user_id") ??
            stringField(metadata, "billingOwnerUserId"))
          : undefined;
        if (metadataOwner) {
          return metadataOwner;
        }

        const customer = objectField(data, "customer");
        const customerId = customer
          ? stringField(customer, "customer_id")
          : undefined;
        if (customerId) {
          const owners = yield* sql<{ billingOwnerUserId: string }>`
            SELECT billing_owner_user_id FROM subscriptions
            WHERE provider_customer_id = ${customerId} LIMIT 1`.pipe(
            Effect.mapError(billingLookupFailed)
          );
          if (owners[0]) {
            return owners[0].billingOwnerUserId;
          }
        }

        const email = customer ? stringField(customer, "email") : undefined;
        if (email) {
          const users = yield* sql<{ id: string }>`
            SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`.pipe(
            Effect.mapError(billingLookupFailed)
          );
          if (users[0]) {
            return users[0].id;
          }
        }

        return yield* invalidBillingPayload(
          "Payment webhook could not be matched to a billing owner"
        );
      }
    );

    const normalize = Effect.fn("PaymentWebhook.normalize")(function* (
      eventId: string,
      type: string,
      rawData: unknown,
      occurredAt: string | number | undefined
    ) {
      if (!(type.startsWith("subscription.") || type.startsWith("payment."))) {
        return null;
      }
      const data = providerData(rawData);
      if (!data) {
        return yield* invalidBillingPayload(
          "Payment webhook data must be an object"
        );
      }
      const billingOwnerUserId = yield* resolveBillingOwner(data);
      const providerOccurredAt =
        typeof occurredAt === "number"
          ? new Date(
              occurredAt < 10_000_000_000 ? occurredAt * 1000 : occurredAt
            ).toISOString()
          : (occurredAt ?? null);
      const customer = objectField(data, "customer");
      const customerId = customer
        ? (stringField(customer, "customer_id") ?? null)
        : null;

      if (type.startsWith("subscription.")) {
        const subscriptionId = stringField(data, "subscription_id");
        const productId = stringField(data, "product_id");
        const status = stringField(data, "status") ?? type.slice(13);
        if (!(subscriptionId && productId)) {
          return yield* invalidBillingPayload(
            "Subscription webhook is missing its subscription or product id"
          );
        }
        if (isSortedProductId(productId)) {
          return {
            _tag: "AddonSubscriptionChanged" as const,
            eventId,
            providerEventType: type,
            providerOccurredAt,
            billingOwnerUserId,
            providerCustomerId: customerId,
            providerSubscriptionId: subscriptionId,
            addon: "sorted" as const,
            status,
            currentPeriodStart:
              stringField(data, "previous_billing_date") ?? null,
            currentPeriodEnd: stringField(data, "next_billing_date") ?? null,
            cancelAtPeriodEnd:
              booleanField(data, "cancel_at_next_billing_date") ?? false,
          };
        }
        const recognizedPlan = getPlanFromProductId(productId);
        if (!recognizedPlan) {
          return {
            _tag: "UnrecognizedSubscriptionChanged" as const,
            eventId,
            providerEventType: type,
            providerOccurredAt,
            billingOwnerUserId,
            providerCustomerId: customerId,
            providerSubscriptionId: subscriptionId,
            productId,
            status,
          };
        }
        const plan = recognizedPlan.planType;
        return {
          _tag: "SubscriptionChanged" as const,
          eventId,
          providerEventType: type,
          providerOccurredAt,
          billingOwnerUserId,
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          plan,
          status,
          currentPeriodStart:
            stringField(data, "previous_billing_date") ?? null,
          currentPeriodEnd: stringField(data, "next_billing_date") ?? null,
          billingInterval:
            stringField(data, "payment_frequency_interval")?.toUpperCase() ??
            null,
          currency: stringField(data, "currency") ?? null,
          recurringAmountMinor:
            numberField(data, "recurring_pre_tax_amount") ?? null,
          cancelAtPeriodEnd:
            booleanField(data, "cancel_at_next_billing_date") ?? false,
          addons: { items: "addons" in data ? data.addons : [] },
        };
      }

      if (type.startsWith("payment.")) {
        const paymentId = stringField(data, "payment_id");
        const amount = numberField(data, "total_amount");
        const currency = stringField(data, "currency");
        if (!(paymentId && amount !== undefined && currency)) {
          return yield* invalidBillingPayload(
            "Payment webhook is missing its id, amount, or currency"
          );
        }
        return {
          _tag: "TransactionChanged" as const,
          eventId,
          providerEventType: type,
          providerOccurredAt,
          billingOwnerUserId,
          providerTransactionId: paymentId,
          amountMinor: amount,
          currency,
          status: stringField(data, "status") ?? type.slice(8),
          metadata: {
            ...(objectField(data, "metadata") ?? {}),
            providerCustomerId: customerId,
            providerSubscriptionId:
              stringField(data, "subscription_id") ?? null,
          },
        };
      }
    });

    return PaymentWebhookSink.of({
      process: Effect.fn("PaymentWebhookSink.process")(function* (input) {
        const candidate = yield* normalize(
          input.eventId,
          input.event.type,
          input.event.data,
          input.event.created_at ?? input.event.timestamp
        );
        if (candidate === null) {
          return;
        }
        const event = yield* Schema.decodeUnknownEffect(BillingWebhookEvent)(
          candidate
        ).pipe(
          Effect.mapError(
            () =>
              new WebhookIngressError({
                reason: "invalid_payload",
                message:
                  "Payment webhook data is not a normalized billing event",
                retryable: false,
              })
          )
        );
        const application = yield* billing.apply(event).pipe(
          Effect.mapError(
            (error) =>
              new WebhookIngressError({
                reason: "processing_failed",
                message: error.message,
                retryable: error.retryable,
              })
          )
        );
        if (application.stale) {
          return;
        }
        if (application.applied) {
          const workspaces = yield* sql<{ id: string }>`
            SELECT id FROM workspaces
            WHERE billing_owner_user_id = ${event.billingOwnerUserId}`.pipe(
            Effect.mapError(billingLookupFailed)
          );
          yield* Effect.forEach(workspaces, (workspace) =>
            setup.status(
              workspace.id as WorkspaceId,
              event.billingOwnerUserId as UserId
            )
          );
        } else {
          const keys = billingOutboxKeys(event);
          const existing = yield* sql<{
            count: string;
          }>`SELECT count(*)::text AS count
            FROM message_deliveries
            WHERE idempotency_key = ${keys[0]}
              OR idempotency_key = ${keys[1] ?? keys[0]}`.pipe(
            Effect.mapError(billingLookupFailed)
          );
          if (Number(existing[0]?.count ?? 0) === keys.length) {
            return;
          }
        }
        // Re-run durable outbox writes on provider replay. Their idempotency
        // keys make this safe and recover a prior attempt that committed the
        // billing event but failed before enqueueing lifecycle messages.
        const recipients = yield* sql<{
          email: string | null;
        }>`SELECT email FROM users
          WHERE id = ${event.billingOwnerUserId}`.pipe(
          Effect.mapError(billingLookupFailed)
        );
        const email = recipients[0]?.email;
        if (!email) {
          return;
        }
        if (event._tag === "SubscriptionChanged") {
          yield* messaging.identify({
            userId: event.billingOwnerUserId,
            email,
            attributes: {
              paid_plan: event.plan,
              subscription_status: event.status,
              billing_period_end: event.currentPeriodEnd,
              billing_interval: event.billingInterval,
              cancellation_pending: event.cancelAtPeriodEnd,
            },
            idempotencyKey: `billing:${event.eventId}:identify`,
          });
          yield* messaging.track({
            userId: event.billingOwnerUserId,
            email,
            event: event.providerEventType,
            properties: {
              plan: event.plan,
              status: event.status,
              billing_interval: event.billingInterval,
              cancellation_pending: event.cancelAtPeriodEnd,
            },
            idempotencyKey: `billing:${event.eventId}:subscription`,
          });
        } else if (event._tag === "AddonSubscriptionChanged") {
          yield* messaging.track({
            userId: event.billingOwnerUserId,
            email,
            event: event.providerEventType,
            properties: {
              addon: event.addon,
              status: event.status,
              cancellation_pending: event.cancelAtPeriodEnd,
            },
            idempotencyKey: `billing:${event.eventId}:addon`,
          });
        } else if (event._tag === "UnrecognizedSubscriptionChanged") {
          yield* messaging.track({
            userId: event.billingOwnerUserId,
            email,
            event: event.providerEventType,
            properties: {
              product_id: event.productId,
              status: event.status,
              recognized_product: false,
            },
            idempotencyKey: `billing:${event.eventId}:unrecognized`,
          });
        } else {
          yield* messaging.track({
            userId: event.billingOwnerUserId,
            email,
            event:
              event.providerEventType === "payment.failed"
                ? "payment_failed"
                : "payment_succeeded",
            properties: {
              amount_minor: event.amountMinor,
              currency: event.currency,
            },
            idempotencyKey: `billing:${event.eventId}:payment`,
          });
          if (event.providerEventType === "payment.failed") {
            yield* messaging.sendTransactional({
              userId: event.billingOwnerUserId,
              email,
              messageType: "payment_failed",
              subject: "Action needed: payment failed",
              html: "<h1>Your payment failed</h1><p>Please update your payment method to keep publishing and automations running.</p>",
              text: "Your payment failed. Please update your payment method to keep publishing and automations running.",
              replyTo: "notify@delulu.social",
              idempotencyKey: `payment-failed:${event.eventId}`,
            });
          }
        }
      }),
    });
  })
);
