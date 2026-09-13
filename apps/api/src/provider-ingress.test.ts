import { describe, expect, it, vi } from "vitest";
import { type Env, handleProviderIngress } from "./provider-ingress";

const env = {
  WHATSAPP_VERIFY_TOKEN: "verify-me",
} satisfies Env;

const request = (path: string, init?: RequestInit) =>
  handleProviderIngress(
    new Request(`https://api.example${path}`, init),
    env
  ).then((response) => {
    if (!response) {
      throw new Error("Expected an ingress response");
    }
    return response;
  });

describe("shared provider ingress", () => {
  it("verifies signed messages and stores only the allowlisted sender", async () => {
    const enqueue = vi.fn(async () => undefined);
    const enabled: Env = {
      ...env,
      WHATSAPP_INGRESS_ENABLED: "true",
      WHATSAPP_APP_SECRET: "secret",
      WHATSAPP_PHONE_NUMBER_ID: "phone",
      WHATSAPP_TEST_EMAIL: "tester@example.com",
      WHATSAPP_TEST_SENDER: "15550000001",
      WHATSAPP_CONVERSATIONS: {
        getByName: () => ({ enqueue, complete: async () => undefined }),
      },
    };
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "account",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15550000000",
                  phone_number_id: "phone",
                },
                messages: ["15550000001", "15550000002"].map((from, index) => ({
                  from,
                  id: `message-${index}`,
                  timestamp: "1788630000",
                  type: "text",
                  text: { body: "hello" },
                })),
              },
            },
          ],
        },
      ],
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = [
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const response = await handleProviderIngress(
      new Request("https://api.example/v1/providers/whatsapp/webhook", {
        method: "POST",
        body: raw,
        headers: { "x-hub-signature-256": `sha256=${signature}` },
      }),
      enabled
    );
    expect(response?.status).toBe(200);
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({
      id: "message-0",
      sender: "15550000001",
      text: "hello",
    });
    const rejected = await handleProviderIngress(
      new Request("https://api.example/v1/providers/whatsapp/webhook", {
        method: "POST",
        body: raw,
      }),
      enabled
    );
    expect(rejected?.status).toBe(403);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it("passes ordinary API routes to the application", async () => {
    expect(
      await handleProviderIngress(
        new Request("https://api.example/v1/workspaces"),
        env
      )
    ).toBeNull();
  });
  it("leaves the existing readiness contract to the application", async () => {
    expect(
      await handleProviderIngress(
        new Request("https://api.example/health"),
        env
      )
    ).toBeNull();
  });

  it("returns a liveness response without exposing configuration", async () => {
    const response = await request("/live");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "delulu-api",
      status: "ok",
    });
  });

  it("returns Meta's raw subscription challenge", async () => {
    const response = await request(
      "/v1/providers/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123456"
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("123456");
  });

  it("rejects an invalid verification token", async () => {
    const response = await request(
      "/v1/providers/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123456"
    );

    expect(response.status).toBe(403);
  });

  it("fails closed when the verification secret is missing", async () => {
    const response = await handleProviderIngress(
      new Request(
        "https://staging.example/v1/providers/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123456"
      ),
      {}
    );

    expect(response?.status).toBe(503);
  });

  it("does not acknowledge inbound messages before agent ingress is connected", async () => {
    const response = await request("/v1/providers/whatsapp/webhook", {
      method: "POST",
      body: "an intentionally unread body",
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
  });
});
