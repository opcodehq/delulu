import {
  ConflictError,
  NotFoundError,
  type QuotaExceededError,
  type WorkspaceFileView,
} from "@delulu/contracts";
import {
  makeId,
  normalizeWorkspacePath,
  type UserId,
  WorkspaceFileId,
  type WorkspaceFileSource,
  WorkspaceFileVersionId,
  type WorkspaceFileVisibility,
  type WorkspaceId,
} from "@delulu/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { QuotaGuard } from "./quota";
import { R2Service } from "./r2";

type FileView = typeof WorkspaceFileView.Type;
type Row = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_WORKSPACE_FILE_BYTES = 250 * 1024 * 1024;
const MAX_PENDING_UPLOADS_PER_USER = 100;

const toView = (row: Row): FileView => ({
  id: String(row.id),
  workspaceId: String(row.workspaceId),
  logicalPath: String(row.logicalPath),
  filename: String(row.filename),
  visibility: row.visibility as FileView["visibility"],
  source: row.source as FileView["source"],
  status: row.status as FileView["status"],
  versionId: row.versionId === null ? null : String(row.versionId),
  mimeType: row.mimeType === null ? null : String(row.mimeType),
  sizeBytes: row.sizeBytes === null ? null : String(row.sizeBytes),
  sha256: row.sha256 === null ? null : String(row.sha256),
  createdAt: new Date(row.createdAt as string | Date).toISOString(),
  updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
});

const SELECT_FILE = `SELECT f.id, f.workspace_id, f.logical_path, f.filename, f.visibility,
  f.source, f.status, f.current_version_id AS version_id, v.mime_type,
  v.size_bytes::text, v.sha256, f.created_at, f.updated_at`;

export class WorkspaceFileService extends Context.Service<
  WorkspaceFileService,
  {
    readonly list: (
      workspaceId: WorkspaceId,
      userId: UserId
    ) => Effect.Effect<readonly FileView[]>;
    readonly get: (
      workspaceId: WorkspaceId,
      fileId: string,
      userId: UserId
    ) => Effect.Effect<FileView, NotFoundError>;
    readonly createUpload: (input: {
      readonly workspaceId: WorkspaceId;
      readonly userId: UserId;
      readonly logicalPath: string;
      readonly filename: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly visibility: WorkspaceFileVisibility;
      readonly source: WorkspaceFileSource;
    }) => Effect.Effect<
      {
        readonly file: FileView;
        readonly versionId: string;
        readonly uploadUrl: string;
        readonly uploadHeaders: Readonly<Record<string, string>>;
      },
      ConflictError | NotFoundError
    >;
    readonly completeUpload: (
      workspaceId: WorkspaceId,
      fileId: string,
      versionId: string,
      userId: UserId,
      billingOwnerUserId: string
    ) => Effect.Effect<
      FileView,
      ConflictError | NotFoundError | QuotaExceededError
    >;
    readonly download: (
      workspaceId: WorkspaceId,
      fileId: string,
      userId: UserId
    ) => Effect.Effect<
      { readonly url: string; readonly expiresInSeconds: number },
      ConflictError | NotFoundError
    >;
    readonly remove: (
      workspaceId: WorkspaceId,
      fileId: string,
      userId: UserId,
      billingOwnerUserId: string
    ) => Effect.Effect<
      void,
      ConflictError | NotFoundError | QuotaExceededError
    >;
    readonly runDeletionCleanup: (
      limit: number
    ) => Effect.Effect<number, ConflictError | QuotaExceededError>;
  }
