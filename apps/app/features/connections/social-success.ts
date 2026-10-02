const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  bluesky: "Bluesky",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  threads: "Threads",
  tiktok: "TikTok",
  twitter: "Twitter",
  youtube: "YouTube",
};

const providerName = (provider: string): string =>
  PROVIDER_NAMES[provider.toLowerCase()] ??
  `${provider.charAt(0).toUpperCase()}${provider.slice(1).toLowerCase()}`;

const HANDLE_PROVIDERS = new Set([
  "bluesky",
  "instagram",
  "pinterest",
  "threads",
  "tiktok",
  "twitter",
  "youtube",
]);

export const socialSuccessCopy = (input: {
  readonly provider: string;
  readonly username: string | null;
  readonly client: string | null;
}) => {
  const name = providerName(input.provider);
  const accountLabel = input.username
    ? HANDLE_PROVIDERS.has(input.provider.toLowerCase()) &&
      !input.username.startsWith("@") &&
      !input.username.includes(" ")
      ? `@${input.username}`
      : input.username
    : "Your account";

  return {
    title: `${name} connected`,
    message: `${accountLabel} is now connected and ready to use.`,
    detail:
      input.client === "cli"
        ? "You have successfully authenticated with the Delulu CLI. You can close this window and return to your terminal."
        : undefined,
  };
};

export const socialConnectionProgressCopy = (input: {
  readonly provider: string;
  readonly status: "syncing" | "error";
}) => {
  const name = providerName(input.provider);
  return input.status === "syncing"
    ? {
        title: `Finishing ${name} connection`,
        message:
          "Your authorization succeeded. We’re refreshing Connected Accounts now.",
      }
    : {
        title: `${name} connected, but not visible yet`,
        message:
          "The provider accepted the connection. Refresh Connected Accounts again to finish syncing it.",
      };
};
