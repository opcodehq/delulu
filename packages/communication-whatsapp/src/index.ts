import {
  type CommunicationAttachment,
  type CommunicationInboundMessage,
  type CommunicationOutboundText,
  type CommunicationProvider,
  CommunicationProviderError,
  type CommunicationSendResult,
} from "@delulu/communication-providers";
import { Effect, Schema } from "effect";

const PROVIDER = "whatsapp";
const DEFAULT_BASE_URL = "https://graph.facebook.com";
const DEFAULT_TIMEOUT_MS = 20_000;
const SIGNATURE_PREFIX = "sha256=";
const HEX_PATTERN = /^[0-9a-f]+$/i;
const GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;

export interface WhatsAppProviderConfig {
  readonly accessToken: string;
  readonly appSecret: string;
  readonly verifyToken: string;
  readonly graphApiVersion: string;
  readonly phoneNumberId: string;
  readonly timeoutMs?: number;
  readonly allowedMediaHosts?: readonly string[];
}

export interface WhatsAppProviderOptions {
  readonly fetch?: typeof globalThis.fetch;
}

export interface WhatsAppMediaMetadata {
  readonly id: string;
  readonly url: string;
  readonly mimeType: string;
  readonly sha256: string;
  readonly fileSize: number;
}

export interface WhatsAppProvider extends CommunicationProvider {
  readonly getMedia: (
    mediaId: string
  ) => Effect.Effect<WhatsAppMediaMetadata, CommunicationProviderError>;
  readonly downloadMedia: (
    media: WhatsAppMediaMetadata
  ) => Effect.Effect<Response, CommunicationProviderError>;
}

const WhatsAppContact = Schema.Struct({
  profile: Schema.optional(
    Schema.Struct({ name: Schema.optional(Schema.String) })
  ),
  wa_id: Schema.String,
});

const MediaObject = Schema.Struct({
  id: Schema.String,
  mime_type: Schema.optional(Schema.String),
  sha256: Schema.optional(Schema.String),
  caption: Schema.optional(Schema.String),
  filename: Schema.optional(Schema.String),
});

const WhatsAppMessage = Schema.Struct({
  from: Schema.String,
  id: Schema.String,
  timestamp: Schema.NumberFromString.check(
    Schema.isBetween({ minimum: 0, maximum: 8_640_000_000_000 })
  ),
  type: Schema.String,
  context: Schema.optional(
    Schema.Struct({ id: Schema.optional(Schema.String) })
  ),
  text: Schema.optional(Schema.Struct({ body: Schema.String })),
  audio: Schema.optional(
    Schema.Struct({
      ...MediaObject.fields,
      voice: Schema.optional(Schema.Boolean),
    })
  ),
  document: Schema.optional(MediaObject),
  image: Schema.optional(MediaObject),
  sticker: Schema.optional(MediaObject),
  video: Schema.optional(MediaObject),
  button: Schema.optional(
    Schema.Struct({
      text: Schema.optional(Schema.String),
      payload: Schema.optional(Schema.String),
    })
  ),
  interactive: Schema.optional(
    Schema.Struct({
      type: Schema.optional(Schema.String),
      button_reply: Schema.optional(
        Schema.Struct({ id: Schema.String, title: Schema.String })
      ),
      list_reply: Schema.optional(
        Schema.Struct({ id: Schema.String, title: Schema.String })
      ),
    })
  ),
});

const WhatsAppWebhookPayload = Schema.Struct({
  object: Schema.Literal("whatsapp_business_account"),
  entry: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      changes: Schema.Array(
        Schema.Struct({
          field: Schema.String,
          value: Schema.Struct({
            messaging_product: Schema.Literal("whatsapp"),
            metadata: Schema.Struct({
              display_phone_number: Schema.String,
              phone_number_id: Schema.String,
            }),
            contacts: Schema.optional(Schema.Array(WhatsAppContact)),
            messages: Schema.optional(Schema.Array(WhatsAppMessage)),
          }),
        })
      ),
    })
  ),
});

const SendResponse = Schema.Struct({
  messages: Schema.Array(Schema.Struct({ id: Schema.String })),
});

const MediaMetadataResponse = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  mime_type: Schema.String,
  sha256: Schema.String,
  file_size: Schema.Number,
});

