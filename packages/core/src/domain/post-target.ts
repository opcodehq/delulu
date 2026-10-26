import { Effect, Schema } from "effect";
import { Model } from "effect/unstable/schema";
import { ConnectionId, PostGroupId, PostId, PostTargetId } from "../kernel/ids";
import { parseTwitterPostId } from "../publishing/twitter";
import {
  domainErrorFields,
  entityFields,
  JsonColumn,
  JsonObject,
  repository,
} from "./shared";

export const TargetStatus = Schema.Literals([
  "pending",
  "publishing",
  "published",
  "failed",
]);
export type TargetStatus = typeof TargetStatus.Type;
const settings = <Platform extends string, Values extends Schema.Top>(
  platform: Platform,
  values: Values
) => Schema.Struct({ platform: Schema.Literal(platform), values });
export const PlatformSettings = Schema.Union([
  settings(
    "BLUESKY",
    Schema.Struct({ replyDisabled: Schema.optional(Schema.Boolean) })
  ),
  settings(
    "FACEBOOK",
    Schema.Struct({
      privacy: Schema.Literals(["PUBLIC", "FRIENDS", "ONLY_ME"]),
    })
  ),
  settings(
    "FARCASTER",
    Schema.Struct({ channelId: Schema.optional(Schema.String) })
  ),
  settings(
    "INSTAGRAM",
    Schema.Struct({
      shareToFeed: Schema.Boolean,
      shareToStory: Schema.Boolean,
      trialReels: Schema.Boolean,
      graduationStrategy: Schema.Literals(["MANUAL", "SS_PERFORMANCE"]),
    })
  ),
  settings(
    "LINKEDIN",
    Schema.Struct({ visibility: Schema.Literals(["PUBLIC", "CONNECTIONS"]) })
  ),
  settings(
    "PINTEREST",
    Schema.Struct({ boardId: Schema.optional(Schema.String) })
  ),
  settings(
    "THREADS",
    Schema.Struct({
      replyControl: Schema.Literals(["everyone", "following", "mentioned"]),
    })
  ),
  settings(
    "TIKTOK",
    Schema.Struct({
      privacy: Schema.Literals([
        "PUBLIC_TO_EVERYONE",
        "MUTUAL_FOLLOW_FRIENDS",
        "FOLLOWER_OF_CREATOR",
        "SELF_ONLY",
      ]),
      allowComments: Schema.Boolean,
      allowDuet: Schema.Boolean,
      allowStitch: Schema.Boolean,
      promotionContent: Schema.Literals(["NONE", "SELF", "PAID", "BOTH"]),
    })
  ),
  settings(
    "TWITTER",
    Schema.Struct({
      replyRestriction: Schema.Literals(["everyone", "following", "mentioned"]),
      format: Schema.optional(Schema.Literals(["post", "article"])),
      quoteTweetId: Schema.optional(
        Schema.String.check(
          Schema.makeFilter(
            (value) =>
              !value.trim() ||
              Boolean(parseTwitterPostId(value)) ||
              "Enter a valid X post ID or post URL"
          )
        )
      ),
      articleTitle: Schema.optional(
        Schema.String.check(Schema.isMaxLength(100))
      ),
    })
  ),
  settings(
    "YOUTUBE",
    Schema.Struct({
      privacy: Schema.Literals(["PUBLIC", "PRIVATE", "UNLISTED"]),
      madeForKids: Schema.Boolean,
      ageRestriction: Schema.optional(Schema.Boolean),
    })
  ),
]);
export class PostTarget extends Model.Class<PostTarget>("PostTarget")({
  ...entityFields(PostTargetId),
  postId: PostId,
  connectionId: ConnectionId,
  groupId: PostGroupId,
  settings: JsonColumn(PlatformSettings),
  providerState: JsonObject,
  scheduledAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  status: TargetStatus,
  platformPostId: Schema.NullOr(Schema.String),
  platformPostUrl: Schema.NullOr(Schema.String),
  postedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  error: Schema.NullOr(Schema.String),
  attempts: Schema.Number,
}) {}
export class PostTargetError extends Schema.TaggedErrorClass<PostTargetError>()(
  "PostTargetError",
  domainErrorFields
) {}
export const makePostTargetRepository = Effect.fn("makePostTargetRepository")(
  () => repository(PostTarget, "id", "post_targets", "PostTargetRepository")
);