>()("@delulu/services/WorkspaceFileService") {
  static readonly layer = Layer.effect(
    WorkspaceFileService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const r2 = yield* R2Service;
      const quota = yield* QuotaGuard;
      const list = Effect.fn("WorkspaceFileService.list")(function* (
        workspaceId: WorkspaceId,
        userId: UserId
      ) {
        const rows = yield* sql
          .unsafe<Row>(
            `${SELECT_FILE}
          FROM workspace_files f LEFT JOIN workspace_file_versions v ON v.id = f.current_version_id
          WHERE f.workspace_id = $1 AND f.deleted_at IS NULL
            AND (f.visibility = 'workspace' OR f.owner_user_id = $2) ORDER BY f.logical_path`,
            [workspaceId, userId]
          )
          .pipe(Effect.orDie);
        return rows.map(toView);
      });
      const get = Effect.fn("WorkspaceFileService.get")(function* (
        workspaceId: WorkspaceId,
        fileId: string,
        userId: UserId
      ) {
        const rows = yield* sql
          .unsafe<Row>(
            `${SELECT_FILE}
          FROM workspace_files f LEFT JOIN workspace_file_versions v ON v.id = f.current_version_id
          WHERE f.workspace_id = $1 AND f.id = $2 AND f.deleted_at IS NULL
            AND (f.visibility = 'workspace' OR f.owner_user_id = $3) LIMIT 1`,
            [workspaceId, fileId, userId]
          )
          .pipe(Effect.orDie);
        if (!rows[0]) {
          return yield* new NotFoundError({
            message: "Workspace file not found",
            resource: "workspace-file",
          });
        }
        return toView(rows[0]);
      });
      const createUpload = Effect.fn("WorkspaceFileService.createUpload")(
        function* (input: {
          readonly workspaceId: WorkspaceId;
          readonly userId: UserId;
          readonly logicalPath: string;
          readonly filename: string;
          readonly mimeType: string;
          readonly sizeBytes: number;
          readonly sha256: string;
          readonly visibility: WorkspaceFileVisibility;
          readonly source: WorkspaceFileSource;
        }) {
          let logicalPath: string;
          try {
            logicalPath = normalizeWorkspacePath(input.logicalPath);
          } catch {
            return yield* new ConflictError({
              message: "Workspace path is invalid",
              resource: "workspace-file",
            });
          }
          if (
            !SHA256.test(input.sha256) ||
            input.sizeBytes < 0 ||
            input.sizeBytes > MAX_WORKSPACE_FILE_BYTES ||
            !Number.isSafeInteger(input.sizeBytes)
          ) {
            return yield* new ConflictError({
              message: "File integrity metadata is invalid",
              resource: "workspace-file",
            });
          }
          const fileId = makeId(WorkspaceFileId);
          const versionId = makeId(WorkspaceFileVersionId);
          const bucketKey = `workspaces/${input.workspaceId}/files/${fileId}/versions/${versionId}`;
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.workspaceId}:${input.userId}`}, 0))`;
                const pending = yield* sql<{
                  count: string;
                }>`SELECT count(*)::text AS count
                  FROM workspace_files WHERE workspace_id = ${input.workspaceId}
                    AND owner_user_id = ${input.userId} AND status = 'pending'
                    AND upload_expires_at > now()
                    AND deleted_at IS NULL`;
                if (
                  Number(pending[0]?.count ?? 0) >= MAX_PENDING_UPLOADS_PER_USER
                ) {
                  return yield* new ConflictError({
                    message: "Too many pending workspace file uploads",
                    resource: "workspace-file",
                  });
                }
                yield* sql`INSERT INTO workspace_files (id, workspace_id, owner_user_id, logical_path,
            filename, visibility, source, status) VALUES (${fileId}, ${input.workspaceId}, ${input.userId},
            ${logicalPath}, ${input.filename}, ${input.visibility}, ${input.source}, 'pending')`;
                yield* sql`INSERT INTO workspace_file_versions (id, file_id, version, bucket_key, mime_type,
            size_bytes, sha256, created_by_user_id) VALUES (${versionId}, ${fileId}, 1, ${bucketKey},
            ${input.mimeType}, ${input.sizeBytes}, ${input.sha256}, ${input.userId})`;
              })
            )
            .pipe(
              Effect.catchTag("SqlError", () =>
                Effect.fail(
                  new ConflictError({
                    message: "A file already exists at this path",
                    resource: "workspace-file",
                  })
                )
              )
            );
          const upload = yield* r2.presignVerifiedPut(bucketKey, {
            contentType: input.mimeType,
          });
          return {
            file: yield* get(input.workspaceId, fileId, input.userId),
            versionId,
            uploadUrl: upload.url,
            uploadHeaders: upload.headers,
          };
        }
      );
      const completeUpload = Effect.fn("WorkspaceFileService.completeUpload")(
        function* (
          workspaceId: WorkspaceId,
          fileId: string,
          versionId: string,
          userId: UserId,
          billingOwnerUserId: string
        ) {
          const versions =
            yield* sql<Row>`SELECT v.bucket_key, v.size_bytes::text, v.mime_type, v.sha256
          FROM workspace_file_versions v JOIN workspace_files f ON f.id = v.file_id
          WHERE f.workspace_id = ${workspaceId} AND f.id = ${fileId} AND v.id = ${versionId}
            AND (f.visibility = 'workspace' OR f.owner_user_id = ${userId})
            AND f.deleted_at IS NULL LIMIT 1`.pipe(Effect.orDie);
          const version = versions[0];
          if (!version) {
            return yield* new NotFoundError({
              message: "File upload not found",
              resource: "workspace-file",
            });
          }
          const metadata = yield* r2.head(String(version.bucketKey));
          const actualSha256 = yield* r2.hashSha256(String(version.bucketKey));
          if (
            metadata.size !== Number(version.sizeBytes) ||
            metadata.contentType !== String(version.mimeType) ||
            actualSha256 !== String(version.sha256)
          ) {
            return yield* new ConflictError({
              message: "Uploaded file integrity metadata does not match",
              resource: "workspace-file",
            });
          }
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const files = yield* sql<Row>`SELECT status, current_version_id
                  FROM workspace_files WHERE id = ${fileId} AND workspace_id = ${workspaceId}
                    AND (visibility = 'workspace' OR owner_user_id = ${userId})
                    AND deleted_at IS NULL FOR UPDATE`;
                const file = files[0];
                if (!file) {
                  return yield* new NotFoundError({
                    message: "File upload not found",
                    resource: "workspace-file",
                  });
                }
                if (
                  file.status === "available" &&
                  String(file.currentVersionId) === versionId
                ) {
                  return;
                }
                if (file.status !== "pending") {
                  return yield* new ConflictError({
                    message: "File upload is not pending",
                    resource: "workspace-file",
                  });
                }
                yield* quota.reserveMediaStorage({
                  billingOwnerUserId,
                  delta: metadata.size,
                });
                yield* sql`UPDATE workspace_files SET current_version_id = ${versionId}, status = 'available'
                WHERE id = ${fileId} AND workspace_id = ${workspaceId} AND status = 'pending'`;
              })
            )
            .pipe(Effect.catchTag("SqlError", Effect.die));
          return yield* get(workspaceId, fileId, userId);
        }
      );
      const download = Effect.fn("WorkspaceFileService.download")(function* (
        workspaceId: WorkspaceId,
        fileId: string,
        userId: UserId
      ) {
        const rows = yield* sql<Row>`SELECT v.bucket_key FROM workspace_files f
          JOIN workspace_file_versions v ON v.id = f.current_version_id
          WHERE f.workspace_id = ${workspaceId} AND f.id = ${fileId} AND f.status = 'available'
            AND (f.visibility = 'workspace' OR f.owner_user_id = ${userId})
            AND f.deleted_at IS NULL LIMIT 1`.pipe(Effect.orDie);
        if (!rows[0]) {
          return yield* new NotFoundError({
            message: "Workspace file not found",
            resource: "workspace-file",
          });
        }
        return {
          url: yield* r2.presignGet(String(rows[0].bucketKey)),
          expiresInSeconds: 3600,
        };
      });
      const processDeletion = Effect.fn("WorkspaceFileService.processDeletion")(
        function* (fileId: string) {
          const rows = yield* sql<Row>`SELECT d.file_id, v.bucket_key
            FROM workspace_file_deletions d
            LEFT JOIN workspace_file_versions v ON v.file_id = d.file_id
            WHERE d.file_id = ${fileId}`.pipe(Effect.orDie);
          if (rows.length === 0) {
            return false;
          }
          const deletion = Effect.gen(function* () {
            for (const row of rows) {
              if (row.bucketKey !== null) {
                yield* r2.remove(String(row.bucketKey));
              }
            }
          });
          const result = yield* deletion.pipe(Effect.result);
          if (result._tag === "Failure") {
            yield* sql`UPDATE workspace_file_deletions SET attempts = attempts + 1,
              last_error = ${result.failure.message}, updated_at = now()
              WHERE file_id = ${fileId}`.pipe(Effect.orDie);
            return yield* Effect.fail(result.failure);
          }
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const jobs =
                  yield* sql<Row>`SELECT billing_owner_user_id, reserved_bytes::text
                  FROM workspace_file_deletions WHERE file_id = ${fileId} FOR UPDATE`;
                const job = jobs[0];
                if (!job) {
                  return;
                }
                const reservedBytes = Number(job.reservedBytes);
                if (reservedBytes > 0) {
                  yield* quota.reserveMediaStorage({
                    billingOwnerUserId: String(job.billingOwnerUserId),
                    delta: -reservedBytes,
                  });
                }
                yield* sql`UPDATE workspace_files SET status = 'deleted', deleted_at = now()
                  WHERE id = ${fileId}`;
                yield* sql`DELETE FROM workspace_file_deletions WHERE file_id = ${fileId}`;
              })
            )
            .pipe(Effect.catchTag("SqlError", Effect.die));
          return true;
        }
      );
      const remove = Effect.fn("WorkspaceFileService.remove")(function* (
        workspaceId: WorkspaceId,
        fileId: string,
        userId: UserId,
        billingOwnerUserId: string
      ) {
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<Row>`SELECT f.status
                FROM workspace_files f
                WHERE f.workspace_id = ${workspaceId} AND f.id = ${fileId}
                  AND f.deleted_at IS NULL
                  AND (f.visibility = 'workspace' OR f.owner_user_id = ${userId})
                FOR UPDATE OF f`;
              const file = rows[0];
              if (!file) {
                return yield* new NotFoundError({
                  message: "Workspace file not found",
                  resource: "workspace-file",
                });
              }
              const totals =
                yield* sql<Row>`SELECT COALESCE(sum(size_bytes), 0)::text AS version_bytes
                FROM workspace_file_versions WHERE file_id = ${fileId}`;
              yield* sql`UPDATE workspace_files SET status = 'processing'
                WHERE id = ${fileId}`;
              yield* sql`INSERT INTO workspace_file_deletions
                (file_id, billing_owner_user_id, reserved_bytes)
                VALUES (${fileId}, ${billingOwnerUserId},
                  ${file.status === "available" ? Number(totals[0]?.versionBytes ?? 0) : 0})
                ON CONFLICT (file_id) DO NOTHING`;
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die));
        yield* processDeletion(fileId);
      });
      const runDeletionCleanup = Effect.fn(
        "WorkspaceFileService.runDeletionCleanup"
      )(function* (limit: number) {
        const boundedLimit = Math.max(0, Math.min(limit, 100));
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const expired = yield* sql<Row>`SELECT id, owner_user_id
                FROM workspace_files WHERE status = 'pending'
                  AND deleted_at IS NULL AND upload_expires_at <= now()
                ORDER BY upload_expires_at FOR UPDATE SKIP LOCKED LIMIT ${boundedLimit}`;
              for (const file of expired) {
                yield* sql`UPDATE workspace_files SET status = 'processing'
                  WHERE id = ${String(file.id)} AND status = 'pending'`;
                yield* sql`INSERT INTO workspace_file_deletions
                  (file_id, billing_owner_user_id, reserved_bytes)
                  VALUES (${String(file.id)}, ${String(file.ownerUserId)}, 0)
                  ON CONFLICT (file_id) DO NOTHING`;
              }
            })
          )
          .pipe(Effect.orDie);
        const rows =
          yield* sql<Row>`SELECT file_id FROM workspace_file_deletions
          ORDER BY updated_at LIMIT ${boundedLimit}`.pipe(Effect.orDie);
        let processed = 0;
        for (const row of rows) {
          if (yield* processDeletion(String(row.fileId))) {
            processed += 1;
          }
        }
        return processed;
      });
      return WorkspaceFileService.of({
        list,
        get,
        createUpload,
        completeUpload,
        download,
        remove,
        runDeletionCleanup,
      });
    })
  );
}
