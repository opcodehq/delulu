import { DEFAULT_FACEBOOK_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const facebookSettings: PlatformSettings = {
  defaults: DEFAULT_FACEBOOK_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "privacy",
      label: "Audience",
      type: "select",
      options: [
        { value: "PUBLIC", label: "Public" },
        { value: "FRIENDS", label: "Friends" },
        { value: "ONLY_ME", label: "Only me" },
      ],
    },
  ],
};
