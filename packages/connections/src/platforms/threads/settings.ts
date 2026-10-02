import { DEFAULT_THREADS_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const threadsSettings: PlatformSettings = {
  defaults: DEFAULT_THREADS_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "replyControl",
      label: "Who can reply",
      type: "select",
      options: [
        { value: "everyone", label: "Everyone" },
        { value: "following", label: "Profiles you follow" },
        { value: "mentioned", label: "Mentioned only" },
      ],
    },
  ],
};
