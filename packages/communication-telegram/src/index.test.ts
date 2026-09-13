import { afterEach, expect, it, vi } from "vitest";
import { decodeTelegramMessage, secretMatches, telegramCall } from "./index";

const update = {
  update_id: 1,
  message: {
    text: "hello",
    chat: { id: 123, type: "private" },
    from: { id: 123, is_bot: false },
  },
};
afterEach(() => vi.unstubAllGlobals());
it("accepts private text messages and rejects group or mismatched identities", () => {
  expect(decodeTelegramMessage(update)).toEqual({
    id: "1",
    sender: "123",
    text: "hello",
  });
  expect(
    decodeTelegramMessage({
      ...update,
      message: { ...update.message, chat: { id: -1, type: "group" } },
    })
  ).toBeNull();
  expect(
    decodeTelegramMessage({
      ...update,
      message: { ...update.message, from: { id: 456, is_bot: false } },
    })
  ).toBeNull();
  expect(
    decodeTelegramMessage({ update_id: 2, edited_message: update.message })
  ).toBeNull();
});
it("fails closed for missing and incorrect webhook secrets", async () => {
  expect(await secretMatches("right", "right")).toBe(true);
  expect(await secretMatches("wrong", "right")).toBe(false);
  expect(await secretMatches(null, "right")).toBe(false);
  expect(await secretMatches("right", undefined)).toBe(false);
});
it("never leaks credentials through network errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValue(
        new Error("https://api.telegram.org/bot123:secret/sendMessage")
      )
  );
  expect(await telegramCall("123:secret", "sendMessage")).toEqual({
    ok: false,
    status: 0,
  });
});
it("recognizes Telegram errors even with HTTP success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ok: false, error_code: 429 }))
  );
  expect(await telegramCall("123:secret", "sendMessage")).toEqual({
    ok: false,
    status: 429,
  });
});
