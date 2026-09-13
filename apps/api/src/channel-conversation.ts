import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { makeWhatsAppProvider } from "@delulu/communication-whatsapp";
import { Effect } from "effect";
import { conversationName } from "./channel-routing";
import type { Env } from "./env";

export interface ChannelMessage {
  id: string;
  sender: string;
  text: string;
}

export interface MessageRecord extends ChannelMessage {
  state: "queued" | "running" | "ready" | "sending" | "sent" | "failed";
  createdAt: number;
  startedAt?: number;
  response?: string;
  providerId?: string;
  sendAttempts?: number;
  nextSendAt?: number;
  submittedAt?: number;
}

export interface ConversationBinding {
  enqueue(message: ChannelMessage): Promise<void>;
  complete(id: string, text: string): Promise<void>;
}

/** Durable receipt and outbox; channel payloads never enter the product database. */
export type DeliveryResult =
  | { ok: true; value: { messageKey: string } }
  | {
      ok: false;
      error: {
        retryable: boolean;
        deliveryState: string;
        status?: number;
        reason: string;
        retryAfterMs?: number;
      };
    };

export class ChannelConversation extends DurableObject<Env> {
  private draining?: Promise<void>;

  protected monthlyTurnLimit(): number {
    return 10;
  }

  protected quotaExceededResponse(): string | undefined {
    return undefined;
  }

  /** Best-effort channel feedback; returns the next recovery wake interval. */
  protected async showProcessing(_record: MessageRecord): Promise<number> {
    return 30_000;
  }

  protected enabled() {
    return this.env.WHATSAPP_INGRESS_ENABLED === "true";
  }
  protected authorized(sender: string) {
    return sender === this.env.WHATSAPP_TEST_SENDER;
  }
  protected email(_sender: string) {
    return this.env.WHATSAPP_TEST_EMAIL;
  }
  protected name(sender: string) {
    return conversationName(this.env.WHATSAPP_PHONE_NUMBER_ID!, sender);
  }
  protected target() {
    return "WhatsAppResponseTarget";
  }

  protected async send(record: MessageRecord): Promise<DeliveryResult> {
    const provider = makeWhatsAppProvider({
      accessToken: this.env.WHATSAPP_ACCESS_TOKEN ?? "",
      appSecret: this.env.WHATSAPP_APP_SECRET ?? "",
      verifyToken: this.env.WHATSAPP_VERIFY_TOKEN ?? "",
      phoneNumberId: this.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      graphApiVersion: "v26.0",
    });
    return Effect.runPromise(
      provider
        .sendText({
          recipient: record.sender,
          text: record.response!,
          replyToMessageKey: record.id,
        })
        .pipe(
          Effect.match({
            onSuccess: (value) => ({ ok: true as const, value }),
            onFailure: (error) => ({ ok: false as const, error }),
          })
        )
    );
  }

  async enqueue(message: ChannelMessage): Promise<void> {
    if (!(this.authorized(message.sender) && this.email(message.sender))) {
      throw new Error("Channel identity is not authorized");
    }
    await this.ctx.storage.transaction(async (storage) => {
      const principal = await storage.get<string>("principal");
      if (principal && principal !== this.email(message.sender)) {
        throw new Error(
          "Channel identity changed; explicit migration required"
        );
      }
      if (await storage.get(`message:${message.id}`)) {
        return;
      }
      const month = new Date().toISOString().slice(0, 7);
      const quotaKey = `reserved:${month}`;
      const reserved = (await storage.get<number>(quotaKey)) ?? 0;
      // Conservative staging reservation. Failed runs retain their reservation.
      const exhausted = reserved >= this.monthlyTurnLimit();
      const response = exhausted ? this.quotaExceededResponse() : undefined;
      if (exhausted && !response) {
        throw new Error("Staging turn allowance exhausted");
      }
      if (!exhausted) {
        await storage.put(quotaKey, reserved + 1);
      }
      await storage.put("principal", this.email(message.sender)!);
      await storage.put(`message:${message.id}`, {
        ...message,
        state: exhausted ? "ready" : "queued",
        response,
        createdAt: Date.now(),
      } satisfies MessageRecord);
      await storage.setAlarm(Date.now() + 1000);
    });
    this.ctx.waitUntil(this.drain());
  }

