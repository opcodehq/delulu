import { connectionRegistry } from "@delulu/connections";
import {
  ConflictError,
  NotFoundError,
  PostGroupInput,
  type PostView,
  type PostWrite,
  ValidationError,
} from "@delulu/contracts";
import {
  contentFingerprint,
  makeId,
  PlatformSettings,
  PostId,
  PostTargetId,
  rolePermissions,
  validateContentGraph,
  type WorkspaceId,
  type WorkspaceRole,
} from "@delulu/core";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { JobService } from "./jobs";

type PostWriteInput = typeof PostWrite.Type;
type PostOutput = typeof PostView.Type;

// API rows created before client-side ID generation was corrected can contain
// non-canonical group or media IDs. They are still valid PostView strings and
// must remain readable so a user can open and replace those drafts.
export const decodePostContentForView = Schema.decodeUnknownSync(
  Schema.Struct({ groups: Schema.Array(PostGroupInput) })
);

const decodePlatformSettings = Schema.decodeUnknownSync(PlatformSettings);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const decodePostTargetSettingsForView = (
  value: unknown
): typeof PlatformSettings.Type => {
  try {
    return decodePlatformSettings(value);
  } catch (error) {
    if (!(isRecord(value) && typeof value.platform === "string")) {
      throw error;
    }
    const definition =
      connectionRegistry[value.platform as keyof typeof connectionRegistry];
    if (!(definition && isRecord(definition.settings.defaults))) {
      throw error;
    }
    return decodePlatformSettings({
      ...value,
      values: {
        ...definition.settings.defaults,
        ...(isRecord(value.values) ? value.values : {}),
      },
    });
  }
};
export const postRequiresTarget = (intent: PostWriteInput["intent"]): boolean =>
  intent !== "draft";

export interface PostActor {
  readonly memberId: string;
  readonly role: WorkspaceRole;
}

const PostRow = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  status: Schema.String,
  content: Schema.Unknown,
  source: Schema.String,
  externalSubmissionId: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
});
const TargetRow = Schema.Struct({
  id: Schema.String,
  postId: Schema.String,
  connectionId: Schema.String,
  groupId: Schema.String,
  settings: Schema.Unknown,
  scheduledAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  status: Schema.String,
  platformPostId: Schema.NullOr(Schema.String),
  platformPostUrl: Schema.NullOr(Schema.String),
  postedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  error: Schema.NullOr(Schema.String),
  attempts: Schema.Number,
});
const ConnectionPlatform = Schema.Struct({
  id: Schema.String,
  platform: Schema.String,
});

const iso = (value: DateTime.Utc | null): string | null =>
  value === null ? null : DateTime.formatIso(value);

/**
 * Normalizes the optional `status` filter into a status list. Accepts a single
 * value ("failed") or a comma-separated set ("failed,partially_failed") so a
 * caller like the dashboard's failed-posts card can count every post that needs
 * attention. Returns null when no usable filter was supplied, meaning "no
 * status constraint" — critically, both the row query and the total count read
 * from this same parse so the headline number can never drift from the rows.
 */
const parseStatuses = (status: string | undefined): string[] | null => {
  if (!status) {
    return null;
  }
  const list = status
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
};

/** Post graph commands and hydrated reads. All cross-row changes are atomic. */
export class PostService extends Context.Service<
  PostService,
  {
    readonly list: (input: {
      readonly workspaceId: WorkspaceId;
      readonly limit: number;
      readonly offset: number;
      readonly status?: string;
    }) => Effect.Effect<{
      readonly data: readonly PostOutput[];
      readonly total: number;
      readonly limit: number;
      readonly offset: number;
    }>;
    readonly get: (
      workspaceId: WorkspaceId,
      id: string
    ) => Effect.Effect<PostOutput, NotFoundError>;
    readonly create: (input: {
      readonly workspaceId: WorkspaceId;
      readonly actor: PostActor;
      readonly value: PostWriteInput;
    }) => Effect.Effect<
      PostOutput,
      ValidationError | NotFoundError | ConflictError
    >;
    readonly update: (input: {
      readonly workspaceId: WorkspaceId;
      readonly postId: string;
      readonly actor: PostActor;
      readonly value: PostWriteInput;
    }) => Effect.Effect<
      PostOutput,
      ValidationError | NotFoundError | ConflictError
    >;
    readonly remove: (
      workspaceId: WorkspaceId,
      id: string
    ) => Effect.Effect<void, NotFoundError>;
    readonly publishNow: (input: {
      readonly workspaceId: WorkspaceId;
      readonly postId: string;
      readonly actor: PostActor;
    }) => Effect.Effect<PostOutput, ConflictError | NotFoundError>;
    readonly retryTarget: (input: {
      readonly workspaceId: WorkspaceId;
      readonly postId: string;
      readonly targetId: string;
    }) => Effect.Effect<
      PostOutput["targets"][number],
      NotFoundError | ConflictError
    >;
    readonly updateTarget: (input: {
      readonly workspaceId: WorkspaceId;
      readonly postId: string;
      readonly targetId: string;
      readonly groupId?: string;
      readonly settings?: typeof PlatformSettings.Type;
      readonly scheduledAt?: string | null;
      readonly actor: PostActor;
    }) => Effect.Effect<
      PostOutput["targets"][number],
      NotFoundError | ValidationError | ConflictError
    >;
  }
