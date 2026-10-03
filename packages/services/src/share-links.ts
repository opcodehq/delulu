import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ShareAccess,
  type ShareCommentView,
  type SharedPostView,
  ShareLinkExpiredError,
  type ShareLinkView,
  UnauthorizedError,
} from "@delulu/contracts";
import {
  makeId,
  PostShareCommentId,
  PostShareLinkId,
  TokenCipher,
  type WorkspaceId,
} from "@delulu/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomTokenBase64Url, sha256Hex } from "./crypto";
import { PostService } from "./posts";

/** Feedback kept per post; bounds storage from a link that's been shared widely. */
export const MAX_SHARE_COMMENTS_PER_POST = 500;

/** Share links stay valid for a week from creation or their last renewal. */
export const SHARE_LINK_TTL_DAYS = 7;
const SHARE_LINK_TTL_MS = SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000;

type ShareLinkOutput = typeof ShareLinkView.Type;
type ShareCommentOutput = typeof ShareCommentView.Type;
type SharedPostOutput = typeof SharedPostView.Type;
type Access = typeof ShareAccess.Type;
/**
 * The signed-in visitor, or `null` for anonymous public traffic. `authorize`
 * applies the caller's normal workspace access rules (scopes, API-key binding)
 * before a members-only link is honoured.
 */
export type ShareViewer = {
  readonly userId: string;
  readonly authorize: (
    workspaceId: WorkspaceId
  ) => Effect.Effect<void, unknown>;
} | null;
type ViewError =
  | NotFoundError
  | ShareLinkExpiredError
  | UnauthorizedError
  | ForbiddenError;

const iso = (value: unknown) => new Date(value as Date | string).toISOString();
const nullableString = (value: unknown) =>
  value === null || value === undefined ? null : String(value);
const commentOutput = (row: Record<string, unknown>): ShareCommentOutput => ({
  id: String(row.id),
  authorName: String(row.authorName),
  body: String(row.body),
  createdAt: iso(row.createdAt),
});
const hashToken = (token: string) => Effect.promise(() => sha256Hex(token));
/** Workspace admins can turn off public links; those links then act members-only. */
const effectiveAccess = (stored: unknown, publicAllowed: unknown): Access =>
  publicAllowed === false ? "workspace" : (stored as Access);
const publicLinksDisabled = () =>
  new ForbiddenError({
    message:
      "A workspace admin turned off public links. Share with workspace members instead.",
  });
const linkNotFound = () =>
  new NotFoundError({
    message: "This share link doesn't exist or was turned off",
    resource: "share_link",
  });

export class ShareLinkService extends Context.Service<
  ShareLinkService,
  {
    readonly get: (
      workspaceId: WorkspaceId,
      postId: string
    ) => Effect.Effect<ShareLinkOutput | null>;
    readonly create: (input: {
      readonly workspaceId: WorkspaceId;
      readonly postId: string;
      readonly memberId: string;
      readonly access: Access;
    }) => Effect.Effect<
      ShareLinkOutput,
      NotFoundError | ForbiddenError | ConflictError
    >;
    readonly update: (input: {
      readonly workspaceId: WorkspaceId;
      readonly postId: string;
      readonly access?: Access;
      readonly renew?: boolean;
    }) => Effect.Effect<ShareLinkOutput, NotFoundError | ForbiddenError>;
    readonly revoke: (
      workspaceId: WorkspaceId,
      postId: string
    ) => Effect.Effect<{ revoked: boolean }>;
    readonly comments: (
      workspaceId: WorkspaceId,
      postId: string
    ) => Effect.Effect<readonly ShareCommentOutput[]>;
    readonly view: (
      token: string,
      viewer: ShareViewer
    ) => Effect.Effect<SharedPostOutput, ViewError>;
    readonly comment: (input: {
      readonly token: string;
      readonly viewer: ShareViewer;
      readonly authorName?: string;
      readonly body: string;
    }) => Effect.Effect<ShareCommentOutput, ViewError | ConflictError>;
  }
