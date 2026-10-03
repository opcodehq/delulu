import {
  PlatformSettings,
  ReviewActivityType,
  Scope,
  WorkspaceRole,
} from "@delulu/core";
import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";
import {
  ConflictErrorResponse,
  ForbiddenErrorResponse,
  NotFoundErrorResponse,
  ProviderUnavailableErrorResponse,
  ValidationErrorResponse,
} from "./errors";
import { Authentication } from "./middleware";

const WorkspacePath = { workspaceId: Schema.String };
const ResourcePath = { workspaceId: Schema.String, id: Schema.String };
const PageQuery = {
  limit: Schema.optional(Schema.NumberFromString),
  offset: Schema.optional(Schema.NumberFromString),
};
const Page = <A extends Schema.Top>(item: A) =>
  Schema.Struct({
    data: Schema.Array(item),
    total: Schema.Number,
    limit: Schema.Number,
    offset: Schema.Number,
  });

export const MediaRefInput = Schema.Struct({
  id: Schema.String,
  altText: Schema.optional(Schema.String),
  thumbnailMediaId: Schema.optional(Schema.String),
  thumbnailTimestamp: Schema.optional(Schema.Number),
});
export const PostSegmentInput = Schema.Struct({
  text: Schema.String,
  media: Schema.Array(MediaRefInput),
  delayMinutes: Schema.optional(Schema.Number),
});
export const PostGroupInput = Schema.Struct({
  id: Schema.String,
  isDefault: Schema.Boolean,
  segments: Schema.Array(PostSegmentInput),
});
export const PostTargetInput = Schema.Struct({
  connectionId: Schema.String,
  groupId: Schema.String,
  settings: PlatformSettings,
  scheduledAt: Schema.NullOr(Schema.String),
});
export const PostWrite = Schema.Struct({
  groups: Schema.Array(PostGroupInput),
  targets: Schema.Array(PostTargetInput),
  intent: Schema.optional(
    Schema.Literals(["draft", "schedule", "publish_now"])
  ),
  source: Schema.optional(Schema.Literals(["app", "api", "automation"])),
  externalSubmissionId: Schema.optional(Schema.String),
  submitForReview: Schema.optional(Schema.Boolean),
});

export const TargetView = Schema.Struct({
  id: Schema.String,
  connectionId: Schema.String,
  groupId: Schema.String,
  settings: PlatformSettings,
  scheduledAt: Schema.NullOr(Schema.String),
  status: Schema.Literals(["pending", "publishing", "published", "failed"]),
  platformPostId: Schema.NullOr(Schema.String),
  platformPostUrl: Schema.NullOr(Schema.String),
  postedAt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  attempts: Schema.Number,
});
export const PostView = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  status: Schema.Literals([
    "draft",
    "pending_review",
    "changes_requested",
    "scheduled",
    "publishing",
    "published",
    "partially_failed",
    "failed",
  ]),
  groups: Schema.Array(PostGroupInput),
  targets: Schema.Array(TargetView),
  source: Schema.Literals(["app", "api", "automation"]),
  externalSubmissionId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const domainErrors = [
  NotFoundErrorResponse,
  ForbiddenErrorResponse,
  ValidationErrorResponse,
  ConflictErrorResponse,
];

