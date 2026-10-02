import type {
  CalendarEvent,
  EventColor,
} from "@delulu/design-system/components/event-calendar";
import type { SocialPostEventData } from "@delulu/design-system/components/event-calendar/social-post-event";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import type { Post } from "@/shared/backend";

/**
 * Extended calendar event that includes full post data for social media display
 */
export interface SocialCalendarEvent extends CalendarEvent {
  postData: SocialPostEventData;
  post: Post; // Keep reference to full post for editing
}

/**
 * Extract post title from content blocks
 * Takes the first text content as the title, or returns a default
 */
function extractPostTitle(content: Post["content"]): string {
  if (!content || content.length === 0) {
    return "(Untitled post)";
  }

  // Find first block with text
  const firstTextBlock = content.find((block) => block.text?.trim());

  if (firstTextBlock?.text) {
    // Truncate to 50 characters for calendar display
    const title = firstTextBlock.text.trim();
    return title.length > 50 ? `${title.slice(0, 50)}...` : title;
  }

  // Check if there's media in any block
  const hasMedia = content.some(
    (block) => block.media && block.media.length > 0
  );
  if (hasMedia) {
    return "(Media post)";
  }

  return "(Untitled post)";
}

/**
 * Extract content preview (first 80 characters of text)
 */
function extractContentPreview(content: Post["content"]): string | undefined {
  const firstTextBlock = content.find((block) => block.text?.trim());

  if (firstTextBlock?.text) {
    const text = firstTextBlock.text.trim();
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  }

  return undefined;
}

/**
 * Extract first media URL from post content
 */
function extractMediaThumbnail(content: Post["content"]): string | undefined {
  for (const block of content) {
    if (block.media && block.media.length > 0) {
      const firstMedia = block.media[0];
      return firstMedia?.url || firstMedia?.bucketUrl;
    }
  }
  return undefined;
}

/**
 * Get event color based on post status
 */
function getColorByStatus(status: Post["status"]): EventColor {
  switch (status) {
    case "SCHEDULED":
      return "sky";
    case "PROCESSING":
      return "amber";
    case "FAILED":
      return "rose";
    case "PUBLISHED":
      return "emerald";
    case "SAVED":
      return "violet";
    default:
      return "sky";
  }
}

/**
 * Transform a post into a SocialCalendarEvent with full post data.
 */
export function postToCalendarEvent(post: Post): SocialCalendarEvent | null {
  // Only include posts with scheduledAt that are scheduled, processing, or failed
  if (!post.scheduledAt) {
    return null;
  }

  // Only show SCHEDULED, PROCESSING, and FAILED posts on calendar
  if (
    post.status !== "SCHEDULED" &&
    post.status !== "PROCESSING" &&
    post.status !== "FAILED"
  ) {
    return null;
  }

  const startDate = new Date(post.scheduledAt);
  // Default duration: 1 hour for calendar display
  const endDate = new Date(post.scheduledAt + 3_600_000);

  const title = extractPostTitle(post.content);
  const contentPreview = extractContentPreview(post.content);
  const mediaThumbnail = extractMediaThumbnail(post.content);

  // Map social providers to platform data
  const platforms =
    post.socialProviders?.map((provider) => ({
      type: provider.socialType as SupportedSocialPlatform,
      displayName: provider.username || provider.fullName,
    })) || [];

  // Determine status for display
  let status: "scheduled" | "processing" | "failed" = "scheduled";
  if (post.status === "PROCESSING") {
    status = "processing";
  } else if (post.status === "FAILED") {
    status = "failed";
  }

  // Create the post data for social display
  const postData: SocialPostEventData = {
    id: post._id,
    title,
    scheduledTime: startDate,
    platforms,
    contentPreview,
    mediaThumbnail,
    status,
    failureMessage: post.postFailureReason,
  };

  // Create description with social platforms
  const platformNames = platforms.map((p) => p.type).join(", ") || "";

  return {
    id: post._id,
    title,
    description: platformNames || "No platforms selected",
    start: startDate,
    end: endDate,
    allDay: false,
    color: getColorByStatus(post.status),
    postData,
    post,
  };
}

/**
 * Transform an array of Posts to SocialCalendarEvents
 * Filters out posts that shouldn't be shown on the calendar
 */
export function postsToCalendarEvents(posts: Post[]): SocialCalendarEvent[] {
  return posts
    .map(postToCalendarEvent)
    .filter((event): event is SocialCalendarEvent => event !== null);
}

/**
 * Transform a CalendarEvent back to post update data
 * Used when rescheduling posts via drag-and-drop
 */
export function calendarEventToPostUpdate(event: CalendarEvent) {
  return {
    id: event.id,
    scheduledAt: event.start.getTime(),
  };
}
