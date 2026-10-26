import { createHash, generateKeyPairSync } from "node:crypto";
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

it.each([
  false,
  true,
])("links, deduplicates, changes chats and cancels approvals (Codex: %s)", async (codex) => {
  const env: Env = {
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgres://delulu:delulu@localhost:5432/delulu",
    ENVIRONMENT: `test-${crypto.randomUUID()}`,
    TELEGRAM_BOT_TOKEN: "42:test",
    TELEGRAM_INGRESS_ENABLED: "true",
    TELEGRAM_ACCOUNT_LINKING_ENABLED: "true",
    APP_BASE_URL: "https://app.example.test",
    AS_SIGNING_KEY: generateKeyPairSync("ec", { namedCurve: "prime256v1" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
    ENCRYPTION_SECRET: "codex-test-only",
    ...(codex
      ? {
          CODEX_RUNTIME_ENABLED: "true",
          CODEX_RUNTIME_URL: "https://runner.example.test",
          CODEX_RUNTIME_SECRET: "s".repeat(32),
        }
      : {}),
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
  const runnerJobs = new Map<
    string,
    {
      id: string;
      state: string;
      request: null;
      events: { sequence: number; response: unknown }[];
    }
  >();
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (target: string | URL, init: RequestInit) => {
      const url = String(target);
      if (url === "https://runner.example.test/rpc") {
        const { operation, userId, input } = JSON.parse(String(init.body));
        expect(userId).toBe(identity.userId);
        expect(new Headers(init.headers).get("authorization")).toBe(
          `Bearer ${env.CODEX_RUNTIME_SECRET}`
        );
        if (operation === "peek") {
          return Response.json({
            enabled: true,
            selected: true,
            state: "connected",
            generation: "connected",
            model: null,
            account: null,
            plan: null,
            limits: null,
            error: null,
            login: null,
          });
        }
        if (operation === "submit") {
          expect(input.workspaceId).toBe(identity.workspaceId);
          const id = digest(
            JSON.stringify([
              digest(userId),
              input.scope,
              input.generation,
              input.messageKey,
            ])
          );
          submissions.push({
            callerEmail: identity.verifiedEmail,
            gadgetKey: `workspace:${input.workspaceId}`,
            chatKey: input.scope,
          });
          const job = {
            id,
            state: requireApproval ? "waiting_approval" : "completed",
            request: null,
            events: [
              {
                sequence: 1,
                response: {
                  text: "Hello from your workspace.",
                  ...(requireApproval
                    ? {
                        actions: [
                          {
                            id: "17",
                            kind: "remember",
                            summary: "Remember a preference",
                            risk: "consequential",
                          },
                        ],
                      }
                    : {}),
                  usage: {
                    provider: "chatgpt",
                    model: "test",
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedInputTokens: 0,
                    costMicros: 0,
                  },
                },
              },
            ],
          };
          runnerJobs.set(id, job);
          return Response.json(job);
        }
        if (operation === "poll") {
          const job = runnerJobs.get(input.id)!;
          return Response.json({
            ...job,
            events: job.events.filter((event) => event.sequence > input.after),
          });
        }
        if (operation === "claimAction") {
          decisions.push(input);
          return Response.json({
            kind: "remember",
            workspaceId: identity.workspaceId,
            value: {
              category: "preference",
              text: "Keep posts concise.",
              scope: "personal",
            },
          });
        }
        if (operation === "resolveAction") {
          expect(input.result.ok).toBe(true);
          const job = runnerJobs.get(input.id)!;
          job.state = "completed";
          job.events.push({
            sequence: 2,
            response: { text: "Preference saved." },
          });
          return Response.json({ updated: true });
        }
        if (operation === "interrupt") {
          if (interruptFailures-- > 0) {
            return Response.json({ error: "Unavailable" }, { status: 503 });
          }
          runnerJobs.get(input.id)!.state = "cancelled";
          return Response.json({ updated: true });
        }
        throw new Error(`Unexpected runner operation: ${operation}`);
      }
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
        if (codex) {
          throw new Error("Subscription turn fell back to Cloudflare");
        }
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
    if (codex) {
      await actor.alarm();
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
  if (codex) {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE agent_workspaces SET external_writes_enabled = true WHERE user_id = ${identity.userId}`;
      }).pipe(Effect.provide(makePgLayer(env)))
    );
    await actor.enqueue({
      id: "approve-task",
      sender: "123",
      text: "Remember my preference",
    });
    await drain();
    const approval =
      sent.at(-1)!.reply_markup!.inline_keyboard[0]![0]!.callback_data!;
    const approve = {
      id: "approve-control",
      sender: "123",
      text: "",
      callback: { id: "approve", data: approval },
    };
    await actor.enqueue(approve);
    await drain();
    await actor.enqueue(approve);
    expect(sent.some((message) => message.text === "Preference saved.")).toBe(
      true
    );
    expect(decisions).toHaveLength(1);
    const count = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          count: string;
        }>`SELECT count(*)::text AS count FROM agent_external_effects WHERE caller_email = ${identity.verifiedEmail} AND status = 'completed'`;
      }).pipe(Effect.provide(makePgLayer(env)))
    );
    expect(count[0]?.count).toBe("1");
  }
  await actor.enqueue({ id: "7", sender: "123", text: "schedule a draft" });
  await drain();
  expect(await storage.get("pending:7")).toBeDefined();
  interruptFailures = 1;
  await expect(
    actor.enqueue({ id: "8", sender: "123", text: "/stop" })
  ).rejects.toThrow(
    codex ? "ChatGPT request unavailable" : "Transient runtime failure"
  );
  expect(await storage.get("control:8")).toBeUndefined();
  await actor.enqueue({ id: "8", sender: "123", text: "/stop" });
  expect(await storage.get("control:8")).toBeDefined();
  expect(await storage.get("pending:7")).toBeUndefined();
  expect(decisions).toHaveLength(1);
  if (codex) {
    expect([...runnerJobs.values()].at(-1)?.state).toBe("cancelled");
    expect(
      sent.some((message) => message.text === "Hello from your workspace.")
    ).toBe(true);
  }
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
  expect(submissions).toHaveLength(codex ? 4 : 3);
});
