import {
  ConflictError,
  type MediaView,
  NotFoundError,
  type QuotaExceededError,
} from "@delulu/contracts";
import { MediaId, makeId, type WorkspaceId } from "@delulu/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { JobService } from "./jobs";
import { QuotaGuard } from "./quota";
import { R2Service } from "./r2";

type MediaOutput = typeof MediaView.Type;
const mediaTypeFor = (contentType: string): MediaOutput["mediaType"] => {
  if (contentType.startsWith("image/")) {
    return "image";
  }
  if (contentType.startsWith("video/")) {
    return "video";
  }
  return "document";
};
const mediaRow = (row: Record<string, unknown>): MediaOutput => ({
  id: String(row.id),
  bucketKey: String(row.bucketKey),
  url: String(row.url),
  mediaType: row.mediaType as MediaOutput["mediaType"],
  mimeType: row.mimeType === null ? null : String(row.mimeType),
  sizeBytes: String(row.sizeBytes),
  width: row.width === null ? null : Number(row.width),
  height: row.height === null ? null : Number(row.height),
  durationSeconds:
    row.durationSeconds === null ? null : Number(row.durationSeconds),
  thumbnails: row.thumbnails as readonly string[],
  altText: row.altText === null ? null : String(row.altText),
  status: row.status as MediaOutput["status"],
  createdAt: new Date(row.createdAt as string | Date).toISOString(),
});

const MAX_IMPORT_BYTES = 250 * 1024 * 1024;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const PRIVATE_IPV4 =
  /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.(?:0\.|0\.2\.|168\.)|198\.(?:1[89]\.|51\.100\.)|203\.0\.113\.|(?:22[4-9]|2[3-5]\d)\.)/;
const PRIVATE_IPV6 = /^\[(?:f[cd]|fe[89ab]|ff|2001:db8)/;
const GOOGLE_DRIVE_FILE_PATH = /^\/file\/d\/([^/]+)/;

const publicHttpsUrl = (value: string): URL => {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    PRIVATE_IPV4.test(hostname) ||
    hostname === "[::]" ||
    hostname === "[::1]" ||
    PRIVATE_IPV6.test(hostname) ||
    hostname.startsWith("[::ffff:")
  ) {
    throw new Error("Only public HTTPS media URLs are supported");
  }
  return url;
};

