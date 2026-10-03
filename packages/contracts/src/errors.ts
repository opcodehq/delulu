import { Schema, SchemaTransformation } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

/**
 * The single API error envelope (#148): every error encodes on the wire as
 * `{ error: { code, message, details } }` where `code` is the error's `_tag`.
 *
 * Each error is a `Schema.TaggedErrorClass` (so handlers/services keep tag-based
 * `Effect.fail`/`catch` ergonomics), paired with a derived *wire* schema whose
 * encoded side is the envelope. Endpoints use the wire schema; handlers fail
 * with the class instance.
 */

const detailsField = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields);

/**
 * Derive the envelope wire schema for a flat tagged error class. `pick` selects
 * the detail fields to nest under `error.details`; the remaining top-level
 * fields (`message`) stay on the error.
 */
const envelope = <
  Self extends { readonly _tag: string; readonly message: string },
  DetailFields extends Schema.Struct.Fields,
>(
  errorClass: Schema.Codec<
    Self,
    { readonly _tag: string } & Record<string, unknown>
  >,
  tag: string,
  status: number,
  detailFields: DetailFields
) => {
  const detailKeys = Object.keys(detailFields);
  const Details = detailsField(detailFields);
  const Envelope = Schema.Struct({
    error: Schema.Struct({
      code: Schema.Literal(tag),
      message: Schema.String,
      details: Details,
    }),
  });
  return Envelope.pipe(
    Schema.decodeTo(
      errorClass as Schema.Codec<Self, Record<string, unknown>>,
      SchemaTransformation.transform({
        decode: (input: typeof Envelope.Type) => {
          const flat: Record<string, unknown> = {
            _tag: tag,
            message: input.error.message,
          };
          const details = input.error.details as Record<string, unknown>;
          for (const key of detailKeys) {
            flat[key] = details[key];
          }
          return flat;
        },
        encode: (flat: Record<string, unknown>) => {
          const details: Record<string, unknown> = {};
          for (const key of detailKeys) {
            details[key] = flat[key];
          }
          return {
            error: {
              code: tag,
              message: flat.message as string,
              details,
            },
          } as typeof Envelope.Type;
        },
      })
    ),
    HttpApiSchema.status(status)
  );
};

// --- 401 ---------------------------------------------------------------------
export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String }
) {}
export const UnauthorizedErrorResponse = envelope(
  UnauthorizedError,
  "UnauthorizedError",
  401,
  {}
);

// --- 403 ---------------------------------------------------------------------
export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String }
) {}
export const ForbiddenErrorResponse = envelope(
  ForbiddenError,
  "ForbiddenError",
  403,
  {}
);

// --- 404 ---------------------------------------------------------------------
export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String, resource: Schema.String }
) {}
export const NotFoundErrorResponse = envelope(
  NotFoundError,
  "NotFoundError",
  404,
  { resource: Schema.String }
);

// --- 410 ---------------------------------------------------------------------
/** A share link that existed but has passed its expiry; it can be renewed. */
export class ShareLinkExpiredError extends Schema.TaggedErrorClass<ShareLinkExpiredError>()(
  "ShareLinkExpiredError",
  { message: Schema.String }
) {}
export const ShareLinkExpiredErrorResponse = envelope(
  ShareLinkExpiredError,
  "ShareLinkExpiredError",
  410,
  {}
);

// --- 409 ---------------------------------------------------------------------
export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  "ConflictError",
  { message: Schema.String, resource: Schema.String }
) {}
export const ConflictErrorResponse = envelope(
  ConflictError,
  "ConflictError",
  409,
  { resource: Schema.String }
);

/** Returned when a deployment intentionally has no payment subsystem. */
export class BillingDisabled extends Schema.TaggedErrorClass<BillingDisabled>()(
  "BillingDisabled",
  { message: Schema.String }
) {}
export const BillingDisabledResponse = envelope(
  BillingDisabled,
  "BillingDisabled",
  409,
  {}
);

// --- 422 ---------------------------------------------------------------------
export const ValidationIssue = Schema.Struct({
  path: Schema.String,
  message: Schema.String,
});
export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(ValidationIssue),
  }
) {}
export const ValidationErrorResponse = envelope(
  ValidationError,
  "ValidationError",
  422,
  { issues: Schema.Array(ValidationIssue) }
);

// --- 402 ---------------------------------------------------------------------
export class QuotaExceededError extends Schema.TaggedErrorClass<QuotaExceededError>()(
  "QuotaExceededError",
  {
    message: Schema.String,
    resource: Schema.String,
    limit: Schema.Number,
    current: Schema.Number,
    upgradeUrl: Schema.String,
  }
) {}
export const QuotaExceededErrorResponse = envelope(
  QuotaExceededError,
  "QuotaExceededError",
  402,
  {
    resource: Schema.String,
    limit: Schema.Number,
    current: Schema.Number,
    upgradeUrl: Schema.String,
  }
);

// --- 429 ---------------------------------------------------------------------
export class RateLimitedError extends Schema.TaggedErrorClass<RateLimitedError>()(
  "RateLimitedError",
  { message: Schema.String, retryAfter: Schema.Number }
) {}
export const RateLimitedErrorResponse = envelope(
  RateLimitedError,
  "RateLimitedError",
  429,
  { retryAfter: Schema.Number }
);

// --- 503 ---------------------------------------------------------------------
export class ProviderUnavailableError extends Schema.TaggedErrorClass<ProviderUnavailableError>()(
  "ProviderUnavailableError",
  {
    message: Schema.String,
    provider: Schema.String,
    retryable: Schema.Boolean,
  }
) {}
export const ProviderUnavailableErrorResponse = envelope(
  ProviderUnavailableError,
  "ProviderUnavailableError",
  503,
  { provider: Schema.String, retryable: Schema.Boolean }
);
