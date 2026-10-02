import { DEFAULT_INSTAGRAM_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

/**
 * Instagram per-post settings. `defaults` seeds the values; `fields` describes
 * the controls the user can change. Chosen values flow back through
 * `content.providerSettings` (validated by `instagramSettingsSchema` in
 * @delulu/core/publishing at the publish boundary).
 */
export const instagramSettings: PlatformSettings = {
  defaults: DEFAULT_INSTAGRAM_SETTINGS,
  requiresConfiguration: false,
  fields: [
    { key: "shareToFeed", label: "Share to feed", type: "boolean" },
    { key: "shareToStory", label: "Share to story", type: "boolean" },
    {
      key: "trialReels",
      label: "Post as trial reel",
      type: "boolean",
      description: "Publish to non-followers first, then graduate.",
    },
    {
      key: "graduationStrategy",
      label: "Graduation strategy",
      type: "select",
      options: [
        { value: "MANUAL", label: "Manual" },
        { value: "SS_PERFORMANCE", label: "Auto (by performance)" },
      ],
    },
  ],
};