const providerError = (
  operation: CommunicationProviderError["operation"],
  reason: CommunicationProviderError["reason"],
  message: string,
  input?: {
    readonly retryable?: boolean;
    readonly deliveryState?: CommunicationProviderError["deliveryState"];
    readonly status?: number;
  }
) =>
  new CommunicationProviderError({
    provider: PROVIDER,
    operation,
    reason,
    message,
    retryable: input?.retryable ?? false,
    deliveryState: input?.deliveryState ?? "not_applicable",
    ...(input?.status === undefined ? {} : { status: input.status }),
  });

export interface WhatsAppChallengeInput {
  readonly mode: string | null;
  readonly token: string | null;
  readonly challenge: string | null;
}

/** Verify Meta's one-time webhook subscription challenge without API credentials. */
export const verifyWhatsAppChallenge = Effect.fn(
  "WhatsAppProvider.verifyChallenge"
)(function* (verifyToken: string, input: WhatsAppChallengeInput) {
  if (
    verifyToken.length > 0 &&
    input.mode === "subscribe" &&
    input.token === verifyToken &&
    input.challenge !== null
  ) {
    return input.challenge;
  }
  return yield* providerError(
    "verify_challenge",
    "invalid_challenge",
    "WhatsApp webhook verification failed"
  );
});

const decodeHex = (value: string): Uint8Array | null => {
  if (
    !(value.length > 0 && value.length % 2 === 0 && HEX_PATTERN.test(value))
  ) {
    return null;
  }
  return Uint8Array.from({ length: value.length / 2 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  );
};

const attachmentFrom = (
  kind: CommunicationAttachment["kind"],
  value: (typeof MediaObject.Type & { readonly voice?: boolean }) | undefined
): CommunicationAttachment | undefined => {
  if (!value) {
    return undefined;
  }
  return {
    providerMediaId: value.id,
    kind,
    ...(value.mime_type ? { mimeType: value.mime_type } : {}),
    ...(value.filename ? { filename: value.filename } : {}),
    ...(value.caption !== undefined ? { caption: value.caption } : {}),
    ...(value.sha256 ? { sha256: value.sha256 } : {}),
    ...(kind === "audio" && value.voice !== undefined
      ? { isVoiceNote: value.voice }
      : {}),
  };
};

const messageText = (message: typeof WhatsAppMessage.Type) =>
  message.text?.body ??
  message.button?.text ??
  message.interactive?.button_reply?.title ??
  message.interactive?.list_reply?.title;

const normalizeMessage = (
  message: typeof WhatsAppMessage.Type,
  value: (typeof WhatsAppWebhookPayload.Type)["entry"][number]["changes"][number]["value"]
): CommunicationInboundMessage | undefined => {
  const contact = value.contacts?.find(
    (candidate) => candidate.wa_id === message.from
  );
  const attachments = [
    attachmentFrom("audio", message.audio),
    attachmentFrom("document", message.document),
    attachmentFrom("image", message.image),
    attachmentFrom("sticker", message.sticker),
    attachmentFrom("video", message.video),
  ].filter((item): item is CommunicationAttachment => item !== undefined);
  const text = messageText(message);
  if (!(text?.trim() || attachments.length > 0)) {
    return undefined;
  }
  return {
    provider: PROVIDER,
    connectionKey: value.metadata.phone_number_id,
    conversationKey: message.from,
    messageKey: message.id,
    occurredAt: new Date(message.timestamp * 1000).toISOString(),
    sender: {
      id: message.from,
      address: `+${message.from}`,
      ...(contact?.profile?.name ? { displayName: contact.profile.name } : {}),
    },
    recipient: {
      id: value.metadata.phone_number_id,
      address: value.metadata.display_phone_number,
    },
    ...(text !== undefined ? { text } : {}),
    attachments,
    ...(message.context?.id ? { replyToMessageKey: message.context.id } : {}),
  };
};

export const verifyWhatsAppSignature = Effect.fn(
  "WhatsAppProvider.verifySignature"
)((appSecret: string, rawBody: string, signatureHeader: string | null) =>
  Effect.gen(function* () {
    if (
      !(appSecret.length > 0 && signatureHeader?.startsWith(SIGNATURE_PREFIX))
    ) {
      return yield* providerError(
        "verify_signature",
        "invalid_signature",
        "WhatsApp webhook signature is missing"
      );
    }
    const signature = decodeHex(signatureHeader.slice(SIGNATURE_PREFIX.length));
    if (signature === null) {
      return yield* providerError(
        "verify_signature",
        "invalid_signature",
        "WhatsApp webhook signature is malformed"
      );
    }
    const key = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(appSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        ),
      catch: () =>
        providerError(
          "verify_signature",
          "invalid_signature",
          "WhatsApp webhook signature could not be verified"
        ),
    });
    const valid = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.verify(
          "HMAC",
          key,
          signature,
          new TextEncoder().encode(rawBody)
        ),
      catch: () =>
        providerError(
          "verify_signature",
          "invalid_signature",
          "WhatsApp webhook signature could not be verified"
        ),
    });
    if (!valid) {
      return yield* providerError(
        "verify_signature",
        "invalid_signature",
        "WhatsApp webhook signature is invalid"
      );
    }
  })
);

