import { DEFAULT_FARCASTER_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const farcasterSettings: PlatformSettings = {
  defaults: DEFAULT_FARCASTER_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "channelId",
      label: "Channel",
      type: "text",
      description: "Optional channel to cast into (blank = home feed).",
    },
  ],
};
