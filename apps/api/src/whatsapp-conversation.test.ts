import { afterEach, expect, it, vi } from "vitest";
import type { Env } from "./env";

vi.mock("cloudflare:workers", () => {
  class Worker {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  }
  return { DurableObject: Worker, WorkerEntrypoint: Worker };
});

import {
  TelegramAdmission,
  TelegramConversation,
} from "./telegram-conversation";
import { WhatsAppConversation } from "./whatsapp-conversation";

class Storage {
  values = new Map<string, unknown>();
  alarm?: number;
  private queue = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
  async list<T>({ prefix }: { prefix: string }): Promise<Map<string, T>> {
    return new Map(
      [...this.values].filter(([key]) => key.startsWith(prefix))
    ) as Map<string, T>;
  }
  async setAlarm(time: number) {
    this.alarm = time;
  }
  async deleteAlarm() {
    this.alarm = undefined;
  }
  transaction<T>(fn: (storage: Storage) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn(this));
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

const message = { id: "message-1", sender: "15550000001", text: "Hello" };

function harness(storage = new Storage(), telegram = false) {
  const jobs: Promise<unknown>[] = [];
  let actor: WhatsAppConversation | TelegramConversation;
  const submit = vi.fn(
    async (input: {
      chatGatewayRpcTarget: {
        onGadgetResponse(response: { text: string }): Promise<void>;
      };
    }) => {
      await input.chatGatewayRpcTarget.onGadgetResponse({ text: "Hello back" });
      return { accepted: true as const, chatPath: "/test" };
    }
  );
  const env = {
    TELEGRAM_BOT_TOKEN: "42:test-token",
    TELEGRAM_INGRESS_ENABLED: "true",
    TELEGRAM_ALLOWED_USER_ID: message.sender,
    WHATSAPP_INGRESS_ENABLED: "true",
    WHATSAPP_TEST_SENDER: message.sender,
    WHATSAPP_TEST_EMAIL: "tester@example.com",
    WHATSAPP_PHONE_NUMBER_ID: "phone-id",
    WHATSAPP_APP_SECRET: "test-secret",
    WHATSAPP_VERIFY_TOKEN: "test-verify",
    WHATSAPP_ACCESS_TOKEN: "test-token",
    AGENT_RUNTIME: {
      ensureExternalUser: vi.fn(),
      submitExternalMessage: submit,
      interruptExternalRun: vi.fn(),
    },
  } as unknown as Env;
  const Conversation = telegram ? TelegramConversation : WhatsAppConversation;
  actor = new Conversation(
    {
      storage,
      waitUntil: (promise: Promise<unknown>) => jobs.push(promise),
      exports: {
        [telegram ? "TelegramResponseTarget" : "WhatsAppResponseTarget"]: ({
          props,
        }: {
          props: { messageId: string };
        }) => ({
          onGadgetResponse: ({ text }: { text: string }) =>
            actor.complete(props.messageId, text),
        }),
      },
    },
    env
  );
  return { actor, storage, submit, env, flush: () => Promise.all(jobs) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("deduplicates concurrent receipts and callback replays", async () => {
  const send = vi.fn(async () =>
    Response.json({ messages: [{ id: "out-1" }] })
  );
  vi.stubGlobal("fetch", send);
  const h = harness();
  await Promise.all([h.actor.enqueue(message), h.actor.enqueue(message)]);
  await h.flush();
  await h.actor.complete(message.id, "replayed");
  await h.actor.alarm();
  expect(send).toHaveBeenCalledTimes(1);
  expect(h.submit).toHaveBeenCalledTimes(1);
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "sent",
    text: "",
    providerId: "out-1",
  });
});

it("does not resend a send whose outcome was lost during a restart", async () => {
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  const storage = new Storage();
  await storage.put(`message:${message.id}`, {
    ...message,
    state: "sending",
    createdAt: 0,
    response: "reply",
  });
  await harness(storage).actor.alarm();
  expect(send).not.toHaveBeenCalled();
  expect(await storage.get(`message:${message.id}`)).toMatchObject({
    state: "failed",
  });
});

it("rejects the wrong sender before provisioning an agent", async () => {
  const h = harness();
  await expect(
    h.actor.enqueue({ ...message, sender: "15550000002" })
  ).rejects.toThrow("not authorized");
  expect(h.submit).not.toHaveBeenCalled();
});

it("retries a definitive rate-limit rejection without rerunning the agent", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: { message: "Rate limited" } }, { status: 429 })
    )
    .mockResolvedValueOnce(Response.json({ messages: [{ id: "out-2" }] }));
  vi.stubGlobal("fetch", send);
  const h = harness();
  await h.actor.enqueue(message);
  await h.flush();
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "ready",
    sendAttempts: 1,
  });
  await h.actor.alarm();
  expect(send).toHaveBeenCalledTimes(1);
  const pending = await h.storage.get<{ nextSendAt: number }>(
    `message:${message.id}`
  );
  vi.spyOn(Date, "now").mockReturnValue(pending!.nextSendAt);
  await h.actor.alarm();
  expect(send).toHaveBeenCalledTimes(2);
  expect(h.submit).toHaveBeenCalledTimes(1);
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "sent",
  });
});