>()("@delulu/services/PostService") {
  static readonly layer = Layer.effect(
    PostService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const jobs = yield* JobService;
      const hydrate = (
        posts: readonly (typeof PostRow.Type)[],
        targets: readonly (typeof TargetRow.Type)[]
      ): readonly PostOutput[] => {
        const byPost = new Map<string, (typeof TargetRow.Type)[]>();
        for (const target of targets) {
          const entries = byPost.get(target.postId) ?? [];
          entries.push(target);
          byPost.set(target.postId, entries);
        }
        return posts.map((post) => {
          const content = decodePostContentForView(post.content);
          return {
            id: post.id,
            workspaceId: post.workspaceId,
            status: post.status as PostOutput["status"],
            groups: content.groups,
            targets: (byPost.get(post.id) ?? []).map((target) => ({
              id: target.id,
              connectionId: target.connectionId,
              groupId: target.groupId,
              settings: decodePostTargetSettingsForView(target.settings),
              scheduledAt: iso(target.scheduledAt),
              status: target.status as PostOutput["targets"][number]["status"],
              platformPostId: target.platformPostId,
              platformPostUrl: target.platformPostUrl,
              postedAt: iso(target.postedAt),
              error: target.error,
              attempts: target.attempts,
            })),
            source: post.source as PostOutput["source"],
            externalSubmissionId: post.externalSubmissionId,
            createdAt: DateTime.formatIso(post.createdAt),
            updatedAt: DateTime.formatIso(post.updatedAt),
          };
        });
      };

      const findPosts = SqlSchema.findAll({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          limit: Schema.Number,
          offset: Schema.Number,
          status: Schema.optional(Schema.String),
        }),
        Result: PostRow,
        execute: ({ workspaceId, limit, offset, status }) => {
          const statuses = parseStatuses(status);
          return statuses
            ? sql`SELECT id, workspace_id, status, content, source, external_submission_id, created_at, updated_at
                  FROM posts WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL AND status IN ${sql.in(statuses)}
                  ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
            : sql`SELECT id, workspace_id, status, content, source, external_submission_id, created_at, updated_at
                  FROM posts WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
                  ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        },
      });
      const findPost = SqlSchema.findOneOption({
        Request: Schema.Struct({
          workspaceId: Schema.String,
          id: Schema.String,
        }),
        Result: PostRow,
        execute: ({ workspaceId, id }) =>
          sql`SELECT id, workspace_id, status, content, source, external_submission_id, created_at, updated_at
              FROM posts WHERE workspace_id = ${workspaceId} AND id = ${id} AND deleted_at IS NULL`,
      });
      const findTargets = SqlSchema.findAll({
        Request: Schema.Array(Schema.String),
        Result: TargetRow,
        execute: (postIds) =>
          postIds.length === 0
            ? sql`SELECT id, post_id, connection_id, group_id, settings, scheduled_at, status,
                         platform_post_id, platform_post_url, posted_at, error, attempts
                  FROM post_targets WHERE false`
            : sql`SELECT id, post_id, connection_id, group_id, settings, scheduled_at, status,
                         platform_post_id, platform_post_url, posted_at, error, attempts
                  FROM post_targets WHERE post_id IN ${sql.in(postIds)} ORDER BY created_at`,
      });

      const get = Effect.fn("PostService.get")(function* (
        workspaceId: WorkspaceId,
        id: string
      ) {
        const post = yield* findPost({ workspaceId, id }).pipe(Effect.orDie);
        if (Option.isNone(post)) {
          return yield* new NotFoundError({
            message: "Post not found",
            resource: "post",
          });
        }
        const targets = yield* findTargets([id]).pipe(Effect.orDie);
        return hydrate([post.value], targets)[0] as PostOutput;
      });

      const list = Effect.fn("PostService.list")(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly limit: number;
        readonly offset: number;
        readonly status?: string;
      }) {
        const posts = yield* findPosts(input).pipe(Effect.orDie);
        const targets = yield* findTargets(posts.map((post) => post.id)).pipe(
          Effect.orDie
        );
        const statuses = parseStatuses(input.status);
        const totals = yield* (
          statuses
            ? sql<{
                count: string;
              }>`SELECT count(*)::text AS count FROM posts
                WHERE workspace_id = ${input.workspaceId} AND deleted_at IS NULL AND status IN ${sql.in(statuses)}`
            : sql<{
                count: string;
              }>`SELECT count(*)::text AS count FROM posts
                WHERE workspace_id = ${input.workspaceId} AND deleted_at IS NULL`
        ).pipe(Effect.orDie);
        return {
          data: hydrate(posts, targets),
          total: Number(totals[0]?.count ?? 0),
          limit: input.limit,
          offset: input.offset,
        };
      });

      const validate = Effect.fn("PostService.validate")(function* (
        workspaceId: WorkspaceId,
        value: PostWriteInput
      ) {
        const issues = [
          ...validateContentGraph({ groups: value.groups }, value.targets),
        ];
        if (value.targets.length === 0 && postRequiresTarget(value.intent)) {
          issues.push({
            path: "targets",
            message: "At least one target is required",
          });
        }
        const connectionIds = value.targets.map(
          (target) => target.connectionId
        );
        const rows =
          connectionIds.length === 0
            ? []
            : yield* SqlSchema.findAll({
                Request: Schema.Void,
                Result: ConnectionPlatform,
                execute: () => sql`SELECT id, platform FROM connections
                WHERE workspace_id = ${workspaceId} AND id IN ${sql.in(connectionIds)}`,
              })(undefined).pipe(Effect.orDie);
        const platformById = new Map(rows.map((row) => [row.id, row.platform]));
        value.targets.forEach((target, index) => {
          const platform = platformById.get(target.connectionId);
          if (!platform) {
            issues.push({
              path: `targets[${index}].connectionId`,
              message: "Connection does not exist in this workspace",
            });
          } else if (platform !== target.settings.platform) {
            issues.push({
              path: `targets[${index}].settings.platform`,
              message: "Provider settings do not match the connection platform",
            });
          }
          if (
            target.scheduledAt !== null &&
            Number.isNaN(Date.parse(target.scheduledAt))
          ) {
            issues.push({
              path: `targets[${index}].scheduledAt`,
              message: "scheduledAt must be an absolute UTC timestamp",
            });
          }
        });
        if (issues.length > 0) {
          return yield* new ValidationError({
            message: "Invalid post graph",
            issues,
          });
        }
      });

      const write = Effect.fn("PostService.write")(function* (input: {
        readonly workspaceId: WorkspaceId;
        readonly postId?: string;
        readonly actor: PostActor;
        readonly value: PostWriteInput;
      }) {
        yield* validate(input.workspaceId, input.value);
        if (!rolePermissions[input.actor.role].createPost) {
          return yield* new ConflictError({
            message: "Role cannot create posts",
            resource: "post",
          });
        }
        const isEditorReview = input.actor.role === "editor";
        const publishImmediately =
          input.postId === undefined &&
          input.value.intent === "publish_now" &&
          !isEditorReview;
        const status = isEditorReview
          ? "pending_review"
          : publishImmediately
            ? "publishing"
            : input.value.targets.some((target) => target.scheduledAt !== null)
              ? "scheduled"
              : "draft";
        const postId = input.postId ?? makeId(PostId);
        const persistedPostId = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              if (input.postId) {
                const existing = yield* sql<{
                  status: string;
                }>`SELECT status FROM posts
                WHERE id = ${postId} AND workspace_id = ${input.workspaceId} AND deleted_at IS NULL FOR UPDATE`;
                if (existing.length === 0) {
                  return yield* new NotFoundError({
                    message: "Post not found",
                    resource: "post",
                  });
                }
                if (
                  input.actor.role === "editor" &&
                  existing[0]?.status === "scheduled"
                ) {
                  yield* sql`UPDATE post_reviews SET status = 'rejected', resolved_at = now()
                  WHERE post_id = ${postId}`;
                }
                const previousTargets = yield* sql<{
                  id: string;
                }>`SELECT id FROM post_targets WHERE post_id = ${postId}`;
                for (const target of previousTargets) {
                  yield* jobs.cancel(`publish-target:${target.id}`);
                }
                yield* sql`DELETE FROM post_targets WHERE post_id = ${postId}`;
                yield* sql`UPDATE posts SET content = ${JSON.stringify({ groups: input.value.groups })}::jsonb,
                status = ${status}::post_status, source = ${input.value.source ?? "api"},
                external_submission_id = ${input.value.externalSubmissionId ?? null}
                WHERE id = ${postId}`;
              } else {
                const existing = input.value.externalSubmissionId
                  ? yield* sql<{
                      id: string;
                    }>`SELECT id FROM posts WHERE workspace_id = ${input.workspaceId}
                    AND external_submission_id = ${input.value.externalSubmissionId} AND deleted_at IS NULL`
                  : [];
                if (existing[0]) {
                  return existing[0].id;
                }
                yield* sql`INSERT INTO posts
                (id, workspace_id, status, content, created_by_member_id, source, external_submission_id)
                VALUES (${postId}, ${input.workspaceId}, ${status}::post_status,
                  ${JSON.stringify({ groups: input.value.groups })}::jsonb, ${input.actor.memberId},
                  ${input.value.source ?? "api"}, ${input.value.externalSubmissionId ?? null})`;
              }
              for (const target of input.value.targets) {
                const targetId = makeId(PostTargetId);
                yield* sql`INSERT INTO post_targets
                (id, post_id, connection_id, group_id, settings, scheduled_at, status)
                VALUES (${targetId}, ${postId}, ${target.connectionId}, ${target.groupId},
                  ${JSON.stringify(target.settings)}::jsonb,
                  ${target.scheduledAt ? new Date(target.scheduledAt) : null}, 'pending')`;
                if (
                  !isEditorReview &&
                  (target.scheduledAt || publishImmediately)
                ) {
                  yield* jobs.enqueue({
                    workspaceId: input.workspaceId,
                    payload: { _tag: "PublishTarget", targetId },
                    runAt: publishImmediately
                      ? new Date()
                      : new Date(target.scheduledAt as string),
                    idempotencyKey: `publish-target:${targetId}`,
                  });
                }
              }
              if (isEditorReview) {
                const fingerprint = yield* Effect.promise(() =>
                  contentFingerprint({ groups: input.value.groups })
                );
                const reviewRows = yield* sql<{
                  id: string;
                }>`SELECT id FROM post_reviews WHERE post_id = ${postId}`;
                const reviewId =
                  reviewRows[0]?.id ??
                  `post_review_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
                yield* sql`INSERT INTO post_reviews
                (id, workspace_id, post_id, status, content_fingerprint, submitted_by_member_id)
                VALUES (${reviewId}, ${input.workspaceId}, ${postId}, 'pending', ${fingerprint}, ${input.actor.memberId})
                ON CONFLICT (post_id) DO UPDATE SET status = 'pending', content_fingerprint = EXCLUDED.content_fingerprint,
                  submitted_by_member_id = EXCLUDED.submitted_by_member_id, resolved_by_member_id = NULL, resolved_at = NULL`;
                yield* sql`INSERT INTO review_activity
                (id, workspace_id, post_id, review_id, actor_member_id, activity_type, comment)
                VALUES (${`review_activity_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`},
                  ${input.workspaceId}, ${postId}, ${reviewId}, ${input.actor.memberId},
                  'review.submitted', NULL)`;
              }
              return postId;
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die));
        return yield* get(input.workspaceId, persistedPostId);
      });

      const create = (input: {
        readonly workspaceId: WorkspaceId;
        readonly actor: PostActor;
        readonly value: PostWriteInput;
      }) => write(input);
      const update = (input: {
        readonly workspaceId: WorkspaceId;
        readonly postId: string;
        readonly actor: PostActor;
        readonly value: PostWriteInput;
      }) => write({ ...input, postId: input.postId });
      const remove = Effect.fn("PostService.remove")(
        function* (workspaceId: WorkspaceId, id: string) {
          const rows = yield* sql<{
            id: string;
          }>`UPDATE posts SET deleted_at = now()
          WHERE id = ${id} AND workspace_id = ${workspaceId} AND deleted_at IS NULL RETURNING id`.pipe(
            Effect.orDie
          );
          if (rows.length === 0) {
            return yield* new NotFoundError({
              message: "Post not found",
              resource: "post",
            });
          }
          const targets = yield* sql<{
            id: string;
          }>`SELECT id FROM post_targets WHERE post_id = ${id}`.pipe(
            Effect.orDie
          );
          for (const target of targets) {
            yield* jobs.cancel(`publish-target:${target.id}`);
          }
        },
        (effect) =>
          sql
            .withTransaction(effect)
            .pipe(Effect.catchTag("SqlError", Effect.die))
      );
      const retryTarget = Effect.fn("PostService.retryTarget")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly postId: string;
          readonly targetId: string;
        }) {
          const rows = yield* sql<{
            id: string;
          }>`UPDATE post_targets t SET status = 'pending', error = NULL
          FROM posts p WHERE t.id = ${input.targetId} AND t.post_id = ${input.postId}
            AND p.id = t.post_id AND p.workspace_id = ${input.workspaceId} AND t.status = 'failed'
          RETURNING t.id`.pipe(Effect.orDie);
          if (rows.length === 0) {
            return yield* new ConflictError({
              message: "Only a failed target can be retried",
              resource: "post_target",
            });
          }
          yield* jobs.enqueue({
            workspaceId: input.workspaceId,
            payload: {
              _tag: "PublishTarget",
              targetId: input.targetId as typeof PostTargetId.Type,
            },
            runAt: new Date(),
            idempotencyKey: `publish-target:${input.targetId}`,
          });
          const post = yield* get(input.workspaceId, input.postId);
          return post.targets.find(
            (target) => target.id === input.targetId
          ) as PostOutput["targets"][number];
        }
      );
      const updateTarget = Effect.fn("PostService.updateTarget")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly postId: string;
          readonly targetId: string;
          readonly groupId?: string;
          readonly settings?: typeof PlatformSettings.Type;
          readonly scheduledAt?: string | null;
          readonly actor: PostActor;
        }) {
          if (
            input.scheduledAt !== undefined &&
            input.scheduledAt !== null &&
            Number.isNaN(Date.parse(input.scheduledAt))
          ) {
            return yield* new ValidationError({
              message: "Invalid target schedule",
              issues: [
                {
                  path: "scheduledAt",
                  message: "scheduledAt must be an absolute UTC timestamp",
                },
              ],
            });
          }
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const existing = yield* sql<{
                  id: string;
                  status: string;
                  connectionId: string;
                  groupId: string;
                  platform: string;
                  content: unknown;
                }>`SELECT t.id, t.status, t.connection_id, t.group_id,
                    c.platform, p.content
                  FROM post_targets t
                  JOIN posts p ON p.id = t.post_id
                  JOIN connections c ON c.id = t.connection_id
                  WHERE t.id = ${input.targetId} AND t.post_id = ${input.postId}
                  AND p.workspace_id = ${input.workspaceId} AND p.deleted_at IS NULL FOR UPDATE OF t`;
                if (!existing[0]) {
                  return yield* new NotFoundError({
                    message: "Target not found",
                    resource: "post_target",
                  });
                }
                if (
                  existing[0].status === "publishing" ||
                  existing[0].status === "published"
                ) {
                  return yield* new ConflictError({
                    message:
                      "A publishing or published target cannot be edited",
                    resource: "post_target",
                  });
                }
                const content = decodePostContentForView(existing[0].content);
                const nextGroupId = input.groupId ?? existing[0].groupId;
                const issues: { path: string; message: string }[] = [];
                if (!content.groups.some((group) => group.id === nextGroupId)) {
                  issues.push({
                    path: "groupId",
                    message: "Target references a group that does not exist",
                  });
                }
                if (
                  input.settings &&
                  input.settings.platform !== existing[0].platform
                ) {
                  issues.push({
                    path: "settings.platform",
                    message:
                      "Provider settings do not match the connection platform",
                  });
                }
                if (issues.length > 0) {
                  return yield* new ValidationError({
                    message: "Invalid target update",
                    issues,
                  });
                }
                yield* sql`UPDATE post_targets SET
              group_id = COALESCE(${input.groupId ?? null}, group_id),
              settings = CASE WHEN ${input.settings === undefined} THEN settings ELSE ${JSON.stringify(input.settings ?? {})}::jsonb END,
              scheduled_at = CASE WHEN ${input.scheduledAt === undefined} THEN scheduled_at ELSE ${input.scheduledAt ? new Date(input.scheduledAt) : null} END,
              status = CASE WHEN status IN ('published', 'publishing') THEN status ELSE 'pending'::target_status END
              WHERE id = ${input.targetId}`;
                if (
                  input.scheduledAt !== undefined ||
                  input.actor.role === "editor"
                ) {
                  yield* jobs.cancel(`publish-target:${input.targetId}`);
                }
                if (input.scheduledAt && input.actor.role !== "editor") {
                  yield* jobs.enqueue({
                    workspaceId: input.workspaceId,
                    payload: {
                      _tag: "PublishTarget",
                      targetId: input.targetId as typeof PostTargetId.Type,
                    },
                    runAt: new Date(input.scheduledAt),
                    idempotencyKey: `publish-target:${input.targetId}`,
                  });
                }
                if (input.actor.role === "editor") {
                  yield* sql`UPDATE posts SET status = 'draft' WHERE id = ${input.postId}`;
                  const reviews = yield* sql<{
                    id: string;
                  }>`UPDATE post_reviews SET status = 'rejected', resolved_at = now(), resolved_by_member_id = NULL
                    WHERE post_id = ${input.postId} AND status IN ('pending', 'approved') RETURNING id`;
                  for (const review of reviews) {
                    yield* sql`INSERT INTO review_activity
                      (id, workspace_id, post_id, review_id, actor_member_id, activity_type, comment)
                      VALUES (${`review_activity_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`},
                        ${input.workspaceId}, ${input.postId}, ${review.id}, ${input.actor.memberId},
                        'review.withdrawn', 'Target settings changed after submission')`;
                  }
                }
              })
            )
            .pipe(Effect.catchTag("SqlError", Effect.die));
          const post = yield* get(input.workspaceId, input.postId);
          return post.targets.find(
            (target) => target.id === input.targetId
          ) as PostOutput["targets"][number];
        }
      );
      const publishNow = Effect.fn("PostService.publishNow")(function* (input: {
        workspaceId: WorkspaceId;
        postId: string;
        actor: PostActor;
      }) {
        if (!rolePermissions[input.actor.role].publishDirect) {
          return yield* new ConflictError({
            message: "Role cannot publish directly",
            resource: "post",
          });
        }
        const authoritativeStatus = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const posts = yield* sql<{
                status: PostOutput["status"];
              }>`SELECT status FROM posts
                WHERE id = ${input.postId} AND workspace_id = ${input.workspaceId}
                  AND deleted_at IS NULL FOR UPDATE`;
              if (!posts[0]) {
                return yield* new NotFoundError({
                  message: "Post not found",
                  resource: "post",
                });
              }
              if (
                posts[0].status === "publishing" ||
                posts[0].status === "published"
              ) {
                return posts[0].status;
              }
              const targets = yield* sql<{
                id: string;
              }>`SELECT id FROM post_targets
                WHERE post_id = ${input.postId} FOR UPDATE`;
              if (targets.length === 0) {
                return yield* new NotFoundError({
                  message: "Publish targets not found",
                  resource: "post",
                });
              }
              yield* sql`UPDATE posts SET status = 'publishing'
                WHERE id = ${input.postId}`;
              yield* sql`UPDATE post_targets SET scheduled_at = NULL,
                status = 'pending', error = NULL WHERE post_id = ${input.postId}`;
              for (const target of targets) {
                yield* jobs.enqueue({
                  workspaceId: input.workspaceId,
                  payload: {
                    _tag: "PublishTarget",
                    targetId: target.id as typeof PostTargetId.Type,
                  },
                  runAt: new Date(),
                  idempotencyKey: `publish-target:${target.id}`,
                });
              }
              return "publishing" as const;
            })
          )
          .pipe(Effect.orDie);
        const post = yield* get(input.workspaceId, input.postId);
        return post.status === "draft"
          ? { ...post, status: authoritativeStatus }
          : post;
      });
      return PostService.of({
        list,
        get,
        create,
        update,
        remove,
        retryTarget,
        updateTarget,
        publishNow,
      });
    })
  );
}