>()("@delulu/services/ShareLinkService") {
  static readonly layer = Layer.effect(
    ShareLinkService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const cipher = yield* TokenCipher;
      const posts = yield* PostService;

      const linkOutput = Effect.fn("ShareLinkService.linkOutput")(function* (
        row: Record<string, unknown>
      ) {
        const token = yield* cipher
          .decrypt({
            ciphertext: String(row.tokenCiphertext),
            cipherVersion: "v1",
          })
          .pipe(Effect.orDie);
        const expiresAt = iso(row.expiresAt);
        return {
          id: String(row.id),
          postId: String(row.postId),
          token,
          access: effectiveAccess(row.access, row.publicShareLinks),
          expiresAt,
          expired: Date.parse(expiresAt) <= Date.now(),
          createdAt: iso(row.createdAt),
        } satisfies ShareLinkOutput;
      });

      const findActive = (workspaceId: WorkspaceId, postId: string) =>
        sql<
          Record<string, unknown>
        >`SELECT l.id, l.post_id, l.token_ciphertext, l.access, l.expires_at,
            l.created_at, w.public_share_links
          FROM post_share_links l JOIN workspaces w ON w.id = l.workspace_id
          WHERE l.workspace_id = ${workspaceId} AND l.post_id = ${postId}
            AND l.revoked_at IS NULL`.pipe(
          Effect.orDie,
          Effect.map((rows) => rows[0])
        );

      const requirePublicAllowed = Effect.fn(
        "ShareLinkService.requirePublicAllowed"
      )(function* (workspaceId: WorkspaceId) {
        const rows = yield* sql<{
          publicShareLinks: boolean;
        }>`SELECT public_share_links FROM workspaces WHERE id = ${workspaceId}`.pipe(
          Effect.orDie
        );
        if (rows[0]?.publicShareLinks === false) {
          return yield* publicLinksDisabled();
        }
      });

      const get = Effect.fn("ShareLinkService.get")(function* (
        workspaceId: WorkspaceId,
        postId: string
      ) {
        const row = yield* findActive(workspaceId, postId);
        return row ? yield* linkOutput(row) : null;
      });

      const create = Effect.fn("ShareLinkService.create")(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly postId: string;
        readonly memberId: string;
        readonly access: Access;
      }) {
        // Fails with NotFoundError for deleted or foreign posts.
        yield* posts.get(input.workspaceId, input.postId);
        if (input.access === "anyone") {
          yield* requirePublicAllowed(input.workspaceId);
        }
        const token = randomTokenBase64Url(32);
        const encrypted = yield* cipher.encrypt(token).pipe(Effect.orDie);
        const tokenHash = yield* hashToken(token);
        // One active link per post: a concurrent create keeps the first link.
        const id = makeId(PostShareLinkId);
        yield* sql`INSERT INTO post_share_links
          (id, workspace_id, post_id, token_hash, token_ciphertext, cipher_version,
           access, created_by_member_id, expires_at)
          VALUES (${id}, ${input.workspaceId}, ${input.postId},
            ${tokenHash}, ${encrypted.ciphertext}, ${encrypted.cipherVersion},
            ${input.access}, ${input.memberId},
            ${new Date(Date.now() + SHARE_LINK_TTL_MS)})
          ON CONFLICT (post_id) WHERE revoked_at IS NULL DO NOTHING`.pipe(
          Effect.orDie
        );
        const row = yield* findActive(input.workspaceId, input.postId);
        if (!row) {
          return yield* Effect.die(new Error("Share link was not persisted"));
        }
        const link = yield* linkOutput(row);
        // Someone else's link won the race. Returning it silently could hand
        // out a public URL to a caller who asked for members-only, or an
        // expired one, so make the client reload and show the real link.
        if (link.id !== id && (link.access !== input.access || link.expired)) {
          return yield* new ConflictError({
            message:
              "This post already has a share link. Reload to see its settings.",
            resource: "share_link",
          });
        }
        return link;
      });

      const update = Effect.fn("ShareLinkService.update")(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly postId: string;
        readonly access?: Access;
        readonly renew?: boolean;
      }) {
        if (input.access === "anyone") {
          yield* requirePublicAllowed(input.workspaceId);
        }
        const rows = yield* sql<
          Record<string, unknown>
        >`UPDATE post_share_links SET
            access = COALESCE(${input.access ?? null}, access),
            expires_at = CASE WHEN ${input.renew === true}
              THEN ${new Date(Date.now() + SHARE_LINK_TTL_MS)} ELSE expires_at END,
            updated_at = now()
          WHERE workspace_id = ${input.workspaceId} AND post_id = ${input.postId}
            AND revoked_at IS NULL
          RETURNING id`.pipe(Effect.orDie);
        const row = rows[0]
          ? yield* findActive(input.workspaceId, input.postId)
          : undefined;
        if (!row) {
          return yield* linkNotFound();
        }
        return yield* linkOutput(row);
      });

      const revoke = Effect.fn("ShareLinkService.revoke")(function* (
        workspaceId: WorkspaceId,
        postId: string
      ) {
        const rows =
          yield* sql`UPDATE post_share_links SET revoked_at = now(), updated_at = now()
          WHERE workspace_id = ${workspaceId} AND post_id = ${postId} AND revoked_at IS NULL
          RETURNING id`.pipe(Effect.orDie);
        return { revoked: rows.length > 0 };
      });

      const comments = Effect.fn("ShareLinkService.comments")(function* (
        workspaceId: WorkspaceId,
        postId: string
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT id, author_name, body, created_at FROM post_share_comments
          WHERE workspace_id = ${workspaceId} AND post_id = ${postId}
          ORDER BY created_at`.pipe(Effect.orDie);
        return rows.map(commentOutput);
      });

      /** Resolve a token to its live link and enforce expiry and access. */
      const resolve = Effect.fn("ShareLinkService.resolve")(function* (
        token: string,
        viewer: ShareViewer
      ) {
        const tokenHash = yield* hashToken(token);
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT l.id, l.workspace_id,
            l.post_id, l.access, l.expires_at, l.revoked_at, w.name AS workspace_name,
            w.public_share_links
          FROM post_share_links l JOIN workspaces w ON w.id = l.workspace_id
          WHERE l.token_hash = ${tokenHash}`.pipe(Effect.orDie);
        const link = rows[0];
        if (!link || link.revokedAt !== null) {
          return yield* linkNotFound();
        }
        const expiresAt = iso(link.expiresAt);
        if (Date.parse(expiresAt) <= Date.now()) {
          return yield* new ShareLinkExpiredError({
            message:
              "This share link has expired. Ask the sender for a new one.",
          });
        }
        const workspaceId = String(link.workspaceId) as WorkspaceId;
        const access = effectiveAccess(link.access, link.publicShareLinks);
        if (access === "workspace") {
          if (!viewer) {
            return yield* new UnauthorizedError({
              message:
                "Sign in with your workspace account to view this preview",
            });
          }
          yield* viewer.authorize(workspaceId).pipe(
            Effect.mapError(
              () =>
                new ForbiddenError({
                  message: "This preview is only shared with workspace members",
                })
            )
          );
        }
        return {
          id: String(link.id),
          workspaceId,
          postId: String(link.postId),
          access,
          expiresAt,
          workspaceName: String(link.workspaceName),
        };
      });

      const view = Effect.fn("ShareLinkService.view")(function* (
        token: string,
        viewer: ShareViewer
      ) {
        const link = yield* resolve(token, viewer);
        // A deleted post makes the link meaningless; report it as gone.
        const post = yield* posts
          .get(link.workspaceId, link.postId)
          .pipe(Effect.mapError(() => linkNotFound()));
        const connectionIds = post.targets.map((target) => target.connectionId);
        const connections =
          connectionIds.length === 0
            ? []
            : yield* sql<Record<string, unknown>>`SELECT id, platform, username,
                display_name, metadata->>'profileImage' AS profile_image
                FROM connections WHERE workspace_id = ${link.workspaceId}
                AND id IN ${sql.in(connectionIds)}`.pipe(Effect.orDie);
        const mediaIds = [
          ...new Set(
            post.groups.flatMap((group) =>
              group.segments.flatMap((segment) =>
                segment.media.map((media) => media.id)
              )
            )
          ),
        ];
        const media =
          mediaIds.length === 0
            ? []
            : yield* sql<
                Record<string, unknown>
              >`SELECT id, url, media_type, alt_text
                FROM media WHERE workspace_id = ${link.workspaceId}
                AND id IN ${sql.in(mediaIds)} AND deleted_at IS NULL`.pipe(
                Effect.orDie
              );
        const connectionById = new Map(
          connections.map((row) => [String(row.id), row])
        );
        const mediaById = new Map(media.map((row) => [String(row.id), row]));
        const defaultGroup = post.groups.find((group) => group.isDefault);

        const channels = post.targets.flatMap((target) => {
          const connection = connectionById.get(target.connectionId);
          const group =
            post.groups.find((candidate) => candidate.id === target.groupId) ??
            defaultGroup;
          if (!(connection && group)) {
            return [];
          }
          return [
            {
              targetId: target.id,
              platform: String(connection.platform).toUpperCase(),
              displayName: nullableString(connection.displayName),
              username: nullableString(connection.username),
              profileImage: nullableString(connection.profileImage),
              scheduledAt: target.scheduledAt,
              status: target.status,
              segments: group.segments.map((segment) => ({
                text: segment.text,
                media: segment.media.flatMap((ref) => {
                  const row = mediaById.get(ref.id);
                  return row
                    ? [
                        {
                          url: String(row.url),
                          mediaType: row.mediaType as "image",
                          altText: ref.altText ?? nullableString(row.altText),
                        },
                      ]
                    : [];
                }),
              })),
            },
          ];
        });

        return {
          workspaceName: link.workspaceName,
          postId: post.id,
          postStatus: post.status,
          updatedAt: post.updatedAt,
          access: link.access,
          expiresAt: link.expiresAt,
          channels,
          comments: yield* comments(link.workspaceId, link.postId),
        } satisfies SharedPostOutput;
      });

      const comment = Effect.fn("ShareLinkService.comment")(function* (input: {
        readonly token: string;
        readonly viewer: ShareViewer;
        readonly authorName?: string;
        readonly body: string;
      }) {
        const link = yield* resolve(input.token, input.viewer);
        let authorName = input.authorName?.trim() ?? "";
        if (input.viewer) {
          // Signed-in visitors comment under their account name. Never derive
          // a name from the email: comments can become public later.
          const users = yield* sql<{
            name: string | null;
          }>`SELECT name FROM users WHERE id = ${input.viewer.userId}`.pipe(
            Effect.orDie
          );
          authorName = users[0]?.name?.trim() || "Team member";
        }
        // The cap check and insert are one statement so bursts can't overshoot
        // it by more than the concurrent writers in flight.
        const rows = yield* sql<
          Record<string, unknown>
        >`INSERT INTO post_share_comments
          (id, workspace_id, post_id, share_link_id, author_name, author_user_id, body)
          SELECT ${makeId(PostShareCommentId)}, ${link.workspaceId}, ${link.postId},
            ${link.id}, ${authorName.slice(0, 60)}, ${input.viewer?.userId ?? null},
            ${input.body.trim()}
          WHERE (SELECT count(*) FROM post_share_comments
            WHERE workspace_id = ${link.workspaceId} AND post_id = ${link.postId})
            < ${MAX_SHARE_COMMENTS_PER_POST}
          RETURNING id, author_name, body, created_at`.pipe(Effect.orDie);
        if (!rows[0]) {
          return yield* new ConflictError({
            message: "This post has reached its feedback limit.",
            resource: "share_comment",
          });
        }
        return commentOutput(rows[0]);
      });

      return ShareLinkService.of({
        get,
        create,
        update,
        revoke,
        comments,
        view,
        comment,
      });
    })
  );
}
