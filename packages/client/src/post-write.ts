import { PostWrite } from "@delulu/contracts";
import { MediaId, makeId, PostGroupId } from "@delulu/core";
import { parseTwitterPostId } from "@delulu/core/publishing/twitter";
import { Schema } from "effect";

export interface SimplePostConnection {
  readonly id: string;
  readonly platform: string;
  readonly settings?: (typeof PostWrite.Type)["targets"][number]["settings"];
}

type TargetSettings = (typeof PostWrite.Type)["targets"][number]["settings"];
type TwitterTargetValues = Extract<
  TargetSettings,
  { readonly platform: "TWITTER" }
>["values"];

/** X publishing options shared by the CLI and MCP tools. */
export interface TwitterPostOptions {
  readonly replyRestriction?: TwitterTargetValues["replyRestriction"];
  /** X post URL or numeric ID to quote from the first post. */
  readonly quotePost?: string;
  /** Publishes a native X Article with this title instead of a post. */
  readonly articleTitle?: string;
}

export const hasTwitterPostOptions = (
  options: TwitterPostOptions | undefined
): options is TwitterPostOptions =>
  options !== undefined &&
  Object.values(options).some((value) => value !== undefined);

const isTwitter = (connection: { readonly platform: string }) =>
  connection.platform.toUpperCase() === "TWITTER";

/**
 * Merges X options onto the X targets, keeping any settings they already
 * have. Throws when the options cannot apply to the selected targets.
 */
export const applyTwitterPostOptions = <
  Connection extends SimplePostConnection,
>(
  connections: readonly Connection[],
  options: TwitterPostOptions | undefined
): Connection[] => {
  if (!hasTwitterPostOptions(options)) {
    return [...connections];
  }
  if (!connections.some(isTwitter)) {
    throw new Error("X options need at least one X account target");
  }
  const quote = options.quotePost?.trim();
  if (quote && !parseTwitterPostId(quote)) {
    throw new Error(
      "The quoted post must be an X post ID or https://x.com/.../status/... URL"
    );
  }
  if (options.articleTitle !== undefined && !options.articleTitle.trim()) {
    throw new Error("X Article titles cannot be empty");
  }
  return connections.map((connection) => {
    if (!isTwitter(connection)) {
      return connection;
    }
    const current: TwitterTargetValues =
      connection.settings?.platform === "TWITTER"
        ? connection.settings.values
        : { replyRestriction: "everyone" };
    // Switching to an Article drops post-only settings, as the composer does.
    const base: TwitterTargetValues =
      options.articleTitle === undefined
        ? current
        : { ...current, quoteTweetId: "", replyRestriction: "everyone" };
    const values: TwitterTargetValues = {
      ...base,
      ...(options.replyRestriction === undefined
        ? {}
        : { replyRestriction: options.replyRestriction }),
      ...(options.quotePost === undefined ? {} : { quoteTweetId: quote }),
      ...(options.articleTitle === undefined
        ? {}
        : { format: "article", articleTitle: options.articleTitle.trim() }),
    };
    if (values.format === "article" && values.quoteTweetId) {
      throw new Error("X Articles cannot quote a post");
    }
    if (values.format === "article" && values.replyRestriction !== "everyone") {
      throw new Error("Reply restrictions are only available for X posts");
    }
    return { ...connection, settings: { platform: "TWITTER", values } };
  });
};

export interface SimplePostMedia {
  readonly id: string;
  readonly altText?: string;
  readonly thumbnailMediaId?: string;
  readonly thumbnailTimestamp?: number;
}

export interface SimplePostSegment {
  readonly text: string;
  readonly media?: readonly SimplePostMedia[];
  readonly delayMinutes?: number;
}

export interface ComposerPostConnection extends SimplePostConnection {
  /** Ordered content used only by this connection. Omit to use the default. */
  readonly segments?: readonly SimplePostSegment[];
}

export interface ComposerPostInput {
  readonly segments: readonly SimplePostSegment[];
  readonly connections: readonly ComposerPostConnection[];
  readonly intent?: "draft" | "schedule" | "publish_now";
  readonly idempotencyKey?: string;
  readonly scheduledAt?: string | null;
  readonly source?: "app" | "api" | "automation";
  readonly privacy?: string;
}

export interface SimplePostInput {
  readonly caption: string;
  readonly connections: readonly SimplePostConnection[];
  readonly intent?: "draft" | "schedule" | "publish_now";
  readonly idempotencyKey?: string;
  readonly mediaIds?: readonly string[];
  readonly media?: readonly SimplePostMedia[];
  readonly scheduledAt?: string | null;
  readonly privacy?: string;
}

