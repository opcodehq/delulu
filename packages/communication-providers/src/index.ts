import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
);

export const CommunicationAddress = Schema.Struct({
  id: NonEmptyString,
  address: Schema.optional(NonEmptyString),
  displayName: Schema.optional(NonEmptyString),
});
export type CommunicationAddress = typeof CommunicationAddress.Type;

export const CommunicationAttachment = Schema.Struct({
  providerMediaId: NonEmptyString,
  kind: Schema.Literals([
    "audio",
    "document",
    "image",
    "sticker",
    "video",
    "other",
  ]),
  mimeType: Schema.optional(NonEmptyString),
  filename: Schema.optional(NonEmptyString),
  caption: Schema.optional(Schema.String),
  sha256: Schema.optional(NonEmptyString),
  isVoiceNote: Schema.optional(Schema.Boolean),
});
export type CommunicationAttachment = typeof CommunicationAttachment.Type;

export const CommunicationInboundMessage = Schema.Struct({
  provider: NonEmptyString,
  connectionKey: NonEmptyString,
  conversationKey: NonEmptyString,
  messageKey: NonEmptyString,
  occurredAt: IsoDateTime,
  sender: CommunicationAddress,
  recipient: CommunicationAddress,
  text: Schema.optional(Schema.String),
  attachments: Schema.Array(CommunicationAttachment),
  replyToMessageKey: Schema.optional(NonEmptyString),
}).check(
  Schema.makeFilter((message) => {
    if (!(message.text?.trim() || message.attachments.length > 0)) {
      return {
        path: [],
        issue: "An inbound message requires text or at least one attachment",
      };
    }
  })
);
export type CommunicationInboundMessage =
  typeof CommunicationInboundMessage.Type;

export const CommunicationOutboundText = Schema.Struct({
  recipient: NonEmptyString,
  text: NonEmptyString,
  replyToMessageKey: Schema.optional(NonEmptyString),
});
export type CommunicationOutboundText = typeof CommunicationOutboundText.Type;

export const CommunicationSendResult = Schema.Struct({
  messageKey: NonEmptyString,
});
export type CommunicationSendResult = typeof CommunicationSendResult.Type;

export class CommunicationProviderError extends Schema.TaggedErrorClass<CommunicationProviderError>()(
  "CommunicationProviderError",
  {
    provider: NonEmptyString,
    operation: Schema.Literals([
      "verify_challenge",
      "verify_signature",
      "decode_webhook",
      "send",
      "get_media",
      "download_media",
    ]),
    reason: Schema.Literals([
      "invalid_configuration",
      "invalid_challenge",
      "invalid_signature",
      "invalid_payload",
      "network_error",
      "remote_error",
      "response_error",
    ]),
    message: NonEmptyString,
    retryable: Schema.Boolean,
    deliveryState: Schema.Literals(["not_applicable", "not_sent", "unknown"]),
    status: Schema.optional(Schema.Number),
  }
) {}

export interface CommunicationProvider {
  readonly id: string;
  readonly verifyChallenge: (input: {
    readonly mode: string | null;
    readonly token: string | null;
    readonly challenge: string | null;
  }) => import("effect").Effect.Effect<string, CommunicationProviderError>;
  readonly verifySignature: (
    rawBody: string,
    signature: string | null
  ) => import("effect").Effect.Effect<void, CommunicationProviderError>;
  readonly decodeWebhook: (
    rawBody: string
  ) => import("effect").Effect.Effect<
    readonly CommunicationInboundMessage[],
    CommunicationProviderError
  >;
  readonly sendText: (
    input: CommunicationOutboundText
  ) => import("effect").Effect.Effect<
    CommunicationSendResult,
    CommunicationProviderError
  >;
}
