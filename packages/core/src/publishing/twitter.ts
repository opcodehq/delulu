import { z } from "zod";

const POST_ID = /^[1-9]\d{0,19}$/;
const POST_PATH =
  /^\/(?:[A-Za-z0-9_]+\/status|i\/web\/status|i\/status)\/([1-9]\d{0,19})\/?$/;
const POST_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

/** Keep snowflake IDs as strings, including when pasted from an X post URL. */
export function parseTwitterPostId(value: string): string | undefined {
  const input = value.trim();
  if (POST_ID.test(input)) {
    return input;
  }
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      !POST_HOSTS.has(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return POST_PATH.exec(url.pathname)?.[1];
  } catch {
    return undefined;
  }
}

export const twitterSettingsSchema = z.object({
  replyRestriction: z.enum(["everyone", "following", "mentioned"]),
  format: z.enum(["post", "article"]).optional(),
  quoteTweetId: z
    .string()
    .refine(
      (value) => !value.trim() || Boolean(parseTwitterPostId(value)),
      "Enter an X post ID or https://x.com/.../status/... URL"
    )
    .optional(),
  articleTitle: z.string().max(100).optional(),
});
export type TwitterSettings = z.infer<typeof twitterSettingsSchema>;

/** Shared by composer, service validation and the provider boundary. */
export function validateTwitterContent(
  settings: TwitterSettings,
  segments: readonly {
    readonly text: string;
    readonly media?: readonly {
      readonly id?: string;
      readonly mediaType?: string;
    }[];
  }[]
): string[] {
  const errors: string[] = [];
  if (
    settings.quoteTweetId?.trim() &&
    !parseTwitterPostId(settings.quoteTweetId)
  ) {
    errors.push("Enter a valid X post ID or post URL to quote");
  }
  if (settings.format === "article") {
    if (!settings.articleTitle?.trim()) {
      errors.push("Add a title for your X Article");
    }
    if ((settings.articleTitle?.length ?? 0) > 100) {
      errors.push("X Article titles must be 100 characters or fewer");
    }
    if (segments.length !== 1) {
      errors.push("X Articles need one content segment, not a thread");
    }
    if (!segments[0]?.text.trim()) {
      errors.push("Add a body for your X Article");
    }
    if (settings.quoteTweetId?.trim()) {
      errors.push("X Articles cannot quote a post");
    }
    if (
      segments.some(
        (segment) =>
          (segment.media?.length ?? 0) > 1 ||
          segment.media?.some(
            (media) =>
              media.mediaType !== undefined && media.mediaType !== "IMAGE"
          )
      )
    ) {
      errors.push("X Articles support one optional cover image");
    }
    if (settings.replyRestriction !== "everyone") {
      errors.push("Reply restrictions are only available for X posts");
    }
  }
  return errors;
}