  async complete(id: string, text: string): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      const record = await storage.get<MessageRecord>(`message:${id}`);
      if (!record || record.state !== "running") {
        return;
      }
      await storage.put(`message:${id}`, {
        ...record,
        state: "ready",
        response:
          text.slice(0, 3900) || "The agent completed without a text response.",
      } satisfies MessageRecord);
      await storage.setAlarm(Date.now() + 1000);
    });
    this.ctx.waitUntil(this.drain());
  }

  async alarm(): Promise<void> {
    await this.drain();
  }

  private drain(): Promise<void> {
    if (this.draining) {
      return this.draining;
    }
    this.draining = this.process().finally(() => {
      this.draining = undefined;
    });
    return this.draining;
  }

  private async process(): Promise<void> {
    if (!this.enabled()) {
      return;
    }
    const principal = await this.ctx.storage.get<string>("principal");
    const records = [
      ...(
        await this.ctx.storage.list<MessageRecord>({ prefix: "message:" })
      ).values(),
    ].sort((a, b) => a.createdAt - b.createdAt);
    for (const record of records) {
      if (!this.authorized(record.sender)) {
        await this.ctx.storage.deleteAlarm();
        return;
      }
      if (principal && principal !== this.email(record.sender)) {
        throw new Error("Channel principal does not match configuration");
      }
      const key = `message:${record.id}`;
      if (record.state === "sent" || record.state === "failed") {
        continue;
      }
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      if (record.state === "sending") {
        // A crash after Meta accepted a send is ambiguous; never double-send it.
        await this.ctx.storage.put(key, {
          ...record,
          state: "failed",
          text: "",
          response: undefined,
        });
        continue;
      }
      if (record.state === "ready") {
        if (record.nextSendAt && record.nextSendAt > Date.now()) {
          await this.ctx.storage.setAlarm(record.nextSendAt);
          return;
        }
        await this.ctx.storage.put(key, { ...record, state: "sending" });
        const result = await this.send(record);
        const attempts = (record.sendAttempts ?? 0) + 1;
        if (
          !result.ok &&
          result.error.retryable &&
          result.error.deliveryState === "not_sent" &&
          attempts < 3
        ) {
          const nextSendAt =
            Date.now() + Math.max(30_000, result.error.retryAfterMs ?? 0);
          await this.ctx.storage.put(key, {
            ...record,
            state: "ready",
            sendAttempts: attempts,
            nextSendAt,
          });
          await this.ctx.storage.setAlarm(nextSendAt);
          return;
        }
        await this.ctx.storage.put(key, {
          ...record,
          state: result.ok ? "sent" : "failed",
          providerId: result.ok ? result.value.messageKey : undefined,
          sendAttempts: attempts,
          text: "",
          response: undefined,
        });
        console.info("channel_delivery", {
          outcome: result.ok ? "sent" : "failed",
          status: result.ok ? 200 : result.error.status,
          reason: result.ok ? undefined : result.error.reason,
        });
        continue;
      }
      const runtime = this.env.AGENT_RUNTIME;
      if (!runtime) {
        throw new Error("Agent runtime is not configured");
      }
      if (record.startedAt && Date.now() - record.startedAt > 20 * 60_000) {
        await runtime.interruptExternalRun({
          callerEmail: this.email(record.sender)!,
          gadgetKey: "content-hq",
          chatKey: this.name(record.sender),
          messageKey: record.id,
        });
        await this.ctx.storage.transaction(async (storage) => {
          const current = await storage.get<MessageRecord>(key);
          if (current?.state === "running") {
            await storage.put(key, {
              ...current,
              state: "failed",
              text: "",
            });
          }
        });
        continue;
      }
      const shouldSubmit =
        !record.submittedAt || Date.now() - record.submittedAt >= 30_000;
      const active = {
        ...record,
        state: "running" as const,
        startedAt: record.startedAt ?? Date.now(),
        submittedAt: shouldSubmit ? Date.now() : record.submittedAt,
      };
      const activated = await this.ctx.storage.transaction(async (storage) => {
        const current = await storage.get<MessageRecord>(key);
        if (current?.state !== "queued" && current?.state !== "running") {
          return false;
        }
        await storage.put(key, active);
        return true;
      });
      if (!activated) {
        return this.process();
      }
      const wakeAfter = await this.showProcessing(active);
      if ((await this.ctx.storage.get<MessageRecord>(key))?.state === "ready") {
        return this.process();
      }
      await this.ctx.storage.setAlarm(Date.now() + wakeAfter);
      // Frequent status refreshes must not repeatedly submit the same agent turn.
      if (!shouldSubmit) {
        return;
      }
      await runtime.ensureExternalUser({
        email: this.email(record.sender)!,
        displayName: this.email(record.sender)!.split("@")[0],
      });
      const exports = this.ctx.exports as unknown as Record<
        string,
        (input: { props: { conversation: string; messageId: string } }) => {
          onGadgetResponse(response: { text: string }): Promise<void>;
        }
      >;
      const name = this.name(record.sender);
      const result = await runtime.submitExternalMessage({
        callerEmail: this.email(record.sender)!,
        gadgetKey: "content-hq",
        chatKey: name,
        messageKey: record.id,
        gadgetTitle: "Content HQ",
        prompt: record.text,
        chatGatewayRpcTarget: exports[this.target()]!({
          props: { conversation: name, messageId: record.id },
        }),
      });
      if (!result.accepted) {
        await this.complete(record.id, result.message);
      }
      if ((await this.ctx.storage.get<MessageRecord>(key))?.state === "ready") {
        return this.process();
      }
      // The runtime deduplicates resubmission after crashes; callbacks wake the outbox.
      return;
    }
    await this.ctx.storage.transaction(async (storage) => {
      const pending = [
        ...(await storage.list<MessageRecord>({ prefix: "message:" })).values(),
      ].some((record) => record.state !== "sent" && record.state !== "failed");
      if (pending) {
        await storage.setAlarm(Date.now() + 1000);
      } else {
        await storage.deleteAlarm();
      }
    });
  }
}

export class WhatsAppResponseTarget extends WorkerEntrypoint<
  Env,
  { conversation: string; messageId: string }
> {
  async onGadgetResponse(response: { text: string }): Promise<void> {
    if (!this.env.WHATSAPP_CONVERSATIONS) {
      throw new Error("Channel storage unavailable");
    }
    await this.env.WHATSAPP_CONVERSATIONS.getByName(
      this.ctx.props.conversation
    ).complete(this.ctx.props.messageId, response.text);
  }
}
