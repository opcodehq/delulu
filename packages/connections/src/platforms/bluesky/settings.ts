import { DEFAULT_BLUESKY_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const blueskySettings: PlatformSettings = {
  defaults: DEFAULT_BLUESKY_SETTINGS,
  requiresConfiguration: false,
  fields: [{ key: "replyDisabled", label: "Disable replies", type: "boolean" }],
};