export const PostsGroup = HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: WorkspacePath,
      query: { ...PageQuery, status: Schema.optional(Schema.String) },
      success: Page(PostView),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("create", "/", {
      params: WorkspacePath,
      payload: PostWrite,
      success: PostView,
      error: domainErrors,
    }),
    HttpApiEndpoint.post("publishNow", "/:id/publish", {
      params: ResourcePath,
      success: PostView,
      error: domainErrors,
    }),
    HttpApiEndpoint.post("bulkCreate", "/bulk", {
      params: WorkspacePath,
      payload: Schema.Array(PostWrite),
      success: Schema.Array(
        Schema.Union([
          Schema.Struct({
            index: Schema.Number,
            ok: Schema.Literal(true),
            post: PostView,
          }),
          Schema.Struct({
            index: Schema.Number,
            ok: Schema.Literal(false),
            error: Schema.Struct({
              code: Schema.String,
              message: Schema.String,
            }),
          }),
        ])
      ),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: ResourcePath,
      success: PostView,
      error: domainErrors,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: ResourcePath,
      payload: PostWrite,
      success: PostView,
      error: domainErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: ResourcePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("targets", "/:id/targets", {
      params: ResourcePath,
      success: Schema.Array(TargetView),
      error: domainErrors,
    }),
    HttpApiEndpoint.patch("updateTarget", "/:id/targets/:targetId", {
      params: { ...ResourcePath, targetId: Schema.String },
      payload: Schema.Struct({
        groupId: Schema.optional(Schema.String),
        settings: Schema.optional(PlatformSettings),
        scheduledAt: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: TargetView,
      error: domainErrors,
    }),
    HttpApiEndpoint.post("retryTarget", "/:id/targets/:targetId/retry", {
      params: { ...ResourcePath, targetId: Schema.String },
      success: TargetView,
      error: domainErrors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/posts")
  .annotate(OpenApi.Title, "Posts");

export const ReviewView = Schema.Struct({
  id: Schema.String,
  postId: Schema.String,
  status: Schema.Literals(["pending", "approved", "rejected"]),
  contentFingerprint: Schema.String,
  submittedByMemberId: Schema.String,
  resolvedByMemberId: Schema.NullOr(Schema.String),
  resolvedAt: Schema.NullOr(Schema.String),
});
export const ReviewAction = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("submit"),
    comment: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literal("approve"),
    comment: Schema.optional(Schema.String),
    missedSlot: Schema.optional(Schema.Literals(["publish_now", "reschedule"])),
    scheduledAt: Schema.optional(Schema.String),
  }),
  Schema.Struct({ action: Schema.Literal("reject"), reason: Schema.String }),
  Schema.Struct({ action: Schema.Literal("withdraw") }),
  Schema.Struct({ action: Schema.Literal("comment"), comment: Schema.String }),
]);
export const ReviewsGroup = HttpApiGroup.make("reviews")
  .add(
    HttpApiEndpoint.get("queue", "/", {
      params: WorkspacePath,
      query: PageQuery,
      success: Page(ReviewView),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("getForPost", "/posts/:postId", {
      params: { ...WorkspacePath, postId: Schema.String },
      success: Schema.NullOr(ReviewView),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("act", "/posts/:postId", {
      params: { ...WorkspacePath, postId: Schema.String },
      payload: ReviewAction,
      success: ReviewView,
      error: domainErrors,
    }),
    HttpApiEndpoint.get("activity", "/posts/:postId/activity", {
      params: { ...WorkspacePath, postId: Schema.String },
      success: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          activityType: ReviewActivityType,
          actorMemberId: Schema.String,
          comment: Schema.NullOr(Schema.String),
          createdAt: Schema.String,
        })
      ),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("bulkAct", "/bulk", {
      params: WorkspacePath,
      payload: Schema.Struct({
        postIds: Schema.Array(Schema.String),
        action: Schema.Union([
          Schema.Struct({ action: Schema.Literal("approve") }),
          Schema.Struct({
            action: Schema.Literal("reject"),
            reason: Schema.String,
          }),
        ]),
      }),
      success: Schema.Array(
        Schema.Struct({ postId: Schema.String, ok: Schema.Boolean })
      ),
      error: domainErrors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/reviews")
  .annotate(OpenApi.Title, "Reviews");

export const MediaView = Schema.Struct({
  id: Schema.String,
  bucketKey: Schema.String,
  url: Schema.String,
  mediaType: Schema.Literals(["image", "video", "document"]),
  mimeType: Schema.NullOr(Schema.String),
  sizeBytes: Schema.String,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
  durationSeconds: Schema.NullOr(Schema.Number),
  thumbnails: Schema.Array(Schema.String),
  altText: Schema.NullOr(Schema.String),
  status: Schema.Literals(["pending", "ready", "failed"]),
  createdAt: Schema.String,
});
export const MediaGroups = HttpApiGroup.make("media")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: WorkspacePath,
      query: PageQuery,
      success: Page(MediaView),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: ResourcePath,
      success: MediaView,
      error: domainErrors,
    }),
    HttpApiEndpoint.post("uploads", "/uploads", {
      params: WorkspacePath,
      payload: Schema.Array(
        Schema.Struct({
          filename: Schema.String,
          contentType: Schema.String,
          width: Schema.optional(Schema.Number),
          height: Schema.optional(Schema.Number),
          durationSeconds: Schema.optional(Schema.Number),
          thumbnails: Schema.optional(Schema.Array(Schema.String)),
          altText: Schema.optional(Schema.String),
        })
      ),
      success: Schema.Array(
        Schema.Struct({
          mediaId: Schema.String,
          bucketKey: Schema.String,
          uploadUrl: Schema.String,
        })
      ),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("import", "/imports", {
      params: WorkspacePath,
      payload: Schema.Struct({
        url: Schema.String,
        filename: Schema.optional(Schema.String),
        altText: Schema.optional(Schema.String),
        idempotencyKey: Schema.optional(Schema.String),
      }),
      success: MediaView,
      error: domainErrors,
    }),
    HttpApiEndpoint.post("complete", "/complete", {
      params: WorkspacePath,
      payload: Schema.Array(Schema.Struct({ mediaId: Schema.String })),
      success: Schema.Array(MediaView),
      error: domainErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: ResourcePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: domainErrors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/media")
  .annotate(OpenApi.Title, "Media");

export const ConnectionView = Schema.Struct({
  id: Schema.String,
  platform: Schema.String,
  profileId: Schema.String,
  username: Schema.NullOr(Schema.String),
  displayName: Schema.NullOr(Schema.String),
  profileImage: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  accountType: Schema.optional(
    Schema.NullOr(Schema.Literals(["member", "organization"]))
  ),
});
export const ConnectionMediaItem = Schema.Struct({
  id: Schema.String,
  caption: Schema.NullOr(Schema.String),
  mediaType: Schema.String,
  timestamp: Schema.String,
  permalink: Schema.NullOr(Schema.String),
  thumbnailUrl: Schema.NullOr(Schema.String),
  mediaUrl: Schema.NullOr(Schema.String),
});
export const ConnectionMediaPage = Schema.Struct({
  data: Schema.Array(ConnectionMediaItem),
  nextCursor: Schema.NullOr(Schema.String),
});
export const TikTokCreatorInfoView = Schema.Struct({
  creator_username: Schema.String,
  creator_nickname: Schema.optional(Schema.String),
  creator_avatar_url: Schema.optional(Schema.String),
  privacy_level_options: Schema.Array(Schema.String),
  comment_disabled: Schema.optional(Schema.Boolean),
  duet_disabled: Schema.optional(Schema.Boolean),
  stitch_disabled: Schema.optional(Schema.Boolean),
  max_video_post_duration_sec: Schema.Number,
});
export const ConnectionsGroup = HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: WorkspacePath,
      query: PageQuery,
      success: Page(ConnectionView),
      error: domainErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: ResourcePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("media", "/:id/media", {
      params: ResourcePath,
      query: {
        kind: Schema.Literals(["posts", "stories"]),
        limit: Schema.optional(Schema.NumberFromString),
        after: Schema.optional(Schema.String),
      },
      success: ConnectionMediaPage,
      error: [...domainErrors, ProviderUnavailableErrorResponse],
    }),
    HttpApiEndpoint.get("tiktokCreatorInfo", "/:id/tiktok-creator-info", {
      params: ResourcePath,
      success: TikTokCreatorInfoView,
      error: [...domainErrors, ProviderUnavailableErrorResponse],
    }),
    HttpApiEndpoint.post("mint", "/connect/:platform", {
      params: { ...WorkspacePath, platform: Schema.String },
      payload: Schema.Struct({
        includeInsights: Schema.optional(Schema.Boolean),
        client: Schema.optional(Schema.Literals(["cli", "mcp"])),
        returnTarget: Schema.optional(
          Schema.Literals(["socials", "onboarding-connect"])
        ),
      }),
      success: Schema.Struct({ url: Schema.String, expiresIn: Schema.Number }),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("confirmTransfer", "/:id/transfer", {
      params: ResourcePath,
      payload: Schema.Struct({
        sourceWorkspaceId: Schema.optional(Schema.String),
        transferToken: Schema.optional(Schema.String),
      }),
      success: Schema.Struct({ confirmed: Schema.Boolean }),
      error: domainErrors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/connections")
  .annotate(OpenApi.Title, "Connections");

export const WorkspaceView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.NullOr(Schema.String),
  isPersonal: Schema.Boolean,
  billingOwnerUserId: Schema.String,
  /** Whether post share links may be opened by anyone, not only members. */
  publicShareLinks: Schema.Boolean,
});
export const MemberView = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  email: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  role: WorkspaceRole,
});
export const ApiKeyView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  keyPrefix: Schema.String,
  role: WorkspaceRole,
  scopes: Schema.Array(Scope),
  lastUsedAt: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  revokedAt: Schema.NullOr(Schema.String),
});
export const AdminGroup = HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("workspace", "/", {
      params: WorkspacePath,
      success: WorkspaceView,
      error: domainErrors,
    }),
    HttpApiEndpoint.patch("updateWorkspace", "/", {
      params: WorkspacePath,
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        slug: Schema.optional(Schema.NullOr(Schema.String)),
        publicShareLinks: Schema.optional(Schema.Boolean),
      }),
      success: WorkspaceView,
      error: domainErrors,
    }),
    HttpApiEndpoint.delete("deleteWorkspace", "/", {
      params: WorkspacePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("members", "/members", {
      params: WorkspacePath,
      query: PageQuery,
      success: Page(MemberView),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("inviteMember", "/members", {
      params: WorkspacePath,
      payload: Schema.Struct({ email: Schema.String, role: WorkspaceRole }),
      success: Schema.Struct({
        invitationId: Schema.String,
        email: Schema.String,
        role: WorkspaceRole,
      }),
      error: domainErrors,
    }),
    HttpApiEndpoint.patch("updateMember", "/members/:id", {
      params: ResourcePath,
      payload: Schema.Struct({ role: WorkspaceRole }),
      success: MemberView,
      error: domainErrors,
    }),
    HttpApiEndpoint.delete("removeMember", "/members/:id", {
      params: ResourcePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: domainErrors,
    }),
    HttpApiEndpoint.get("apiKeys", "/api-keys", {
      params: WorkspacePath,
      query: PageQuery,
      success: Page(ApiKeyView),
      error: domainErrors,
    }),
    HttpApiEndpoint.post("createApiKey", "/api-keys", {
      params: WorkspacePath,
      payload: Schema.Struct({
        name: Schema.String,
        role: WorkspaceRole,
        scopes: Schema.Array(Scope),
        expiresAt: Schema.optional(Schema.String),
      }),
      success: Schema.Struct({ key: ApiKeyView, token: Schema.String }),
      error: domainErrors,
    }),
    HttpApiEndpoint.delete("revokeApiKey", "/api-keys/:id", {
      params: ResourcePath,
      success: Schema.Struct({ revoked: Schema.Boolean }),
      error: domainErrors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId")
  .annotate(OpenApi.Title, "Workspace administration");
