import type {
  FullPostType,
  SocialProviderType,
  SocialType,
} from "@delulu/core/publishing/post";
import {
  PLATFORM_CHARACTER_LIMITS,
  PLATFORM_MEDIA_RULES,
} from "@/features/publishing/platform-rules";

export interface PublishIssue {
  /** Stable key for rendering. */
  id: string;
  socialType?: SocialType;
  message: string;
}

type Segment = FullPostType["content"][number];

function mediaIssue(socialType: SocialType, segments: Segment[]) {
  const rules = PLATFORM_MEDIA_RULES[socialType];
  const media = segments.flatMap((segment) => segment.media);
  const hasVideo = media.some((item) => item.mediaType === "VIDEO");
  const hasImage = media.some((item) => item.mediaType === "IMAGE");
  if (rules.requiresVideo && !hasVideo) {
    return "Add a video";
  }
  if (rules.requiresImage && !hasImage) {
    return "Add an image";
  }
  if (rules.requiresEither && !(hasVideo || hasImage)) {
    return "Add a video or images";
  }
  return null;
}

/**
 * Lists what still blocks each selected account from publishing, so the
 * composer can explain problems before the API rejects the post. Advisory
 * only: the server stays the source of truth for publish validation.
 */
export function getPublishIssues(
  selected: SocialProviderType[],
  post: Pick<FullPostType, "content" | "alternativeContent">
): PublishIssue[] {
  if (selected.length === 0) {
    return [{ id: "channels", message: "Choose at least one channel" }];
  }

  const issues: PublishIssue[] = [];
  for (const provider of selected) {
    const segments =
      post.alternativeContent.find(
        (item) => item.socialProvider.socialId === provider.socialId
      )?.content ?? post.content;
    const { socialType, socialId, name } = provider;
    const push = (kind: string, message: string) =>
      issues.push({
        id: `${socialId}:${kind}`,
        socialType,
        message: `${name}: ${message}`,
      });

    const media = mediaIssue(socialType, segments);
    if (media) {
      push("media", media);
    } else if (
      segments.every((segment) => !segment.text.trim()) &&
      segments.every((segment) => segment.media.length === 0)
    ) {
      push("empty", "Write something or add media");
    }

    const limit = PLATFORM_CHARACTER_LIMITS[socialType];
    const over = limit
      ? segments.find((segment) => segment.text.length > limit)
      : undefined;
    if (limit && over) {
      push(
        "length",
        `${over.text.length - limit} characters over the ${limit.toLocaleString()} limit`
      );
    }
  }
  return issues;
}