const assertPublicResolution = async (url: URL) => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (IPV4.test(hostname) || hostname.includes(":")) {
    return;
  }
  const answers = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const lookup = new URL("https://cloudflare-dns.com/dns-query");
      lookup.searchParams.set("name", hostname);
      lookup.searchParams.set("type", type);
      const response = await fetch(lookup, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error("Unable to validate media source DNS");
      }
      return (await response.json()) as {
        Answer?: readonly { data: string; type: number }[];
      };
    })
  );
  const addresses = answers.flatMap((answer) =>
    (answer.Answer ?? [])
      .filter((entry) => entry.type === 1 || entry.type === 28)
      .map((entry) => entry.data)
  );
  if (
    addresses.length === 0 ||
    addresses.some((address) => {
      try {
        publicHttpsUrl(
          `https://${address.includes(":") ? `[${address}]` : address}`
        );
        return false;
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("Media source DNS does not resolve to public addresses");
  }
};

const normalizeImportUrl = (value: string): URL => {
  const url = publicHttpsUrl(value);
  if (url.hostname === "drive.google.com") {
    const fileMatch = url.pathname.match(GOOGLE_DRIVE_FILE_PATH);
    const id = fileMatch?.[1] ?? url.searchParams.get("id");
    if (!id) {
      throw new Error("The public Google Drive URL has no file id");
    }
    return new URL(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`
    );
  }
  return url;
};

export class MediaService extends Context.Service<
  MediaService,
  {
    readonly list: (
      workspaceId: WorkspaceId,
      limit: number,
      offset: number
    ) => Effect.Effect<{
      data: readonly MediaOutput[];
      total: number;
      limit: number;
      offset: number;
    }>;
    readonly get: (
      workspaceId: WorkspaceId,
      mediaId: string
    ) => Effect.Effect<MediaOutput, NotFoundError>;
    readonly createUploads: (input: {
      workspaceId: WorkspaceId;
      billingOwnerUserId: string;
      files: readonly {
        filename: string;
        contentType: string;
        width?: number;
        height?: number;
        durationSeconds?: number;
        thumbnails?: readonly string[];
        altText?: string;
      }[];
    }) => Effect.Effect<
      readonly { mediaId: string; bucketKey: string; uploadUrl: string }[],
      ConflictError | QuotaExceededError
    >;
    readonly complete: (input: {
      workspaceId: WorkspaceId;
      billingOwnerUserId: string;
      mediaIds: readonly string[];
    }) => Effect.Effect<
      readonly MediaOutput[],
      ConflictError | NotFoundError | QuotaExceededError
    >;
    readonly importFromUrl: (input: {
      readonly workspaceId: WorkspaceId;
      readonly billingOwnerUserId: string;
      readonly url: string;
      readonly filename?: string;
      readonly altText?: string;
      readonly idempotencyKey?: string;
    }) => Effect.Effect<MediaOutput, ConflictError | QuotaExceededError>;
    readonly remove: (
      workspaceId: WorkspaceId,
      mediaId: string
    ) => Effect.Effect<void, NotFoundError>;
  }
>()("@delulu/services/MediaService") {
  static readonly layer = Layer.effect(
    MediaService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const r2 = yield* R2Service;
      const quota = yield* QuotaGuard;
      const jobs = yield* JobService;
      const list = Effect.fn("MediaService.list")(function* (
        workspaceId: WorkspaceId,
        limit: number,
        offset: number
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT id, bucket_key, url, media_type, mime_type,
          size_bytes::text, width, height, duration_seconds, thumbnails, alt_text, status, created_at
          FROM media WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}`.pipe(Effect.orDie);
        const totals = yield* sql<{
          count: string;
        }>`SELECT count(*)::text AS count FROM media WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL`.pipe(
          Effect.orDie
        );
        return {
          data: rows.map(mediaRow),
          total: Number(totals[0]?.count ?? 0),
          limit,
          offset,
        };
      });
      const createUploads = Effect.fn("MediaService.createUploads")(
        function* (input: {
          workspaceId: WorkspaceId;
          billingOwnerUserId: string;
          files: readonly {
            filename: string;
            contentType: string;
            width?: number;
            height?: number;
            durationSeconds?: number;
            thumbnails?: readonly string[];
            altText?: string;
          }[];
        }) {
          yield* quota.ensure({
            resource: "mediaStorageBytes",
            billingOwnerUserId: input.billingOwnerUserId,
          });
          return yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const outputs: {
                  mediaId: string;
                  bucketKey: string;
                  uploadUrl: string;
                }[] = [];
                for (const file of input.files) {
                  const mediaId = makeId(MediaId);
                  const extension = file.filename.includes(".")
                    ? file.filename
                        .slice(file.filename.lastIndexOf("."))
                        .replace(/[^.a-zA-Z0-9]/g, "")
                    : "";
                  const bucketKey = `${input.workspaceId}/${mediaId}${extension}`;
                  const uploadUrl = yield* r2.presignPut(bucketKey);
                  yield* sql`INSERT INTO media
            (id, workspace_id, bucket_key, url, media_type, mime_type, size_bytes, width, height,
             duration_seconds, thumbnails, alt_text, status)
            VALUES (${mediaId}, ${input.workspaceId}, ${bucketKey}, ${r2.publicUrl(bucketKey)},
              ${mediaTypeFor(file.contentType)}, ${file.contentType}, 0, ${file.width ?? null}, ${file.height ?? null},
              ${file.durationSeconds ?? null}, ${JSON.stringify(file.thumbnails ?? [])}::jsonb, ${file.altText ?? null}, 'pending')`.pipe(
                    Effect.orDie
                  );
                  outputs.push({ mediaId, bucketKey, uploadUrl });
                }
                yield* jobs.enqueue({
                  workspaceId: input.workspaceId,
                  payload: { _tag: "SweepPendingMedia" },
                  runAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
                  idempotencyKey: `sweep-pending:${input.workspaceId}:${new Date().toISOString().slice(0, 10)}`,
                });
                return outputs;
              })
            )
            .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));
        }
      );
      const complete = Effect.fn("MediaService.complete")(function* (input: {
        workspaceId: WorkspaceId;
        billingOwnerUserId: string;
        mediaIds: readonly string[];
      }) {
        const rows =
          input.mediaIds.length === 0
            ? []
            : yield* sql<
                Record<string, unknown>
              >`SELECT id, bucket_key, size_bytes::text, status FROM media
          WHERE id IN ${sql.in(input.mediaIds)} AND workspace_id = ${input.workspaceId} AND deleted_at IS NULL`.pipe(
                Effect.orDie
              );
        if (rows.length !== new Set(input.mediaIds).size) {
          return yield* new NotFoundError({
            message: "Media not found",
            resource: "media",
          });
        }
        for (const row of rows) {
          const id = String(row.id);
          if (row.status !== "ready") {
            const metadata = yield* r2.head(String(row.bucketKey));
            const previous = Number(row.sizeBytes ?? 0);
            yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* quota.reserveMediaStorage({
                    billingOwnerUserId: input.billingOwnerUserId,
                    delta: Math.max(0, metadata.size - previous),
                  });
                  yield* sql`UPDATE media SET status = 'ready', size_bytes = ${metadata.size}, mime_type = ${metadata.contentType},
                  media_type = ${mediaTypeFor(metadata.contentType)} WHERE id = ${id}`;
                })
              )
              .pipe(Effect.catchTag("SqlError", Effect.die));
          }
        }
        const completedRows =
          input.mediaIds.length === 0
            ? []
            : yield* sql<
                Record<string, unknown>
              >`SELECT id, bucket_key, url, media_type, mime_type,
          size_bytes::text, width, height, duration_seconds, thumbnails, alt_text, status, created_at
          FROM media WHERE id IN ${sql.in(input.mediaIds)} AND workspace_id = ${input.workspaceId}`.pipe(
                Effect.orDie
              );
        return completedRows.map(mediaRow);
      });
      const get = Effect.fn("MediaService.get")(function* (
        workspaceId: WorkspaceId,
        mediaId: string
      ) {
        const rows = yield* sql<
          Record<string, unknown>
        >`SELECT id, bucket_key, url, media_type, mime_type,
          size_bytes::text, width, height, duration_seconds, thumbnails, alt_text, status, created_at
          FROM media WHERE id = ${mediaId} AND workspace_id = ${workspaceId} AND deleted_at IS NULL`.pipe(
          Effect.orDie
        );
        if (!rows[0]) {
          return yield* new NotFoundError({
            message: "Media not found",
            resource: "media",
          });
        }
        return mediaRow(rows[0]);
      });
      const importFromUrl = Effect.fn("MediaService.importFromUrl")(
        function* (input: {
          workspaceId: WorkspaceId;
          billingOwnerUserId: string;
          url: string;
          filename?: string;
          altText?: string;
          idempotencyKey?: string;
        }) {
          if (input.idempotencyKey) {
            const claimed = yield* sql<{ idempotencyKey: string }>`
              INSERT INTO media_imports (workspace_id, idempotency_key)
              VALUES (${input.workspaceId}, ${input.idempotencyKey})
              ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
                SET status = 'pending', error = NULL, updated_at = now()
                WHERE media_imports.status = 'failed'
                  OR media_imports.updated_at < now() - interval '5 minutes'
              RETURNING idempotency_key`.pipe(Effect.orDie);
            if (claimed.length === 0) {
              const existing = yield* sql<{
                mediaId: string | null;
                status: string;
              }>`SELECT media_id, status FROM media_imports
                WHERE workspace_id = ${input.workspaceId}
                  AND idempotency_key = ${input.idempotencyKey}`.pipe(
                Effect.orDie
              );
              if (existing[0]?.status === "completed" && existing[0].mediaId) {
                return yield* get(input.workspaceId, existing[0].mediaId).pipe(
                  Effect.mapError(
                    () =>
                      new ConflictError({
                        message: "The completed import media is unavailable",
                        resource: "media",
                      })
                  )
                );
              }
              return yield* new ConflictError({
                message: "An import with this idempotency key is in progress",
                resource: "media",
              });
            }
          }
          let sourceUrl: URL;
          try {
            sourceUrl = normalizeImportUrl(input.url);
          } catch (cause) {
            return yield* new ConflictError({
              message:
                cause instanceof Error ? cause.message : "Invalid media URL",
              resource: "media",
            });
          }
          const source = yield* Effect.tryPromise({
            try: async () => {
              let current = sourceUrl;
              for (let redirects = 0; redirects <= 4; redirects++) {
                await assertPublicResolution(current);
                const response = await fetch(current, {
                  redirect: "manual",
                  signal: AbortSignal.timeout(30_000),
                });
                if (response.status >= 300 && response.status < 400) {
                  const location = response.headers.get("location");
                  if (!(location && redirects < 4)) {
                    throw new Error("Media URL redirected too many times");
                  }
                  current = publicHttpsUrl(
                    new URL(location, current).toString()
                  );
                  continue;
                }
                if (!response.ok) {
                  throw new Error(`Media source returned ${response.status}`);
                }
                return response;
              }
              throw new Error("Media URL redirected too many times");
            },
            catch: (cause) =>
              new ConflictError({
                message:
                  cause instanceof Error
                    ? cause.message
                    : "Unable to download media",
                resource: "media",
              }),
          });
          const contentType =
            source.headers.get("content-type")?.split(";")[0] ?? "";
          if (
            !(
              contentType.startsWith("image/") ||
              contentType.startsWith("video/") ||
              contentType.startsWith("audio/") ||
              contentType === "application/pdf"
            )
          ) {
            return yield* new ConflictError({
              message: "Imported media must be an image, audio, video, or PDF",
              resource: "media",
            });
          }
          const contentLength = Number(
            source.headers.get("content-length") ?? 0
          );
          if (contentLength > MAX_IMPORT_BYTES) {
            return yield* new ConflictError({
              message: "Imported media exceeds the 250 MB limit",
              resource: "media",
            });
          }
          if (!source.body) {
            return yield* new ConflictError({
              message: "Media source returned an empty body",
              resource: "media",
            });
          }
          const filename =
            input.filename ??
            decodeURIComponent(sourceUrl.pathname.split("/").at(-1) || "media");
          const [upload] = yield* createUploads({
            workspaceId: input.workspaceId,
            billingOwnerUserId: input.billingOwnerUserId,
            files: [{ filename, contentType, altText: input.altText }],
          });
          if (input.idempotencyKey) {
            yield* sql`UPDATE media_imports SET media_id = ${upload.mediaId}
              WHERE workspace_id = ${input.workspaceId}
                AND idempotency_key = ${input.idempotencyKey}`.pipe(
              Effect.orDie
            );
          }
          let received = 0;
          const reader = source.body.getReader();
          const limited = new ReadableStream<Uint8Array>({
            async pull(controller) {
              const next = await reader.read();
              if (next.done) {
                controller.close();
                return;
              }
              received += next.value.byteLength;
              if (received > MAX_IMPORT_BYTES) {
                controller.error(new Error("Imported media exceeds 250 MB"));
                await reader.cancel();
                return;
              }
              controller.enqueue(next.value);
            },
            cancel: () => reader.cancel(),
          });
          const uploaded = yield* Effect.tryPromise({
            try: () =>
              fetch(upload.uploadUrl, {
                method: "PUT",
                headers: { "content-type": contentType },
                body: limited,
              }),
            catch: () =>
              new ConflictError({
                message: "Media upload failed",
                resource: "media",
              }),
          });
          if (!uploaded.ok) {
            return yield* new ConflictError({
              message: `Media upload returned ${uploaded.status}`,
              resource: "media",
            });
          }
          if (input.idempotencyKey) {
            yield* sql`UPDATE media SET import_key = ${input.idempotencyKey}
              WHERE id = ${upload.mediaId}`.pipe(Effect.orDie);
          }
          const completed = yield* complete({
            workspaceId: input.workspaceId,
            billingOwnerUserId: input.billingOwnerUserId,
            mediaIds: [upload.mediaId],
          }).pipe(
            Effect.mapError(
              (cause) =>
                new ConflictError({
                  message: cause.message,
                  resource: "media",
                })
            )
          );
          if (input.idempotencyKey) {
            yield* sql`UPDATE media_imports SET status = 'completed', error = NULL
              WHERE workspace_id = ${input.workspaceId}
                AND idempotency_key = ${input.idempotencyKey}`.pipe(
              Effect.orDie
            );
          }
          return completed[0] as MediaOutput;
        }
      );
      const remove = Effect.fn("MediaService.remove")(function* (
        workspaceId: WorkspaceId,
        mediaId: string
      ) {
        const rows = yield* sql<{
          id: string;
        }>`SELECT id FROM media WHERE id = ${mediaId}
          AND workspace_id = ${workspaceId} AND deleted_at IS NULL`.pipe(
          Effect.orDie
        );
        if (rows.length === 0) {
          return yield* new NotFoundError({
            message: "Media not found",
            resource: "media",
          });
        }
        yield* jobs.enqueue({
          workspaceId,
          payload: {
            _tag: "ReclaimMedia",
            mediaId: mediaId as typeof MediaId.Type,
          },
          runAt: new Date(),
          idempotencyKey: `reclaim-media:${mediaId}`,
        });
      });
      return MediaService.of({
        list,
        get,
        createUploads,
        complete,
        importFromUrl,
        remove,
      });
    })
  );
}
