import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeWhatsAppProvider, verifyWhatsAppChallenge } from "./index";

const config = {
  accessToken: "test-token",
  appSecret: "test-secret",
  verifyToken: "verify-me",
  graphApiVersion: "v23.0",
  phoneNumberId: "10987654321",
};

const webhookPayload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "business-account",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550001111",
              phone_number_id: "10987654321",
            },
            contacts: [
              { profile: { name: "Ada Lovelace" }, wa_id: "15551234567" },
            ],
            messages: [
              {
                from: "15551234567",
                id: "wamid.text",
                timestamp: "1786622400",
                type: "text",
                text: { body: "Draft a launch post" },
              },
              {
                from: "15551234567",
                id: "wamid.audio",
                timestamp: "1786622401",
                type: "audio",
                audio: { id: "media-1", mime_type: "audio/ogg", voice: true },
              },
            ],
          },
        },
      ],
    },
  ],
});

const sign = async (body: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  );
  return `sha256=${[...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};

describe("WhatsApp webhook handling", () => {
  it("verifies a subscription challenge before the account is fully configured", async () => {
    await expect(
      Effect.runPromise(
        verifyWhatsAppChallenge("verify-me", {
          mode: "subscribe",
          token: "verify-me",
          challenge: "challenge-value",
        })
      )
    ).resolves.toBe("challenge-value");
  });

  it("rejects a standalone challenge with the wrong token", async () => {
    await expect(
      Effect.runPromise(
        verifyWhatsAppChallenge("verify-me", {
          mode: "subscribe",
          token: "wrong-token",
          challenge: "challenge-value",
        })
      )
    ).rejects.toMatchObject({
      operation: "verify_challenge",
      reason: "invalid_challenge",
    });
  });

  it("verifies the subscription challenge", async () => {
    const provider = makeWhatsAppProvider(config);
    await expect(
      Effect.runPromise(
        provider.verifyChallenge({
          mode: "subscribe",
          token: "verify-me",
          challenge: "challenge-value",
        })
      )
    ).resolves.toBe("challenge-value");
  });

  it("verifies the raw body signature and rejects tampering", async () => {
    const provider = makeWhatsAppProvider(config);
    const signature = await sign(webhookPayload);

    await expect(
      Effect.runPromise(provider.verifySignature(webhookPayload, signature))
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        provider.verifySignature(`${webhookPayload} `, signature)
      )
    ).rejects.toMatchObject({ reason: "invalid_signature" });
  });

  it("normalizes text and voice messages", async () => {
    const provider = makeWhatsAppProvider(config);
    const messages = await Effect.runPromise(
      provider.decodeWebhook(webhookPayload)
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      provider: "whatsapp",
      connectionKey: "10987654321",
      conversationKey: "15551234567",
      messageKey: "wamid.text",
      text: "Draft a launch post",
      sender: { id: "15551234567", displayName: "Ada Lovelace" },
    });
    expect(messages[1]?.attachments[0]).toMatchObject({
      providerMediaId: "media-1",
      kind: "audio",
      mimeType: "audio/ogg",
      isVoiceNote: true,
    });
  });

  it("rejects messages addressed to a different configured phone number", async () => {
    const provider = makeWhatsAppProvider(config);
    const payload = webhookPayload.replaceAll("10987654321", "another-number");

    await expect(
      Effect.runPromise(provider.decodeWebhook(payload))
    ).rejects.toMatchObject({
      operation: "decode_webhook",
      reason: "invalid_payload",
    });
  });

  it("rejects an out-of-range message timestamp through the typed channel", async () => {
    const provider = makeWhatsAppProvider(config);
    const payload = webhookPayload.replace("1786622400", "999999999999999999");

    await expect(
      Effect.runPromise(provider.decodeWebhook(payload))
    ).rejects.toMatchObject({
      operation: "decode_webhook",
      reason: "invalid_payload",
    });
  });

  it("rejects a payload with the wrong messaging product", async () => {
    const provider = makeWhatsAppProvider(config);
    const payload = webhookPayload.replace('"whatsapp"', '"other"');

    await expect(
      Effect.runPromise(provider.decodeWebhook(payload))
    ).rejects.toMatchObject({
      operation: "decode_webhook",
      reason: "invalid_payload",
    });
  });
});

describe("WhatsApp outbound API", () => {
  it("sends a text reply through the configured phone number", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: "15551234567", wa_id: "15551234567" }],
          messages: [{ id: "wamid.outbound" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = makeWhatsAppProvider(config, { fetch });
    const result = await Effect.runPromise(
      provider.sendText({
        recipient: "15551234567",
        text: "Here is your draft",
        replyToMessageKey: "wamid.text",
      })
    );

    expect(result).toEqual({ messageKey: "wamid.outbound" });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v23.0/10987654321/messages");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "text",
      context: { message_id: "wamid.text" },
      text: { body: "Here is your draft", preview_url: false },
    });
  });

  it("marks an HTTP refusal as definitely not sent", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Outside messaging window" } }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
      );
    const provider = makeWhatsAppProvider(config, { fetch });

    await expect(
      Effect.runPromise(
        provider.sendText({ recipient: "15551234567", text: "hello" })
      )
    ).rejects.toMatchObject({
      operation: "send",
      reason: "remote_error",
      retryable: false,
      deliveryState: "not_sent",
    });
  });

  it("marks a transport timeout as an ambiguous send", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const provider = makeWhatsAppProvider(config, { fetch });

    await expect(
      Effect.runPromise(
        provider.sendText({ recipient: "15551234567", text: "hello" })
      )
    ).rejects.toMatchObject({
      operation: "send",
      reason: "network_error",
      retryable: false,
      deliveryState: "unknown",
    });
  });

  it("reports invalid configuration using the attempted operation", async () => {
    const provider = makeWhatsAppProvider({
      ...config,
      graphApiVersion: "latest",
    });

    await expect(
      Effect.runPromise(
        provider.sendText({ recipient: "15551234567", text: "hello" })
      )
    ).rejects.toMatchObject({
      operation: "send",
      reason: "invalid_configuration",
      deliveryState: "not_applicable",
    });
  });

  it("treats a server response as an ambiguous send", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unavailable" } }), {
        status: 503,
      })
    );
    const provider = makeWhatsAppProvider(config, { fetch });

    await expect(
      Effect.runPromise(
        provider.sendText({ recipient: "15551234567", text: "hello" })
      )
    ).rejects.toMatchObject({
      status: 503,
      retryable: false,
      deliveryState: "unknown",
    });
  });
});

describe("WhatsApp media API", () => {
  it("retrieves metadata and streams media from an approved host", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "media-1",
            url: "https://lookaside.fbsbx.com/whatsapp/media-1",
            mime_type: "audio/ogg",
            sha256: "digest",
            file_size: 42,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/ogg" },
        })
      );
    const provider = makeWhatsAppProvider(config, { fetch });

    const metadata = await Effect.runPromise(provider.getMedia("media-1"));
    const response = await Effect.runPromise(provider.downloadMedia(metadata));

    expect(metadata).toMatchObject({
      id: "media-1",
      mimeType: "audio/ogg",
      fileSize: 42,
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: "Bearer test-token",
    });
  });

  it("never forwards the access token to an untrusted media host", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = makeWhatsAppProvider(config, { fetch });

    await expect(
      Effect.runPromise(
        provider.downloadMedia({
          id: "media-1",
          url: "https://example.invalid/steal-token",
          mimeType: "audio/ogg",
          sha256: "digest",
          fileSize: 42,
        })
      )
    ).rejects.toMatchObject({
      operation: "download_media",
      reason: "response_error",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an approved media hostname on a nonstandard port", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = makeWhatsAppProvider(config, { fetch });

    await expect(
      Effect.runPromise(
        provider.downloadMedia({
          id: "media-1",
          url: "https://lookaside.fbsbx.com:8443/whatsapp/media-1",
          mimeType: "audio/ogg",
          sha256: "digest",
          fileSize: 42,
        })
      )
    ).rejects.toMatchObject({ reason: "response_error" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
