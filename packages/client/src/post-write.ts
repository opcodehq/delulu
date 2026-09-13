import { PostWrite } from "@delulu/contracts";
import { MediaId, makeId, PostGroupId } from "@delulu/core";
import { Schema } from "effect";

export interface SimplePostConnection {
  readonly id: string;
  readonly platform: string;
  readonly settings?: (typeof PostWrite.Type)["targets"][number]["settings"];
}

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