export const decodeWhatsAppWebhook = Effect.fn(
  "WhatsAppProvider.decodeWebhook"
)((phoneNumberId: string, rawBody: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(WhatsAppWebhookPayload))(
    rawBody
  ).pipe(
    Effect.mapError(() =>
      providerError(
        "decode_webhook",
        "invalid_payload",
        "WhatsApp webhook payload is invalid"
      )
    ),
    Effect.flatMap((payload) => {
      const changes = payload.entry.flatMap((entry) => entry.changes);
      if (
        !phoneNumberId ||
        changes.some(
          (change) =>
            change.field === "messages" &&
            change.value.metadata.phone_number_id !== phoneNumberId
        )
      ) {
        return Effect.fail(
          providerError(
            "decode_webhook",
            "invalid_payload",
            "WhatsApp webhook phone number does not match this provider"
          )
        );
      }
      return Effect.succeed(
        changes.flatMap((change) => {
          if (change.field !== "messages") {
            return [];
          }
          return (change.value.messages ?? [])
            .map((message) => normalizeMessage(message, change.value))
            .filter(
              (message): message is CommunicationInboundMessage =>
                message !== undefined
            );
        })
      );
    })
  )
);

const bodyMessage = (body: unknown): string => {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return "WhatsApp Cloud API request failed";
};

