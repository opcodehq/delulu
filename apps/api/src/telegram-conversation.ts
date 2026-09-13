import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { telegramCall } from "@delulu/communication-telegram";
import {
  ChannelConversation,
  type DeliveryResult,
  type MessageRecord,
} from "./channel-conversation";
import { isAllowedTelegramSender } from "./channel-routing";
import type { Env } from "./env";

const MONTHLY_TURN_LIMIT = /^[1-9]\d{0,5}$/;

export const telegramConversationName = (token: string, sender: string) =>
  `telegram:${token.split(":")[0]}:${sender}`;

export class TelegramConversation extends ChannelConversation {
  protected monthlyTurnLimit(): number {
    const configured = this.env.TELEGRAM_MONTHLY_TURN_LIMIT ?? "10";
    return MONTHLY_TURN_LIMIT.test(configured) ? Number(configured) : 10;
  }

  protected quotaExceededResponse(): string {
    return "You've reached this bot's monthly testing allowance. It resets on the first of next month (UTC). Ask the administrator to increase it if you need more turns.";
  }

  protected async showProcessing(record: MessageRecord): Promise<number> {
    const previous = await this.ctx.storage.get<{
      messageId: string;
      typingAt: number;
    }>("telegram-progress");
    const progress =
      previous?.messageId === record.id
        ? previous
        : {
            messageId: record.id,
            typingAt: 0,
          };
    if (progress.typingAt <= Date.now()) {
      const result = await telegramCall<boolean>(
        this.env.TELEGRAM_BOT_TOKEN!,
        "sendChatAction",
        { chat_id: record.sender, action: "typing" },
        1500
      );
      progress.typingAt =
        Date.now() +
        (result.ok ? 4000 : Math.max(30_000, result.retryAfterMs ?? 0));
    }
    await this.ctx.storage.put("telegram-progress", progress);
    return Math.max(1000, Math.min(30_000, progress.typingAt - Date.now()));
  }
  protected enabled() {
    return this.env.TELEGRAM_INGRESS_ENABLED === "true";
  }
  protected authorized(sender: string) {
    return isAllowedTelegramSender(sender, this.env.TELEGRAM_ALLOWED_USER_ID);
  }
  protected email(sender: string) {
    return `tg-${this.env.TELEGRAM_BOT_TOKEN!.split(":")[0]}-${sender}@guest.invalid`;
  }
  protected name(sender: string) {
    return telegramConversationName(this.env.TELEGRAM_BOT_TOKEN!, sender);
  }
  protected target() {
    return "TelegramResponseTarget";
  }
  protected async send(record: MessageRecord): Promise<DeliveryResult> {
    const result = await telegramCall<{ message_id: number }>(
      this.env.TELEGRAM_BOT_TOKEN!,
      "sendMessage",
      { chat_id: record.sender, text: record.response }
    );
    if (result.ok && Number.isSafeInteger(result.result?.message_id)) {
      return {
        ok: true,
        value: { messageKey: String(result.result.message_id) },
      };
    }
    const status = result.ok ? 0 : result.status;
    return {
      ok: false,
      error: {
        status,
        reason: "telegram_send_failed",
        retryable: status === 429,
        retryAfterMs: result.ok ? undefined : result.retryAfterMs,
        deliveryState: status >= 400 && status < 500 ? "not_sent" : "unknown",
      },
    };
  }
}

export class TelegramResponseTarget extends WorkerEntrypoint<
  Env,
  { conversation: string; messageId: string }
> {
  async onGadgetResponse(response: { text: string }) {
    if (!this.env.TELEGRAM_CONVERSATIONS) {
      throw new Error("Telegram storage unavailable");
    }
    await this.env.TELEGRAM_CONVERSATIONS.getByName(
      this.ctx.props.conversation
    ).complete(this.ctx.props.messageId, response.text);
  }
}

/** Legacy storage compatibility; ingress now reserves in the allowlisted conversation. */
export class TelegramAdmission extends DurableObject<Env> {
  async reserve(id: string, sender: string): Promise<boolean> {
    return this.ctx.storage.transaction(async (storage) => {
      const key = `receipt:${id}`;
      const previous = await storage.get<string>(key);
      if (previous) {
        return previous === sender;
      }
      const count = (await storage.get<number>("reserved")) ?? 0;
      if (count >= 10) {
        return false;
      }
      await storage.put(key, sender);
      await storage.put("reserved", count + 1);
      return true;
    });
  }
}