it("enforces the staging allowance before model invocation", async () => {
  const h = harness();
  await h.storage.put(`reserved:${new Date().toISOString().slice(0, 7)}`, 10);
  await expect(h.actor.enqueue(message)).rejects.toThrow("allowance exhausted");
  expect(h.submit).not.toHaveBeenCalled();
});

it("delivers Telegram replies once using an isolated guest identity", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ ok: true, result: { message_id: 99 } })
  );
  vi.stubGlobal("fetch", fetcher);
  const h = harness(new Storage(), true);
  await h.actor.enqueue(message);
  await h.flush();
  await h.actor.enqueue(message);
  await h.flush();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(h.env.AGENT_RUNTIME!.ensureExternalUser).toHaveBeenCalledWith({
    email: `tg-42-${message.sender}@guest.invalid`,
    displayName: `tg-42-${message.sender}`,
  });
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "sent",
    text: "",
    providerId: "99",
  });
});

it("continues Telegram beyond the old ten-turn cap without resetting usage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true, result: { message_id: 99 } }))
  );
  const h = harness(new Storage(), true);
  Object.assign(h.env, { TELEGRAM_MONTHLY_TURN_LIMIT: "1000" });
  const quotaKey = `reserved:${new Date().toISOString().slice(0, 7)}`;
  await h.storage.put(quotaKey, 10);
  await h.actor.enqueue(message);
  await h.flush();
  expect(h.submit).toHaveBeenCalledTimes(1);
  expect(await h.storage.get(quotaKey)).toBe(11);
});

it("sends one durable quota notice on retries without invoking the model", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ ok: true, result: { message_id: 99 } })
  );
  vi.stubGlobal("fetch", fetcher);
  const h = harness(new Storage(), true);
  Object.assign(h.env, { TELEGRAM_MONTHLY_TURN_LIMIT: "1000" });
  const quotaKey = `reserved:${new Date().toISOString().slice(0, 7)}`;
  await h.storage.put(quotaKey, 1000);
  await h.actor.enqueue(message);
  await h.flush();
  await h.actor.enqueue(message);
  await h.flush();
  expect(h.submit).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      body: expect.stringContaining("monthly testing allowance"),
    })
  );
  expect(await h.storage.get(quotaKey)).toBe(1000);
});

it.each([
  undefined,
  "",
  "0",
  "-1",
  "NaN",
  "1000000",
])("fails closed for invalid Telegram limit %s", async (limit) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true, result: { message_id: 99 } }))
  );
  const h = harness(new Storage(), true);
  Object.assign(h.env, { TELEGRAM_MONTHLY_TURN_LIMIT: limit });
  await h.storage.put(`reserved:${new Date().toISOString().slice(0, 7)}`, 10);
  await h.actor.enqueue(message);
  await h.flush();
  expect(h.submit).not.toHaveBeenCalled();
});

it("starts a fresh allowance in a new UTC month", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true, result: { message_id: 99 } }))
  );
  const h = harness(new Storage(), true);
  await h.storage.put("reserved:2000-01", 10);
  await h.actor.enqueue(message);
  await h.flush();
  expect(h.submit).toHaveBeenCalledTimes(1);
});

it("caps admission across different Telegram senders and permits only matching retries", async () => {
  const actor = new TelegramAdmission({ storage: new Storage() }, {} as Env);
  for (let id = 0; id < 10; id++) {
    expect(await actor.reserve(String(id), String(100 + id))).toBe(true);
  }
  expect(await actor.reserve("0", "100")).toBe(true);
  expect(await actor.reserve("0", "999")).toBe(false);
  expect(await actor.reserve("11", "999")).toBe(false);
});

it("blocks direct Telegram ingress and old queued turns after access is revoked", async () => {
  const h = harness(new Storage(), true);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  Object.assign(h.env, { TELEGRAM_ALLOWED_USER_ID: "999" });
  await expect(h.actor.enqueue(message)).rejects.toThrow("not authorized");
  await h.storage.put(`message:${message.id}`, {
    ...message,
    state: "queued",
    createdAt: 1,
  });
  await h.actor.alarm();
  expect(h.submit).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(h.storage.alarm).toBeUndefined();
});

