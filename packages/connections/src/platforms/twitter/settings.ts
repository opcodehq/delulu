import { DEFAULT_TWITTER_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const twitterSettings: PlatformSettings = {
  defaults: DEFAULT_TWITTER_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "replyRestriction",
      label: "Who can reply",
      type: "select",
      options: [
        { value: "everyone", label: "Everyone" },
        { value: "following", label: "Accounts you follow" },
        { value: "mentioned", label: "Only accounts you mention" },
      ],
    },
  ],
};
