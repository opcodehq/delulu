import {
  CalendarWebhookConfig,
  CancellationService,
  EntitlementPolicy,
  SignedIngress,
  type StandardHeaders,
  verifyCalendarWebhook,
  WebhookIngressService,
} from "@delulu/services";
import { Effect, Predicate } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

const header = (
  request: { readonly headers: unknown },
  name: string
): string | null => {
  if (!Predicate.isObject(request.headers)) {
    return null;
  }
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  return Predicate.isString(value) ? value : null;
};

const standardHeaders = (
  request: { readonly headers: unknown },
  prefix: "svix" | "webhook"
): StandardHeaders | null => {
  const id = header(request, `${prefix}-id`);
  const timestamp = header(request, `${prefix}-timestamp`);
  const signature = header(request, `${prefix}-signature`);
  return id && timestamp && signature ? { id, timestamp, signature } : null;
};

const responseFor = <A>(
  provider: "meta" | "clerk" | "dodo",
  effect: Effect.Effect<A, unknown>
) =>
  effect.pipe(
    Effect.map((processed) =>
      HttpServerResponse.jsonUnsafe({
        accepted: true,
        duplicate: processed === false,
      })
    ),
    Effect.catch((error) => {
      const retryable =
        Predicate.isObject(error) && Predicate.isBoolean(error.retryable)
          ? error.retryable
          : true;
      const message =
        Predicate.isObject(error) && Predicate.isString(error.message)
          ? error.message
          : "Webhook request failed";
      return Effect.logError("Webhook request rejected", {
        provider,
        retryable,
        failure: message,
      }).pipe(
        Effect.as(
          HttpServerResponse.jsonUnsafe(
            { error: { code: "WebhookIngressError", message } },
            { status: retryable ? 503 : 400 }
          )
        )
      );
    }),
    Effect.catchCause((cause) =>
      Effect.logError("Webhook request defect", { provider, cause }).pipe(
        Effect.as(
          HttpServerResponse.jsonUnsafe(
            {
              error: {
                code: "WebhookIngressError",
                message: "Webhook request failed",
              },
            },
            { status: 503 }
          )
        )
      )
    )
  );

