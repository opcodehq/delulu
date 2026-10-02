import { DEFAULT_TIKTOK_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

/**
 * TikTok requires settings (privacy level from the creator API) to be configured
 * before posting — see PLATFORMS_WITH_REQUIRED_SETTINGS in the validators.
 */
export const tiktokSettings: PlatformSettings = {
  defaults: DEFAULT_TIKTOK_SETTINGS,
  requiresConfiguration: true,
  fields: [
    {
      key: "privacy",
      label: "Who can view this video",
      type: "select",
      description:
        "Options are constrained by the creator's TikTok account settings.",
      options: [
        { value: "PUBLIC_TO_EVERYONE", label: "Everyone" },
        { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
        { value: "FOLLOWER_OF_CREATOR", label: "Followers" },
        { value: "SELF_ONLY", label: "Only me" },
      ],
    },
    { key: "allowComments", label: "Allow comments", type: "boolean" },
    { key: "allowDuet", label: "Allow Duet", type: "boolean" },
    { key: "allowStitch", label: "Allow Stitch", type: "boolean" },
    {
      key: "promotionContent",
      label: "Disclose content",
      type: "select",
      options: [
        { value: "NONE", label: "None" },
        { value: "SELF", label: "Your brand" },
        { value: "PAID", label: "Paid partnership" },
        { value: "BOTH", label: "Both" },
      ],
    },
  ],
};
