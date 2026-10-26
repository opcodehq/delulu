import {
  ChatGPTConnection,
  ChatGPTModels,
  ConflictError,
} from "@delulu/contracts";
import { Context, Effect, Layer, Schema } from "effect";

export interface CodexRuntimeConfig {
  readonly enabled: boolean;
  readonly url?: string;
  readonly secret?: string;
}
export const disabledChatGPTConnection = {
  enabled: false,
  state: "disconnected" as const,
  selected: false,
  generation: "disabled",
  model: null,
  account: null,
  plan: null,
  login: null,
  limits: null,
  error: null,
};

/** Internal transport only: caller must derive userId from verified identity. */
export async function codexRequest(
  config: CodexRuntimeConfig,
  userId: string,
  operation: string,
  input: unknown = {}
): Promise<unknown> {
  const cleanup = ["peek", "disconnect", "cancelLogin", "interrupt"].includes(
    operation
  );
  if (!((config.enabled || cleanup) && config.url && config.secret)) {
    throw new Error("ChatGPT connection is not available");
  }
  const url = new URL("/rpc", config.url);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "codex-runtime"].includes(url.hostname)
    )
  ) {
    throw new Error("Codex runner requires HTTPS");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ userId, operation, input }),
    signal: AbortSignal.timeout(25_000),
    redirect: "error",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const messages = new Set([
      "ChatGPT usage limit reached. Wait for your allowance to reset.",
      "Another ChatGPT task is active. Finish or stop it first.",
      "Reconnect ChatGPT to continue.",
      "Agent capacity reached. Try again shortly.",
    ]);
    const detail =
      body && typeof body === "object" && "error" in body
        ? body.error
        : undefined;
    throw new Error(
      typeof detail === "string" && messages.has(detail)
        ? detail
        : "ChatGPT request unavailable. Check your connection or try again."
    );
  }
  return response.json();
}
export class ChatGPTService extends Context.Service<
  ChatGPTService,
  {
    readonly config: CodexRuntimeConfig;
  }
>()("@delulu/services/ChatGPTService") {
  static layer(config: CodexRuntimeConfig) {
    return Layer.succeed(ChatGPTService, { config });
  }
}
export const chatGPTRequest = Effect.fn("chatGPTRequest")(function* (
  userId: string,
  operation: string,
  input?: unknown
) {
  const { config } = yield* ChatGPTService;
  if (operation === "status" && !config.enabled && !config.url) {
    return disabledChatGPTConnection;
  }
  return yield* Effect.tryPromise({
    try: async () => {
      if (operation === "status" && !config.enabled) {
        const value = await codexRequest(config, userId, "peek");
        return {
          ...Schema.decodeUnknownSync(ChatGPTConnection)(value),
          enabled: false,
        };
      }
      return codexRequest(config, userId, operation, input);
    },
    catch: (error) =>
      new ConflictError({
        resource: "chatgpt",
        message: error instanceof Error ? error.message : "ChatGPT unavailable",
      }),
  });
});
export const chatGPTStatus = Effect.fn("chatGPTStatus")(function* (
  userId: string,
  start = false
) {
  const value = yield* chatGPTRequest(userId, start ? "login" : "status");
  return yield* Schema.decodeUnknownEffect(ChatGPTConnection)(value).pipe(
    Effect.mapError(
      () =>
        new ConflictError({
          resource: "chatgpt",
          message: "Invalid ChatGPT connection response",
        })
    )
  );
});
export const chatGPTModels = Effect.fn("chatGPTModels")(function* (
  userId: string
) {
  return yield* Schema.decodeUnknownEffect(ChatGPTModels)(
    yield* chatGPTRequest(userId, "models")
  ).pipe(
    Effect.mapError(
      () =>
        new ConflictError({
          resource: "chatgpt",
          message: "Invalid model response",
        })
    )
  );
});