export const WebhookRoutes = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const signed = yield* SignedIngress;
    const ingress = yield* WebhookIngressService;
    const calendar = yield* CalendarWebhookConfig;
    const cancellations = yield* CancellationService;
    const entitlements = yield* EntitlementPolicy;
    yield* router.add(
      "GET",
      "/webhooks/meta",
      Effect.fn("WebhookRoutes.verifyMeta")(function* (request) {
        const url = new URL(request.url, "http://localhost");
        return yield* signed
          .verifyMetaChallenge({
            mode: url.searchParams.get("hub.mode"),
            token: url.searchParams.get("hub.verify_token"),
            challenge: url.searchParams.get("hub.challenge"),
          })
          .pipe(
            Effect.map((challenge) => HttpServerResponse.text(challenge)),
            Effect.catch(() =>
              Effect.succeed(
                HttpServerResponse.text("Forbidden", { status: 403 })
              )
            )
          );
      })
    );
    yield* router.add(
      "POST",
      "/webhooks/cal",
      Effect.fn("WebhookRoutes.receiveCalendar")(function* (request) {
        const rawBody = yield* request.text;
        const signature = header(request, "x-cal-signature-256") ?? "";
        const valid = yield* Effect.promise(() =>
          verifyCalendarWebhook(rawBody, signature, calendar.secret)
        );
        if (!valid) {
          return HttpServerResponse.jsonUnsafe(
            {
              error: {
                code: "InvalidSignature",
                message: "Invalid calendar signature",
              },
            },
            { status: 401 }
          );
        }
        const body = yield* Effect.try({
          try: () => JSON.parse(rawBody) as Record<string, unknown>,
          catch: () => new Error("Invalid calendar payload"),
        }).pipe(
          Effect.catch(() =>
            Effect.succeed(null as Record<string, unknown> | null)
          )
        );
        if (!(body && Predicate.isString(body.triggerEvent))) {
          return HttpServerResponse.jsonUnsafe(
            { accepted: false },
            { status: 400 }
          );
        }
        const supported = [
          "BOOKING_CREATED",
          "BOOKING_RESCHEDULED",
          "BOOKING_CANCELLED",
        ] as const;
        if (
          !supported.includes(body.triggerEvent as (typeof supported)[number])
        ) {
          return HttpServerResponse.jsonUnsafe({
            accepted: true,
            ignored: true,
          });
        }
        const payload = Predicate.isObject(body.payload) ? body.payload : {};
        if (payload.type !== calendar.eventSlug) {
          return HttpServerResponse.jsonUnsafe({
            accepted: true,
            ignored: true,
          });
        }
        const metadata = Predicate.isObject(payload.metadata)
          ? payload.metadata
          : {};
        const attendees = Array.isArray(payload.attendees)
          ? payload.attendees
          : [];
        const attendee = Predicate.isObject(attendees[0]) ? attendees[0] : {};
        const reference = metadata.cancellationReference;
        const bookingUid = payload.bookingUid ?? payload.uid;
        if (
          !(Predicate.isString(reference) && Predicate.isString(bookingUid))
        ) {
          return HttpServerResponse.jsonUnsafe(
            { accepted: false },
            { status: 400 }
          );
        }
        const matched = yield* cancellations.handleCalendar({
          event: body.triggerEvent as (typeof supported)[number],
          reference,
          bookingUid,
          bookingAt: Predicate.isString(payload.startTime)
            ? payload.startTime
            : undefined,
          attendeeEmail: Predicate.isString(attendee.email)
            ? attendee.email
            : undefined,
        });
        return HttpServerResponse.jsonUnsafe({ accepted: true, matched });
      })
    );
    yield* router.add(
      "POST",
      "/webhooks/meta",
      Effect.fn("WebhookRoutes.receiveMeta")(function* (request) {
        return yield* request.text.pipe(
          Effect.flatMap((rawBody) =>
            signed
              .verifyMeta({
                rawBody,
                signature: header(request, "x-hub-signature-256"),
              })
              .pipe(
                Effect.flatMap(() =>
                  ingress.processMeta(
                    header(request, "x-hub-signature-256") ?? "",
                    rawBody
                  )
                )
              )
          ),
          (effect) => responseFor("meta", effect)
        );
      })
    );
    yield* router.add(
      "POST",
      "/webhooks/clerk",
      Effect.fn("WebhookRoutes.receiveClerk")(function* (request) {
        return yield* request.text.pipe(
          Effect.flatMap((rawBody) => {
            const headers = standardHeaders(request, "svix");
            if (!headers) {
              return Effect.fail({
                retryable: false,
                message: "Missing Clerk signature headers",
              });
            }
            return signed
              .verifyClerk(rawBody, headers)
              .pipe(
                Effect.flatMap(() => ingress.processClerk(headers.id, rawBody))
              );
          }),
          (effect) => responseFor("clerk", effect)
        );
      })
    );
    yield* router.add(
      "POST",
      "/webhooks/dodo",
      Effect.fn("WebhookRoutes.receiveDodo")(function* (request) {
        if (yield* entitlements.isCommunity) {
          return HttpServerResponse.jsonUnsafe(
            {
              error: {
                code: "BillingDisabled",
                message: "Billing is disabled on this self-hosted instance",
              },
            },
            { status: 409 }
          );
        }
        return yield* request.text.pipe(
          Effect.flatMap((rawBody) => {
            const headers = standardHeaders(request, "webhook");
            if (!headers) {
              return Effect.fail({
                retryable: false,
                message: "Missing payment signature headers",
              });
            }
            return signed
              .verifyDodo(rawBody, headers)
              .pipe(
                Effect.flatMap(() => ingress.processDodo(headers.id, rawBody))
              );
          }),
          (effect) => responseFor("dodo", effect)
        );
      })
    );
  })
);