export const makeWhatsAppProvider = (
  config: WhatsAppProviderConfig,
  options: WhatsAppProviderOptions = {}
): WhatsAppProvider => {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedMediaHosts = new Set(
    config.allowedMediaHosts ?? ["graph.facebook.com", "lookaside.fbsbx.com"]
  );

  const configurationValid = Boolean(
    config.accessToken &&
      config.appSecret &&
      config.verifyToken &&
      config.phoneNumberId &&
      GRAPH_VERSION_PATTERN.test(config.graphApiVersion)
  );

  const requireConfiguration = <A, E>(
    operation: CommunicationProviderError["operation"],
    effect: Effect.Effect<A, E>
  ) =>
    configurationValid
      ? effect
      : Effect.fail(
          providerError(
            operation,
            "invalid_configuration",
            "WhatsApp provider configuration is incomplete or invalid"
          )
        );

  const request = Effect.fn("WhatsAppProvider.request")(function* (input: {
    readonly operation: "send" | "get_media" | "download_media";
    readonly url: string;
    readonly init?: RequestInit;
  }) {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetcher(input.url, {
          ...input.init,
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            ...input.init?.headers,
          },
          signal: AbortSignal.timeout(timeoutMs),
        }),
      catch: () =>
        providerError(
          input.operation,
          "network_error",
          "WhatsApp Cloud API request did not complete",
          {
            retryable: input.operation !== "send",
            deliveryState:
              input.operation === "send" ? "unknown" : "not_applicable",
          }
        ),
    });
    if (!response.ok) {
      const body = yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.succeed(undefined)));
      const ambiguousSend =
        input.operation === "send" && response.status >= 500;
      return yield* providerError(
        input.operation,
        "remote_error",
        bodyMessage(body),
        {
          status: response.status,
          retryable:
            response.status === 429 ||
            (input.operation !== "send" && response.status >= 500),
          deliveryState:
            input.operation === "send"
              ? ambiguousSend
                ? "unknown"
                : "not_sent"
              : "not_applicable",
        }
      );
    }
    return response;
  });

  const verifyChallenge = Effect.fn("WhatsAppProvider.verifyChallenge")(
    (input: WhatsAppChallengeInput) =>
      verifyWhatsAppChallenge(config.verifyToken, input)
  );

  const verifySignature = Effect.fn("WhatsAppProvider.verifySignature")(
    (rawBody: string, signatureHeader: string | null) =>
      requireConfiguration(
        "verify_signature",
        verifyWhatsAppSignature(config.appSecret, rawBody, signatureHeader)
      )
  );

  const decodeWebhook = Effect.fn("WhatsAppProvider.decodeWebhook")(
    (rawBody: string) =>
      requireConfiguration(
        "decode_webhook",
        decodeWhatsAppWebhook(config.phoneNumberId, rawBody)
      )
  );

  const sendText = Effect.fn("WhatsAppProvider.sendText")(
    (input: CommunicationOutboundText) =>
      requireConfiguration(
        "send",
        Effect.gen(function* () {
          const response = yield* request({
            operation: "send",
            url: `${DEFAULT_BASE_URL}/${config.graphApiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`,
            init: {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: input.recipient,
                type: "text",
                text: { body: input.text, preview_url: false },
                ...(input.replyToMessageKey
                  ? { context: { message_id: input.replyToMessageKey } }
                  : {}),
              }),
            },
          });
          const body = yield* Effect.tryPromise({
            try: () => response.json() as Promise<unknown>,
            catch: () =>
              providerError(
                "send",
                "response_error",
                "WhatsApp send response was not valid JSON",
                { deliveryState: "unknown" }
              ),
          });
          const decoded = yield* Schema.decodeUnknownEffect(SendResponse)(
            body
          ).pipe(
            Effect.mapError(() =>
              providerError(
                "send",
                "response_error",
                "WhatsApp send response was invalid",
                { deliveryState: "unknown" }
              )
            )
          );
          const message = decoded.messages[0];
          if (!message) {
            return yield* providerError(
              "send",
              "response_error",
              "WhatsApp send response did not contain a message ID",
              { deliveryState: "unknown" }
            );
          }
          return { messageKey: message.id } satisfies CommunicationSendResult;
        })
      )
  );

  const getMedia = Effect.fn("WhatsAppProvider.getMedia")((mediaId: string) =>
    requireConfiguration(
      "get_media",
      Effect.gen(function* () {
        const response = yield* request({
          operation: "get_media",
          url: `${DEFAULT_BASE_URL}/${config.graphApiVersion}/${encodeURIComponent(mediaId)}`,
        });
        const body = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: () =>
            providerError(
              "get_media",
              "response_error",
              "WhatsApp media response was not valid JSON",
              { retryable: true }
            ),
        });
        const decoded = yield* Schema.decodeUnknownEffect(
          MediaMetadataResponse
        )(body).pipe(
          Effect.mapError(() =>
            providerError(
              "get_media",
              "response_error",
              "WhatsApp media response was invalid",
              { retryable: true }
            )
          )
        );
        return {
          id: decoded.id,
          url: decoded.url,
          mimeType: decoded.mime_type,
          sha256: decoded.sha256,
          fileSize: decoded.file_size,
        } satisfies WhatsAppMediaMetadata;
      })
    )
  );

  const downloadMedia = Effect.fn("WhatsAppProvider.downloadMedia")(
    (media: WhatsAppMediaMetadata) =>
      requireConfiguration(
        "download_media",
        Effect.gen(function* () {
          const url = yield* Effect.try({
            try: () => new URL(media.url),
            catch: () =>
              providerError(
                "download_media",
                "response_error",
                "WhatsApp media URL is invalid"
              ),
          });
          if (
            url.protocol !== "https:" ||
            (url.port !== "" && url.port !== "443") ||
            !allowedMediaHosts.has(url.hostname)
          ) {
            return yield* providerError(
              "download_media",
              "response_error",
              "WhatsApp media URL host is not trusted"
            );
          }
          return yield* request({
            operation: "download_media",
            url: url.toString(),
            init: { redirect: "error" },
          });
        })
      )
  );

  return {
    id: PROVIDER,
    verifyChallenge,
    verifySignature,
    decodeWebhook,
    sendText,
    getMedia,
    downloadMedia,
  };
};