it("refreshes Telegram activity after restart without resubmitting and stops after delivery", async () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      calls.push({
        method: url.split("/").at(-1)!,
        body: JSON.parse(options.body as string),
      });
      return Response.json({ ok: true, result: { message_id: 99 } });
    })
  );
  const h = harness(new Storage(), true);
  h.submit.mockImplementation(async () => ({
    accepted: true,
    chatPath: "/test",
  }));
  const input = { ...message, id: "123" };
  await h.actor.enqueue(input);
  await h.flush();
  expect(calls.map((call) => call.method)).toEqual(["sendChatAction"]);
  expect(calls[0]!.body).toEqual({
    action: "typing",
    chat_id: input.sender,
  });
  now += 4000;
  const restarted = harness(h.storage, true);
  await restarted.actor.alarm();
  expect(restarted.submit).not.toHaveBeenCalled();
  expect(calls.map((call) => call.method)).toEqual([
    "sendChatAction",
    "sendChatAction",
  ]);
  now += 16_000;
  await restarted.actor.alarm();
  expect(calls.every((call) => call.method === "sendChatAction")).toBe(true);
  await restarted.actor.complete(input.id, "Done");
  await restarted.flush();
  const count = calls.length;
  now += 40_000;
  await restarted.actor.alarm();
  expect(calls).toHaveLength(count);
  expect(calls.at(-1)!.method).toBe("sendMessage");
  expect(h.storage.alarm).toBeUndefined();
});

it("status failures do not prevent an agent response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.endsWith("/sendMessage")) {
        throw new Error("unavailable");
      }
      return Response.json({ ok: true, result: { message_id: 99 } });
    })
  );
  const h = harness(new Storage(), true);
  await h.actor.enqueue(message);
  await h.flush();
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "sent",
  });
  expect(h.submit).toHaveBeenCalledTimes(1);
});

it("persists status rate limits and stops refreshes when ingress is disabled", async () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetcher = vi.fn(async () =>
    Response.json(
      { ok: false, parameters: { retry_after: 60 } },
      { status: 429 }
    )
  );
  vi.stubGlobal("fetch", fetcher);
  const h = harness(new Storage(), true);
  h.submit.mockImplementation(async () => ({
    accepted: true,
    chatPath: "/test",
  }));
  await h.actor.enqueue(message);
  await h.flush();
  expect(fetcher).toHaveBeenCalledTimes(1);
  now += 30_000;
  const restarted = harness(h.storage, true);
  restarted.submit.mockImplementation(async () => ({
    accepted: true,
    chatPath: "/test",
  }));
  await restarted.actor.alarm();
  expect(fetcher).toHaveBeenCalledTimes(1);
  now += 30_000;
  Object.assign(restarted.env, { TELEGRAM_INGRESS_ENABLED: "false" });
  await restarted.actor.alarm();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("preserves completion arriving during a Telegram status refresh", async () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const h = harness(new Storage(), true);
  let complete = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (complete && url.endsWith("/sendChatAction")) {
        complete = false;
        await h.actor.complete(message.id, "Finished during status");
      }
      return Response.json({ ok: true, result: { message_id: 99 } });
    })
  );
  h.submit.mockImplementation(async () => ({
    accepted: true,
    chatPath: "/test",
  }));
  await h.actor.enqueue(message);
  await h.flush();
  now += 4000;
  complete = true;
  await h.actor.alarm();
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "sent",
  });
  expect(h.submit).toHaveBeenCalledTimes(1);
});

it.each([
  "failed",
  "timeout",
] as const)("does not refresh Telegram status after %s", async (state) => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const h = harness(new Storage(), true);
  await h.storage.put(`message:${message.id}`, {
    ...message,
    state: state === "failed" ? "failed" : "running",
    createdAt: 1,
    startedAt: 1,
  });
  await h.actor.alarm();
  await h.actor.alarm();
  expect(fetcher).not.toHaveBeenCalled();
  expect(h.submit).not.toHaveBeenCalled();
});

it("preserves a callback arriving while a timed-out run is interrupted", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ messages: [{ id: "out-late" }] }))
  );
  const h = harness();
  await h.storage.put(`message:${message.id}`, {
    ...message,
    state: "running",
    createdAt: 1,
    startedAt: 1,
  });
  vi.mocked(h.env.AGENT_RUNTIME!.interruptExternalRun).mockImplementation(
    async () => {
      await h.actor.complete(message.id, "Completed during interrupt");
    }
  );
  await h.actor.alarm();
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "ready",
  });
  await h.actor.alarm();
  expect(await h.storage.get(`message:${message.id}`)).toMatchObject({
    state: "sent",
    providerId: "out-late",
  });
});
