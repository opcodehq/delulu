import type { SocialAvatarItem } from "@delulu/design-system/components/ui/social-avatar-stack";
import { formatDistanceToNow } from "date-fns";
import {
  normalizePlatform,
  platformLabel,
} from "@/features/publishing/social-platform";
import type { ConnectionView, PostView } from "@/shared/workspace-views";

/** First non-empty segment of text across all groups. */
export function getPostExcerpt(post: PostView): string {
  const text = post.groups
    .flatMap((group) => group.segments)
    .find((segment) => segment.text.trim())?.text;
  return text?.trim() || "Untitled post";
}

/** First media reference id (for a preview thumbnail), if any. */
export function getPostFirstMediaId(post: PostView): string | undefined {
  for (const group of post.groups) {
    for (const segment of group.segments) {
      if (segment.media.length > 0) {
        return segment.media[0]?.id;
      }
    }
  }
  return undefined;
}

/** Earliest scheduled time across targets, if any. */
export function getPostScheduledAt(post: PostView): string | null {
  const times = post.targets
    .map((target) => target.scheduledAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return times[0] ?? null;
}

/** Latest posted time across targets, if any. */
export function getPostPublishedAt(post: PostView): string | null {
  const times = post.targets
    .map((target) => target.postedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return times.at(-1) ?? null;
}

/**
 * Avatar stack items derived from a post's targets joined against the workspace
 * connections. Unknown connections render as muted fallbacks so a post never
 * loses its logos when a connection was removed.
 */
export function getPostAvatarItems(
  post: PostView,
  connections: Map<string, ConnectionView>
): SocialAvatarItem[] {
  return post.targets.map((target): SocialAvatarItem => {
    const connection = connections.get(target.connectionId);
    const platform = normalizePlatform(connection?.platform);
    if (!platform) {
      return { platform: "TWITTER", label: "Account", muted: true };
    }
    return {
      platform,
      label: platformLabel(platform, connection?.username),
      muted: false,
    };
  });
}

/** Human relative time, e.g. "3 hours ago". */
export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/** Contextual meta line under a post's excerpt. */
export function getPostTimeLabel(post: PostView): string {
  if (post.status === "scheduled") {
    const scheduledAt = getPostScheduledAt(post);
    return scheduledAt
      ? `Scheduled ${new Date(scheduledAt).toLocaleString()}`
      : "Scheduled";
  }
  if (post.status === "published" || post.status === "partially_failed") {
    const publishedAt = getPostPublishedAt(post);
    if (publishedAt) {
      return `Published ${relativeTime(publishedAt)}`;
    }
  }
  return `Updated ${relativeTime(post.updatedAt)}`;
}
