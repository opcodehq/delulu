import { DEFAULT_TWITTER_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { PlatformSettings } from "../../types";

export const twitterSettings: PlatformSettings = {
  defaults: DEFAULT_TWITTER_SETTINGS,
  requiresConfiguration: false,
  fields: [
    {
      key: "format",
      label: "Format",
      type: "select",
      options: [
        { value: "post", label: "Post or thread" },
        { value: "article", label: "Article" },
      ],
    },
    {
      key: "quoteTweetId",
      label: "Post to quote",
      type: "text",
      description:
        "An X post ID or URL. Only the first post in a thread quotes it.",
    },
    { key: "articleTitle", label: "Article title", type: "text" },
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
