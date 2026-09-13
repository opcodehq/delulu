import { expect, it, vi } from "vitest";
import type { Env } from "./env";
import { handleProviderIngress } from "./provider-ingress";

const body = JSON.stringify({
  update_id: 1,
  message: {
    text: "hello",
    from: { id: 123, is_bot: false },
    chat: { id: 123, type: "private" },
  },
});
const request = (secret = "secret", payload = body) =>
  new Request("https://example.com/v1/providers/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    body: payload,
  });
function environment() {
  const enqueue = vi.fn(async () => undefined);
  const reserve = vi.fn(async () => true);
  const getByName = vi.fn(() => ({ enqueue, complete: async () => undefined }));
  const env = {
    TELEGRAM_BOT_TOKEN: "42:token",
    TELEGRAM_WEBHOOK_SECRET: "secret",
    TELEGRAM_INGRESS_ENABLED: "true",
    TELEGRAM_ALLOWED_USER_ID: "123",
    TELEGRAM_CONVERSATIONS: { getByName },
    TELEGRAM_ADMISSION: { getByName: () => ({ reserve }) },
    AGENT_RUNTIME: {},
  } as unknown as Env;
  return { env, enqueue, reserve, getByName };
}
it("authenticates Telegram before reserving capacity or storing messages", async () => {
  const h = environment();
  expect((await handleProviderIngress(request("wrong"), h.env))?.status).toBe(
    403
  );
  expect(h.reserve).not.toHaveBeenCalled();
  expect((await handleProviderIngress(request(), h.env))?.status).toBe(200);
  expect(h.getByName).toHaveBeenCalledWith("telegram:42:123");
  expect(h.enqueue).toHaveBeenCalledWith({
    id: "1",
    sender: "123",
    text: "hello",
  });
});
it("ignores the retired lifetime cap and delegates atomic quotas to the conversation", async () => {
  const h = environment();
  h.reserve.mockResolvedValue(false);
  expect((await handleProviderIngress(request(), h.env))?.status).toBe(200);
  expect(h.reserve).not.toHaveBeenCalled();
  expect(h.enqueue).toHaveBeenCalled();
});

it.each([
  undefined,
  "",
  "999",
  "123,999",
])("ignores unapproved senders before admission with allowlist %s", async (allowed) => {
  const h = environment();
  Object.assign(h.env, { TELEGRAM_ALLOWED_USER_ID: allowed });
  expect((await handleProviderIngress(request(), h.env))?.status).toBe(200);
  expect(h.reserve).not.toHaveBeenCalled();
  expect(h.getByName).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
});
it("returns retryable failure when durable storage fails", async () => {
  const h = environment();
  h.enqueue.mockRejectedValue(new Error("storage unavailable"));
  expect((await handleProviderIngress(request(), h.env))?.status).toBe(503);
});
it("rejects oversized requests and malformed JSON before dispatch", async () => {
  const h = environment();
  expect(
    (await handleProviderIngress(request("secret", "a".repeat(256_001)), h.env))
      ?.status
  ).toBe(413);
  expect(
    (await handleProviderIngress(request("secret", "{"), h.env))?.status
  ).toBe(400);
  expect(h.enqueue).not.toHaveBeenCalled();
});
it("setup endpoint is unavailable without its separate admin credential", async () => {
  expect(
    (
      await handleProviderIngress(
        new Request("https://example.com/v1/providers/telegram/setup", {
          method: "POST",
        }),
        environment().env
      )
    )?.status
  ).toBe(403);
});