const settingsFor = (platform: string, privacy?: string) => {
  switch (platform.toUpperCase()) {
    case "BLUESKY":
      return { platform: "BLUESKY", values: {} } as const;
    case "FACEBOOK":
      return {
        platform: "FACEBOOK",
        values: {
          privacy:
            privacy === "FRIENDS" || privacy === "ONLY_ME" ? privacy : "PUBLIC",
        },
      } as const;
    case "FARCASTER":
      return { platform: "FARCASTER", values: {} } as const;
    case "INSTAGRAM":
      return {
        platform: "INSTAGRAM",
        values: {
          shareToFeed: true,
          shareToStory: false,
          trialReels: false,
          graduationStrategy: "MANUAL",
        },
      } as const;
    case "LINKEDIN":
      return {
        platform: "LINKEDIN",
        values: { visibility: privacy === "CONNECTIONS" ? privacy : "PUBLIC" },
      } as const;
    case "PINTEREST":
      return { platform: "PINTEREST", values: {} } as const;
    case "THREADS":
      return {
        platform: "THREADS",
        values: { replyControl: "everyone" },
      } as const;
    case "TIKTOK":
      return {
        platform: "TIKTOK",
        values: {
          privacy:
            privacy === "MUTUAL_FOLLOW_FRIENDS" ||
            privacy === "FOLLOWER_OF_CREATOR" ||
            privacy === "SELF_ONLY"
              ? privacy
              : "PUBLIC_TO_EVERYONE",
          allowComments: true,
          allowDuet: true,
          allowStitch: true,
          promotionContent: "NONE",
        },
      } as const;
    case "TWITTER":
      return {
        platform: "TWITTER",
        values: { replyRestriction: "everyone" },
      } as const;
    case "YOUTUBE":
      return {
        platform: "YOUTUBE",
        values: {
          privacy:
            privacy === "PRIVATE" || privacy === "UNLISTED"
              ? privacy
              : "PUBLIC",
          madeForKids: false,
        },
      } as const;
    default:
      throw new Error(`Unsupported connection platform: ${platform}`);
  }
};

const validateMedia = (segments: readonly SimplePostSegment[]) => {
  const media = segments.flatMap((segment) => segment.media ?? []);
  if (
    media.some(
      (item) =>
        !Schema.is(MediaId)(item.id) ||
        (item.thumbnailMediaId !== undefined &&
          !Schema.is(MediaId)(item.thumbnailMediaId))
    )
  ) {
    throw new Error(
      "Selected media is not ready. Remove it and add it to the post again."
    );
  }
};

const makeGroup = (
  segments: readonly SimplePostSegment[],
  isDefault: boolean
) => ({
  id: makeId(PostGroupId),
  isDefault,
  segments: segments.map((segment) => ({
    text: segment.text,
    media: segment.media ?? [],
    ...(segment.delayMinutes === undefined
      ? {}
      : { delayMinutes: segment.delayMinutes }),
  })),
});

/** Builds a post graph with ordered segments and optional per-target content. */
export const makeComposerPostWrite = (
  input: ComposerPostInput
): typeof PostWrite.Type => {
  const allSegments = [
    ...input.segments,
    ...input.connections.flatMap((connection) => connection.segments ?? []),
  ];
  validateMedia(allSegments);

  const defaultGroup = makeGroup(input.segments, true);
  const customGroups = new Map(
    input.connections.flatMap((connection) =>
      connection.segments === undefined
        ? []
        : [[connection.id, makeGroup(connection.segments, false)] as const]
    )
  );

  return Schema.decodeUnknownSync(PostWrite)({
    groups: [defaultGroup, ...customGroups.values()],
    targets: input.connections.map((connection) => ({
      connectionId: connection.id,
      groupId: customGroups.get(connection.id)?.id ?? defaultGroup.id,
      settings:
        connection.settings ?? settingsFor(connection.platform, input.privacy),
      scheduledAt: input.scheduledAt ?? null,
    })),
    intent: input.intent,
    externalSubmissionId: input.idempotencyKey,
    source: input.source ?? "app",
  });
};

export const makeSimplePostWrite = (
  input: SimplePostInput
): typeof PostWrite.Type => {
  const media: readonly SimplePostMedia[] =
    input.media ?? (input.mediaIds ?? []).map((id) => ({ id }));
  return makeComposerPostWrite({
    segments: [{ text: input.caption, media }],
    connections: input.connections,
    intent: input.intent,
    idempotencyKey: input.idempotencyKey,
    scheduledAt: input.scheduledAt,
    source: "api",
    privacy: input.privacy,
  });
};
