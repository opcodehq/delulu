import { DEFAULT_YOUTUBE_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const youtubeSettings: PlatformSettings = {
  defaults: DEFAULT_YOUTUBE_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "privacy",
      label: "Privacy",
      type: "select",
      options: [
        { value: "PUBLIC", label: "Public" },
        { value: "UNLISTED", label: "Unlisted" },
        { value: "PRIVATE", label: "Private" },
      ],
    },
    { key: "madeForKids", label: "Made for kids", type: "boolean" },
    { key: "ageRestriction", label: "Age-restrict (18+)", type: "boolean" },
  ],
};
