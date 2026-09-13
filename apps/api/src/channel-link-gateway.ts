import { ConflictError } from "@delulu/contracts";
import { ChannelLinkGateway } from "@delulu/services";
import { Effect, Layer } from "effect";
import type { Env } from "./env";

export const channelLinkGatewayLayer = (env: Env) =>
  Layer.succeed(ChannelLinkGateway, {
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
