import { ConflictError } from "@delulu/contracts";
import { ChannelLinkGateway } from "@delulu/services";
import { Effect, Layer } from "effect";
import type { Env } from "./env";

export const channelLinkGatewayLayer = (env: Env) =>
  Layer.succeed(ChannelLinkGateway, {
    environment: env.ENVIRONMENT ?? "production",
    botId: env.TELEGRAM_BOT_TOKEN?.split(":")[0] ?? "",
    manage: (input) =>
      Effect.tryPromise({
        try: async () => {
          if (!(env.TELEGRAM_LINKED_CONVERSATIONS && env.TELEGRAM_BOT_TOKEN)) {
            throw new Error("Unavailable");
          }
          await env.TELEGRAM_LINKED_CONVERSATIONS.getByName(
            `telegram-linked:${env.TELEGRAM_BOT_TOKEN.split(":")[0]}:${input.sender}`
          ).manageConnection(input);
        },
        catch: () =>
          new ConflictError({
            message:
              "Connection could not be updated. Stop any active task and retry.",
            resource: "agent-channel",
          }),
      }),
    offer: (input) =>
      Effect.tryPromise({
        try: async () => {
          if (
            env.TELEGRAM_ACCOUNT_LINKING_ENABLED !== "true" ||
            !env.TELEGRAM_BOT_TOKEN ||
            !env.TELEGRAM_LINKED_CONVERSATIONS
          ) {
            throw new Error("Unavailable");
          }
          const sender = input.challenge.split(".")[0]!;
          const target = env.TELEGRAM_LINKED_CONVERSATIONS.getByName(
            `telegram-linked:${env.TELEGRAM_BOT_TOKEN.split(":")[0]}:${sender}`
          );
          if (!target.offerLink) {
            throw new Error("Unavailable");
          }
          await target.offerLink(input);
        },
        catch: () =>
          new ConflictError({
            message:
              "Connection link expired or unavailable. Request a new link in Telegram.",
            resource: "agent-channel",
          }),
      }),
  });
