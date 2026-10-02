import { DEFAULT_PINTEREST_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const pinterestSettings: PlatformSettings = {
  defaults: DEFAULT_PINTEREST_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "boardId",
      label: "Board",
      type: "text",
      description: "Board to pin to; defaults to your first board.",
    },
  ],
};
