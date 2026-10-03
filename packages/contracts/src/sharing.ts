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
  RateLimitedErrorResponse,
  ShareLinkExpiredErrorResponse,
  UnauthorizedErrorResponse,
} from "./errors";
import { Authentication } from "./middleware";

/** Who can open a share link: anyone holding it, or signed-in members only. */
export const ShareAccess = Schema.Literals(["anyone", "workspace"]);

export const ShareLinkView = Schema.Struct({
  id: Schema.String,
  postId: Schema.String,
  token: Schema.String,
  access: ShareAccess,
  expiresAt: Schema.String,
  expired: Schema.Boolean,
  createdAt: Schema.String,
});

export const ShareCommentView = Schema.Struct({
  id: Schema.String,
  authorName: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
});

export const SharedMediaView = Schema.Struct({
  url: Schema.String,
  mediaType: Schema.Literals(["image", "video", "document"]),
  altText: Schema.NullOr(Schema.String),
});

export const SharedChannelView = Schema.Struct({
  targetId: Schema.String,
  platform: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  username: Schema.NullOr(Schema.String),
  profileImage: Schema.NullOr(Schema.String),
  scheduledAt: Schema.NullOr(Schema.String),
  status: Schema.Literals(["pending", "publishing", "published", "failed"]),
  segments: Schema.Array(
    Schema.Struct({
      text: Schema.String,
      media: Schema.Array(SharedMediaView),
    })
  ),
});

/** Everything a share-link visitor sees: always the post's latest content. */
export const SharedPostView = Schema.Struct({
  workspaceName: Schema.String,
  postId: Schema.String,
  postStatus: Schema.String,
  updatedAt: Schema.String,
  access: ShareAccess,
  expiresAt: Schema.String,
  channels: Schema.Array(SharedChannelView),
  comments: Schema.Array(ShareCommentView),
});

const ShareCommentInput = Schema.Struct({
  body: Schema.String.check(
    Schema.isTrimmed(),
    Schema.isMinLength(1),
    Schema.isMaxLength(2000)
  ),
});
const GuestCommentInput = Schema.Struct({
  ...ShareCommentInput.fields,
  authorName: Schema.String.check(
    Schema.isTrimmed(),
    Schema.isMinLength(1),
    Schema.isMaxLength(60)
  ),
});

const PostSharePath = { workspaceId: Schema.String, postId: Schema.String };
const TokenPath = { token: Schema.String };
const shareErrors = [
  NotFoundErrorResponse,
  ForbiddenErrorResponse,
  ConflictErrorResponse,
];
const viewErrors = [
  NotFoundErrorResponse,
  ForbiddenErrorResponse,
  ShareLinkExpiredErrorResponse,
];

/** Workspace members manage a post's share link and read its feedback. */
export const ShareLinksGroup = HttpApiGroup.make("shareLinks")
  .add(
    HttpApiEndpoint.get(
      "get",
      "/v1/workspaces/:workspaceId/posts/:postId/share",
      {
        params: PostSharePath,
        success: Schema.NullOr(ShareLinkView),
        error: shareErrors,
      }
    ),
    HttpApiEndpoint.post(
      "create",
      "/v1/workspaces/:workspaceId/posts/:postId/share",
      {
        params: PostSharePath,
        payload: Schema.Struct({ access: ShareAccess }),
        success: ShareLinkView,
        error: shareErrors,
      }
    ),
    HttpApiEndpoint.patch(
      "update",
      "/v1/workspaces/:workspaceId/posts/:postId/share",
      {
        params: PostSharePath,
        payload: Schema.Struct({
          access: Schema.optional(ShareAccess),
          renew: Schema.optional(Schema.Boolean),
        }),
        success: ShareLinkView,
        error: shareErrors,
      }
    ),
    HttpApiEndpoint.delete(
      "revoke",
      "/v1/workspaces/:workspaceId/posts/:postId/share",
      {
        params: PostSharePath,
        success: Schema.Struct({ revoked: Schema.Boolean }),
        error: shareErrors,
      }
    ),
    HttpApiEndpoint.get(
      "comments",
      "/v1/workspaces/:workspaceId/posts/:postId/share/comments",
      {
        params: PostSharePath,
        success: Schema.Array(ShareCommentView),
        error: shareErrors,
      }
    ),
    // Signed-in visitors: required for members-only links, and lets members
    // comment under their account name.
    HttpApiEndpoint.get("view", "/v1/shares/:token", {
      params: TokenPath,
      success: SharedPostView,
      error: viewErrors,
    }),
    HttpApiEndpoint.post("comment", "/v1/shares/:token/comments", {
      params: TokenPath,
      payload: ShareCommentInput,
      success: ShareCommentView,
      error: [...viewErrors, RateLimitedErrorResponse, ConflictErrorResponse],
    })
  )
  .middleware(Authentication)
  .annotate(OpenApi.Title, "Share links");

/** Anonymous visitors of links shared with "anyone". */
export const PublicSharesGroup = HttpApiGroup.make("publicShares")
  .add(
    HttpApiEndpoint.get("view", "/v1/public/shares/:token", {
      params: TokenPath,
      success: SharedPostView,
      error: [...viewErrors, UnauthorizedErrorResponse],
    }),
    HttpApiEndpoint.post("comment", "/v1/public/shares/:token/comments", {
      params: TokenPath,
      payload: GuestCommentInput,
      success: ShareCommentView,
      error: [
        ...viewErrors,
        UnauthorizedErrorResponse,
        RateLimitedErrorResponse,
        ConflictErrorResponse,
      ],
    })
  )
  .annotate(OpenApi.Title, "Public share links");
