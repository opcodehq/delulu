import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CommunicationInboundMessage,
  CommunicationProviderError,
} from "./index";

describe("CommunicationInboundMessage", () => {
  it("decodes a provider-neutral inbound message", () => {
    const message = Schema.decodeUnknownSync(CommunicationInboundMessage)({
      provider: "whatsapp",
      connectionKey: "12345",
      conversationKey: "15551234567",
      messageKey: "wamid.message",
      occurredAt: "2026-08-13T12:00:00.000Z",
      sender: {
        id: "15551234567",
        address: "+15551234567",
        displayName: "Ada",
      },
      recipient: { id: "12345" },
      text: "hello",
      attachments: [],
    });

    expect(message.provider).toBe("whatsapp");
    expect(message.sender.displayName).toBe("Ada");
  });

  it("rejects a message with no usable content", () => {
    expect(() =>
      Schema.decodeUnknownSync(CommunicationInboundMessage)({
        provider: "whatsapp",
        connectionKey: "12345",
        conversationKey: "15551234567",
        messageKey: "wamid.message",
        occurredAt: "2026-08-13T12:00:00.000Z",
        sender: { id: "15551234567" },
        recipient: { id: "12345" },
        attachments: [],
      })
    ).toThrow();
  });
});

describe("CommunicationProviderError", () => {
  it("can be yielded as a typed failure", async () => {
    const error = new CommunicationProviderError({
      provider: "whatsapp",
      operation: "send",
      reason: "remote_error",
      message: "upstream refused the request",
      retryable: false,
      deliveryState: "not_sent",
    });
    const result = await Effect.runPromiseExit(Effect.fail(error));

    expect(result._tag).toBe("Failure");
  });
});
