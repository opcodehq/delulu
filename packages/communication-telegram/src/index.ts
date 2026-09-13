const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;
/** Never expose request URLs containing tokens in errors. */
export async function telegramCall<T>(
  token: string,
  method:
    | "sendMessage"
    | "sendChatAction"
    | "setWebhook"
    | "getWebhookInfo"
    | "getMe",
  body: Record<string, unknown> = {},
  timeoutMs = 15_000
): Promise<
  { ok: true; result: T } | { ok: false; status: number; retryAfterMs?: number }
> {
  if (!BOT_TOKEN_PATTERN.test(token)) {
    return { ok: false, status: 401 };
  }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    const data = (await response.json()) as {
      ok?: boolean;
      result: T;
      error_code?: number;
      parameters?: { retry_after?: number };
    };
    if (!response.ok || data.ok !== true) {
      return {
        ok: false,
        ...(typeof data.parameters?.retry_after === "number" &&
        Number.isFinite(data.parameters.retry_after) &&
        data.parameters.retry_after >= 0
          ? { retryAfterMs: Math.ceil(data.parameters.retry_after * 1000) }
          : {}),
        status:
          response.status === 200 ? (data.error_code ?? 502) : response.status,
      };
    }
    return { ok: true, result: data.result };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function decodeTelegramMessage(
  value: unknown
): { id: string; sender: string; text: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const update = value as {
    update_id?: unknown;
    message?: {
      text?: unknown;
      from?: { id?: unknown; is_bot?: unknown };
      chat?: { id?: unknown; type?: unknown };
    };
  };
  const message = update.message;
  if (
    !(Number.isSafeInteger(update.update_id) && message) ||
    typeof message.text !== "string" ||
    !message.text.trim() ||
    message.text.length > 4096 ||
    message.chat?.type !== "private" ||
    message.from?.is_bot !== false ||
    !Number.isSafeInteger(message.from.id) ||
    Number(message.from.id) <= 0 ||
    message.chat.id !== message.from.id
  ) {
    return null;
  }
  return {
    id: String(update.update_id),
    sender: String(message.from.id),
    text: message.text,
  };
}

export async function secretMatches(
  actual: string | null,
  expected: string | undefined
): Promise<boolean> {
  if (!(actual && expected)) {
    return false;
  }
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [actual, expected].map((value) =>
      crypto.subtle.digest("SHA-256", encoder.encode(value))
    )
  );
  const left = new Uint8Array(a!);
  const right = new Uint8Array(b!);
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference += Math.abs(left[i]! - right[i]!);
  }
  return difference === 0;
}
