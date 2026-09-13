import {
  decodeTelegramMessage,
  secretMatches,
  telegramCall,
} from "@delulu/communication-telegram";
import {
  decodeWhatsAppWebhook,
  verifyWhatsAppChallenge,
  verifyWhatsAppSignature,
} from "@delulu/communication-whatsapp";
import { Effect } from "effect";
import { conversationName, isAllowedTelegramSender } from "./channel-routing";
import type { Env } from "./env";

export type { Env } from "./env";

const WEBHOOK_PATH = "/v1/providers/whatsapp/webhook";

async function readWebhookBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      size += chunk.value.byteLength;
      if (size > 256_000) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

const textResponse = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });

const handleChallenge = async (url: URL, env: Env): Promise<Response> => {
  if (!env.WHATSAPP_VERIFY_TOKEN) {
    return textResponse("Webhook verification is not configured", 503);
  }
  const result = await Effect.runPromise(
    verifyWhatsAppChallenge(env.WHATSAPP_VERIFY_TOKEN, {
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      challenge: url.searchParams.get("hub.challenge"),
    }).pipe(
      Effect.match({
        onFailure: () => ({ ok: false as const }),
        onSuccess: (challenge) => ({ ok: true as const, challenge }),
      })
    )
  );
  return result.ok
    ? textResponse(result.challenge, 200)
    : textResponse("Forbidden", 403);
};

export const handleProviderIngress = async (
  request: Request,
  env: Env
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/live") {
    return jsonResponse({ service: "delulu-api", status: "ok" });
  }
  if (url.pathname === "/v1/providers/telegram/setup") {
    if (
      !(await secretMatches(
        request.headers.get("authorization"),
        env.TELEGRAM_SETUP_TOKEN
          ? `Bearer ${env.TELEGRAM_SETUP_TOKEN}`
          : undefined
      ))
    ) {
      return textResponse("Forbidden", 403);
    }
    if (request.method !== "POST" && request.method !== "GET") {
      return textResponse("Method not allowed", 405);
    }
    if (!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET)) {
      return textResponse("Not configured", 503);
    }
    if (!env.API_RESOURCE?.startsWith("https://")) {
      return textResponse("Webhook origin not configured", 503);
    }
    const expected = new URL("/v1/providers/telegram/webhook", env.API_RESOURCE)
      .href;
    if (request.method === "POST") {
      const registered = await telegramCall(
        env.TELEGRAM_BOT_TOKEN,
        "setWebhook",
        {
          url: expected,
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message"],
          max_connections: 2,
        }
      );
      if (!registered.ok) {
        return jsonResponse(
          { error: "Telegram registration failed", status: registered.status },
          502
        );
      }
    }
    const me = await telegramCall<{ username: string }>(
      env.TELEGRAM_BOT_TOKEN,
      "getMe"
    );
    const info = await telegramCall<{
      url: string;
      pending_update_count: number;
      last_error_message?: string;
    }>(env.TELEGRAM_BOT_TOKEN, "getWebhookInfo");
    if (!(me.ok && info.ok)) {
      return textResponse("Telegram status unavailable", 502);
    }
    return jsonResponse({
      username: me.result.username,
      registered: info.result.url === expected,
      pending: info.result.pending_update_count,
      lastError: info.result.last_error_message,
    });
  }
  if (url.pathname === "/v1/providers/telegram/webhook") {
    if (request.method !== "POST") {
      return textResponse("Method not allowed", 405);
    }
    if (
      !(await secretMatches(
        request.headers.get("x-telegram-bot-api-secret-token"),
        env.TELEGRAM_WEBHOOK_SECRET
      ))
    ) {
      return textResponse("Forbidden", 403);
    }
    if (
      env.TELEGRAM_INGRESS_ENABLED !== "true" ||
      !env.TELEGRAM_BOT_TOKEN ||
      !env.TELEGRAM_CONVERSATIONS ||
      !env.AGENT_RUNTIME
    ) {
      return textResponse("Telegram ingress unavailable", 503);
    }
    const raw = await readWebhookBody(request);
    if (raw === null) {
      return textResponse("Payload too large", 413);
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return textResponse("Invalid JSON", 400);
    }
    const message = decodeTelegramMessage(value);
    if (!message) {
      return jsonResponse({ accepted: true });
    }
    if (
      !isAllowedTelegramSender(message.sender, env.TELEGRAM_ALLOWED_USER_ID)
    ) {
      return jsonResponse({ accepted: false });
    }
    try {
      const botId = env.TELEGRAM_BOT_TOKEN.split(":")[0];
      await env.TELEGRAM_CONVERSATIONS.getByName(
        `telegram:${botId}:${message.sender}`
      ).enqueue(message);
      return jsonResponse({ accepted: true });
    } catch {
      return textResponse("Telegram temporarily unavailable", 503);
    }
  }
  if (url.pathname !== WEBHOOK_PATH) {
    return null;
  }
  if (request.method === "GET") {
    return handleChallenge(url, env);
  }
  if (request.method === "POST") {
    if (
      env.WHATSAPP_INGRESS_ENABLED === "true" &&
      env.WHATSAPP_CONVERSATIONS &&
      env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_APP_SECRET &&
      env.WHATSAPP_TEST_SENDER &&
      env.WHATSAPP_TEST_EMAIL
    ) {
      const raw = await readWebhookBody(request);
      if (raw === null) {
        return textResponse("Payload too large", 413);
      }
      const verified = await Effect.runPromise(
        verifyWhatsAppSignature(
          env.WHATSAPP_APP_SECRET,
          raw,
          request.headers.get("x-hub-signature-256")
        ).pipe(Effect.match({ onSuccess: () => true, onFailure: () => false }))
      );
      if (!verified) {
        return textResponse("Forbidden", 403);
      }
      const messages = await Effect.runPromise(
        decodeWhatsAppWebhook(env.WHATSAPP_PHONE_NUMBER_ID, raw).pipe(
          Effect.match({ onSuccess: (value) => value, onFailure: () => null })
        )
      );
      if (!messages) {
        return textResponse("Invalid webhook", 400);
      }
      try {
        for (const message of messages) {
          if (message.sender.id !== env.WHATSAPP_TEST_SENDER) {
            continue;
          }
          await env.WHATSAPP_CONVERSATIONS.getByName(
            conversationName(env.WHATSAPP_PHONE_NUMBER_ID, message.sender.id)
          ).enqueue({
            id: message.messageKey,
            sender: message.sender.id,
            text:
              message.text?.trim() ||
              "The user sent an attachment. Explain that this staging test currently supports text only and ask them to type their message.",
          });
        }
        return jsonResponse({ accepted: true });
      } catch {
        return textResponse("Channel temporarily unavailable", 503);
      }
    }
    return new Response(
      JSON.stringify({ error: "Agent ingress is not connected" }),
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
          "retry-after": "300",
          "x-content-type-options": "nosniff",
        },
      }
    );
  }
  return textResponse("Method not allowed", 405);
};
