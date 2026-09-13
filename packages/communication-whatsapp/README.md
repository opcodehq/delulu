# WhatsApp communication provider

Direct adapter for the official WhatsApp Business Cloud API. It uses native
`fetch`; the archived provider SDK is not required.

## Capabilities

- Webhook subscription challenge verification.
- Raw request body verification using `X-Hub-Signature-256` and the app secret.
- Schema-validated decoding of text, button, interactive, image, video, audio,
  voice-note, document, and sticker messages.
- Normalization into `@delulu/communication-providers` messages.
- Text replies with optional reply context.
- Media metadata lookup and streaming download from an explicit host allowlist.

## Usage

```ts
import { makeWhatsAppProvider } from "@delulu/communication-whatsapp";
import { Effect } from "effect";

const provider = makeWhatsAppProvider({
  accessToken,
  appSecret,
  verifyToken,
  graphApiVersion,
  phoneNumberId,
});

await Effect.runPromise(
  provider.verifySignature(rawBody, request.headers.get("x-hub-signature-256"))
);
const messages = await Effect.runPromise(provider.decodeWebhook(rawBody));
```

`graphApiVersion` is required instead of silently pinning a version inside the
package. The deployment owns upgrades and can canary them independently.

The webhook handler remains responsible for durable message deduplication before
agent submission. Outbound callers must not retry a failure whose
`deliveryState` is `unknown`. Media responses are returned as streams; the
caller must enforce its own byte limit while archiving to durable storage.
