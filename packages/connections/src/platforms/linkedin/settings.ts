import { DEFAULT_LINKEDIN_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const linkedinSettings: PlatformSettings = {
  defaults: DEFAULT_LINKEDIN_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "visibility",
      label: "Visibility",
      type: "select",
      options: [
        { value: "PUBLIC", label: "Anyone" },
        { value: "CONNECTIONS", label: "Connections only" },
      ],
    },
  ],
};
