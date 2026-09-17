import { IdentityService } from "@delulu/services";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterEach, expect, it, vi } from "vitest";
import { makePgLayer } from "../src/base-layer";
import type { Env } from "../src/env";

vi.mock("cloudflare:workers", () => {
  class Worker {
    protected readonly ctx: unknown;
    protected readonly env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  }
  return { DurableObject: Worker, WorkerEntrypoint: Worker };
});

import { TelegramLinkedConversation } from "../src/telegram-linked-conversation";

class Storage {
  private readonly values = new Map<string, unknown>();
  private queue = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string) {
    return this.values.delete(key);
  }
  async list<T>({ prefix }: { prefix: string }): Promise<Map<string, T>> {
    return new Map(
      [...this.values].filter(([key]) => key.startsWith(prefix))
    ) as Map<string, T>;
  }
  async setAlarm(_time: number) {
    return undefined;
  }
  async deleteAlarm() {
    return undefined;
  }
  transaction<T>(work: (storage: Storage) => Promise<T>): Promise<T> {
    const result = this.queue.then(() => work(this));
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
afterEach(() => vi.unstubAllGlobals());

it("links through a private confirmation, routes authenticated chats, resets sessions, and rejects old buttons", async () => {
  const env: Env = {
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgres://delulu:delulu@localhost:5432/delulu",
    ENVIRONMENT: `test-${crypto.randomUUID()}`,
    TELEGRAM_BOT_TOKEN: "42:test",
    TELEGRAM_INGRESS_ENABLED: "true",
    TELEGRAM_ACCOUNT_LINKING_ENABLED: "true",
    APP_BASE_URL: "https://app.example.test",
  };
  const identity = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* IdentityService;
      const sql = yield* SqlClient.SqlClient;
      const user = yield* service.resolve({
        sub: `telegram-${crypto.randomUUID()}`,
        email: `telegram-${crypto.randomUUID()}@example.test`,
      });
      yield* sql`INSERT INTO agent_beta_invites (user_id) VALUES (${user.user.id})`;
      return {
        userId: user.user.id,
        workspaceId: user.personalWorkspace!.id,
        verifiedEmail: user.user.email!,
      };
    }).pipe(
      Effect.provide(IdentityService.layer),
      Effect.provide(makePgLayer(env))
    )
  );
  const sent: Array<{
    text?: string;
    reply_markup?: {
      inline_keyboard: Array<
        Array<{ text: string; url?: string; callback_data?: string }>
      >;
    };
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/sendMessage")) {
        sent.push(JSON.parse(String(init.body)));
      }
      return Response.json({ ok: true, result: { message_id: sent.length } });
    })
  );
  const submissions: Array<{
    callerEmail: string;
    gadgetKey: string;
    chatKey: string;
  }> = [];
  const jobs: Promise<unknown>[] = [];
  const storage = new Storage();
  let requireApproval = false;
  let interruptFailures = 0;
  const decisions: unknown[] = [];
  let actor: TelegramLinkedConversation;
  const fullEnv = {
    ...env,
    AGENT_RUNTIME: {
      ensureExternalUser: async () => undefined,
      submitExternalMessage: async (input: {
        callerEmail: string;
        gadgetKey: string;
        chatKey: string;
        messageKey: string;
        chatGatewayRpcTarget: {
          onGadgetResponse(response: unknown): Promise<void>;
        };
      }) => {
        submissions.push(input);
        await input.chatGatewayRpcTarget.onGadgetResponse({
          text: "Hello from your workspace.",
          actions: requireApproval
            ? [{ id: "17", summary: "Schedule a test draft" }]
            : [],
          usage: {
            provider: "test",
            model: "test",
            inputTokens: 1,
            outputTokens: 1,
            cachedInputTokens: 0,
            costMicros: 10,
          },
        });
        return { accepted: true, chatPath: "/chat" };
      },
      interruptExternalRun: async () => {
        if (interruptFailures-- > 0) {
          throw new Error("Transient runtime failure");
        }
      },
      resolveExternalAction: async (input: unknown) => {
        decisions.push(input);
      },
    },
  } as Env;
  actor = new TelegramLinkedConversation(
    {
      storage,
      blockConcurrencyWhile: (work: () => Promise<unknown>) => work(),
      waitUntil: (work: Promise<unknown>) => jobs.push(work),
      exports: {
        TelegramLinkedResponseTarget: ({
          props,
        }: {
          props: { messageId: string };
        }) => ({
          onGadgetResponse: (
            response: Parameters<
              TelegramLinkedConversation["completeResponse"]
            >[1]
          ) => actor.completeResponse(props.messageId, response),
        }),
      },
    },
    fullEnv
  );
  const drain = async () => {
    while (jobs.length) {
      await Promise.all(jobs.splice(0));
    }
  };
  await actor.enqueue({ id: "1", sender: "123", text: "/start" });
  expect(submissions).toHaveLength(0);
  const challenge = new URL(
    sent[0]!.reply_markup!.inline_keyboard[0]![0]!.url!
  ).hash.slice(1);
  await expect(
    actor.offerLink({ challenge: challenge + "bad", candidate: identity })
  ).rejects.toThrow();
  await actor.offerLink({ challenge, candidate: identity });
  expect(submissions).toHaveLength(0);
  const confirm =
    sent.at(-1)!.reply_markup!.inline_keyboard[0]![0]!.callback_data!;
  await actor.enqueue({
    id: "2",
    sender: "123",
    text: "",
    callback: { id: "q1", data: confirm },
  });
  const newButton =
    sent.at(-1)!.reply_markup!.inline_keyboard[0]![0]!.callback_data!;
  await actor.enqueue({ id: "3", sender: "123", text: "hello" });
  await drain();
  await actor.enqueue({ id: "3", sender: "123", text: "hello" });
  await drain();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]!.callerEmail).toBe(identity.verifiedEmail);
  expect(submissions[0]!.gadgetKey).toBe(`workspace:${identity.workspaceId}`);
  await actor.enqueue({
    id: "4",
    sender: "123",
    text: "",
    callback: { id: "q2", data: newButton },
  });
  await actor.enqueue({ id: "5", sender: "123", text: "next chat" });
  await drain();
  expect(submissions[1]!.chatKey).not.toBe(submissions[0]!.chatKey);
  await expect(
    actor.enqueue({ id: "6", sender: "456", text: "wrong sender" })
  ).rejects.toThrow("Wrong sender");
  await expect(
    actor.offerLink({ challenge, candidate: identity })
  ).rejects.toThrow();
  requireApproval = true;
  await actor.enqueue({ id: "7", sender: "123", text: "schedule a draft" });
  await drain();
  expect(await storage.get("pending:7")).toBeDefined();
  interruptFailures = 1;
  await expect(
    actor.enqueue({ id: "8", sender: "123", text: "/stop" })
  ).rejects.toThrow("Transient runtime failure");
  expect(await storage.get("control:8")).toBeUndefined();
  await actor.enqueue({ id: "8", sender: "123", text: "/stop" });
  expect(await storage.get("control:8")).toBeDefined();
  expect(await storage.get("pending:7")).toBeUndefined();
  expect(decisions).toHaveLength(1);
  const connectionId = await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{
        id: string;
      }>`SELECT id FROM agent_channel_identities WHERE user_id = ${identity.userId} AND environment = ${env.ENVIRONMENT}`;
      yield* sql`UPDATE agent_beta_invites SET revoked_at = now() WHERE user_id = ${identity.userId}`;
      return rows[0]!.id;
    }).pipe(Effect.provide(makePgLayer(env)))
  );
  await expect(
    actor.manageConnection({
      sender: "123",
      userId: "wrong-user",
      connectionId,
    })
  ).rejects.toThrow();
  await actor.manageConnection({
    sender: "123",
    userId: identity.userId,
    connectionId,
  });
  await actor.enqueue({ id: "9", sender: "123", text: "hello again" });
  await drain();
  expect(submissions).toHaveLength(3);
});
