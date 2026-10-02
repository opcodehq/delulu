import { readFile } from "node:fs/promises";
import { getConnection } from "@delulu/connections";
import {
  JobId,
  MediaId,
  makeId,
  makeTokenCipher,
  normalizePostgresUrl,
  PostGroupId,
  PostId,
  PostTargetId,
  TokenCipher,
} from "@delulu/core";
import {
  SocialPublishInputSchema,
  type SocialPublishInputType,
} from "@delulu/core/publishing/post";
import { JobService, JobTransport } from "@delulu/services";
import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { publishTarget } from "./publish-target";
import { resolveMediaUrls } from "./resolve-media-urls";

const REQUIRED_CASES = [
  "instagram-reel",
  "instagram-carousel",
  "instagram-single-image",
  "instagram-multi-image",
  "twitter-single-text",
  "twitter-thread",
  "twitter-video",
  "twitter-multiple-images",
  "twitter-single-image",
  "linkedin-pdf",
  "linkedin-ppt",
  "linkedin-image",
  "linkedin-video",
  "tiktok-video",
  "tiktok-photo-carousel",
] as const;
const PDF_URL = /\.pdf(?:$|[?#])/i;
const PPT_URL = /\.pptx?(?:$|[?#])/i;
const PNG_URL = /\.png(?:$|[?#])/i;
const RUN_ID = /^[a-zA-Z0-9_-]{6,80}$/;
const HTTPS_URL = /^https:\/\//;

const PublishablePlatform = z.enum([
  "INSTAGRAM",
  "TWITTER",
  "LINKEDIN",
  "TIKTOK",
]);
const LiveCase = z.object({
  name: z.enum(REQUIRED_CASES),
  platform: PublishablePlatform,
  connectionId: z.string().min(1),
  content: SocialPublishInputSchema,
});
const LiveManifest = z.object({ cases: z.array(LiveCase) });
type LiveCase = z.infer<typeof LiveCase>;

const enabled = process.env.DELULU_LIVE_PUBLISH === "CONFIRM";
const liveDescribe = enabled ? describe : describe.skip;

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for live publishing`);
  }
  return value;
};

const selectedCaseNames = (): (typeof REQUIRED_CASES)[number][] => {
  const configured = process.env.DELULU_LIVE_CASES;
  if (!configured) {
    return [...REQUIRED_CASES];
  }
  const names = configured
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter(
    (name) => !REQUIRED_CASES.includes(name as (typeof REQUIRED_CASES)[number])
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown live publishing cases: ${unknown.join(", ")}`);
  }
  if (names.length === 0) {
    throw new Error("DELULU_LIVE_CASES must select at least one case");
  }
  return [...new Set(names)] as (typeof REQUIRED_CASES)[number][];
};

const mediaTypes = (entry: LiveCase) =>
  entry.content.content.flatMap((segment) =>
    segment.media.map((media) => media.mediaType)
  );

const assertCaseShape = (entry: LiveCase): void => {
  const types = mediaTypes(entry);
  const segments = entry.content.content.length;
  const expectedPlatform = entry.name.split("-")[0]?.toUpperCase();
  if (entry.platform !== expectedPlatform) {
    throw new Error(`${entry.name} must use ${expectedPlatform}`);
  }
  const exact = (type: "IMAGE" | "VIDEO" | "DOCUMENT", count: number) =>
    types.length === count && types.every((value) => value === type);
  const multiple = (type: "IMAGE" | "VIDEO" | "DOCUMENT") =>
    types.length >= 2 && types.every((value) => value === type);

  const valid = (() => {
    switch (entry.name) {
      case "instagram-reel":
      case "twitter-video":
      case "linkedin-video":
      case "tiktok-video":
        return segments === 1 && exact("VIDEO", 1);
      case "instagram-carousel":
      case "instagram-multi-image":
      case "twitter-multiple-images":
      case "tiktok-photo-carousel":
        return segments === 1 && multiple("IMAGE");
      case "instagram-single-image":
      case "twitter-single-image":
      case "linkedin-image":
        return segments === 1 && exact("IMAGE", 1);
      case "twitter-single-text":
        return segments === 1 && types.length === 0;
      case "twitter-thread":
        return segments >= 2;
      case "linkedin-pdf":
        return (
          segments === 1 &&
          exact("DOCUMENT", 1) &&
          PDF_URL.test(entry.content.content[0]?.media[0]?.url ?? "")
        );
      case "linkedin-ppt":
        return (
          segments === 1 &&
          exact("DOCUMENT", 1) &&
          PPT_URL.test(entry.content.content[0]?.media[0]?.url ?? "")
        );
      default:
        return false;
    }
  })();
  if (!valid) {
    throw new Error(`${entry.name} does not contain its required media shape`);
  }
  for (const segment of entry.content.content) {
    const validation = getConnection(entry.platform).rules.validate(segment);
    if (!validation.valid) {
      throw new Error(`${entry.name}: ${validation.errors.join("; ")}`);
    }
  }
  if (
    entry.platform === "TIKTOK" &&
    entry.content.providerSettings?.type !== "TIKTOK"
  ) {
    throw new Error(`${entry.name} requires TikTok provider settings`);
  }
  for (const segment of entry.content.content) {
    for (const media of segment.media) {
      if (
        !(media.url && URL.canParse(media.url)) ||
        new URL(media.url).protocol !== "https:"
      ) {
        throw new Error(
          `${entry.name} contains media without a valid HTTPS URL`
        );
      }
    }
  }
};

const preflightMedia = async (manifest: z.infer<typeof LiveManifest>) => {
  const prepared = structuredClone(manifest);
  await Promise.all(
    prepared.cases.map((entry) => resolveMediaUrls(entry.content))
  );
  const media = new Map<string, "IMAGE" | "VIDEO" | "DOCUMENT">();
  for (const entry of prepared.cases) {
    for (const segment of entry.content.content) {
      for (const item of segment.media) {
        media.set(item.url as string, item.mediaType);
      }
    }
  }
  await Promise.all(
    [...media].map(async ([url, type]) => {
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`Live media preflight failed (${response.status})`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      const validType =
        (type === "IMAGE" && contentType.startsWith("image/")) ||
        (type === "VIDEO" && contentType.startsWith("video/")) ||
        (type === "DOCUMENT" &&
          (contentType.startsWith("application/") ||
            contentType === "binary/octet-stream"));
      if (!validType) {
        throw new Error(
          "Live media preflight returned an invalid content type"
        );
      }
    })
  );
};

const mimeType = (url: string, type: "IMAGE" | "VIDEO" | "DOCUMENT") => {
  if (type === "IMAGE") {
    return PNG_URL.test(url) ? "image/png" : "image/jpeg";
  }
  if (type === "VIDEO") {
    return "video/mp4";
  }
  if (PDF_URL.test(url)) {
    return "application/pdf";
  }
  return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
};

const loadManifest = async (path: string | URL) =>
  LiveManifest.parse(JSON.parse(await readFile(path, "utf8")));

const requiresPublicUrl = (entry: LiveCase) =>
  !(
    entry.platform === "TIKTOK" &&
    entry.content.providerSettings?.type === "TIKTOK" &&
    entry.content.providerSettings.settings.privacy === "SELF_ONLY"
  );

describe("live publishing manifest contract", () => {
  it("provides every required case with the correct platform and media shape", async () => {
    const manifest = await loadManifest(
      new URL("./live-publishing.manifest.example.json", import.meta.url)
    );
    expect(manifest.cases.map((entry) => entry.name).sort()).toEqual(
      [...REQUIRED_CASES].sort()
    );
    for (const entry of manifest.cases) {
      expect(() => assertCaseShape(entry)).not.toThrow();
    }
  });
});

describe("live publishing case selection", () => {
  const configuredLiveCases = process.env.DELULU_LIVE_CASES;

  afterEach(() => {
    if (configuredLiveCases === undefined) {
      Reflect.deleteProperty(process.env, "DELULU_LIVE_CASES");
    } else {
      process.env.DELULU_LIVE_CASES = configuredLiveCases;
    }
  });

  it("runs the complete matrix when no subset is configured", () => {
    Reflect.deleteProperty(process.env, "DELULU_LIVE_CASES");
    expect(selectedCaseNames()).toEqual(REQUIRED_CASES);
  });

  it("deduplicates an explicit subset without adding unselected platforms", () => {
    process.env.DELULU_LIVE_CASES = "linkedin-pdf,tiktok-video,linkedin-pdf";
    expect(selectedCaseNames()).toEqual(["linkedin-pdf", "tiktok-video"]);
  });

  it("rejects empty and unknown selections", () => {
    process.env.DELULU_LIVE_CASES = " , ";
    expect(() => selectedCaseNames()).toThrow(
      "DELULU_LIVE_CASES must select at least one case"
    );
    process.env.DELULU_LIVE_CASES = "linkedin-pdf,unknown-case";
    expect(() => selectedCaseNames()).toThrow(
      "Unknown live publishing cases: unknown-case"
    );
  });
});

liveDescribe("explicit production-account publishing matrix", () => {
  it("publishes every required format through the persisted worker workflow", async () => {
    if (
      !(
        process.env.DELULU_LIVE_ENCRYPTION_SECRET ||
        process.env.ENCRYPTION_SECRET
      )
    ) {
      throw new Error(
        "DELULU_LIVE_ENCRYPTION_SECRET or ENCRYPTION_SECRET is required for live publishing"
      );
    }
    const databaseUrl = requiredEnv("DELULU_LIVE_DATABASE_URL");
    const clerkUserId = requiredEnv("DELULU_LIVE_CLERK_USER_ID");
    const runId = requiredEnv("DELULU_LIVE_RUN_ID");
    if (!RUN_ID.test(runId)) {
      throw new Error("DELULU_LIVE_RUN_ID must be a stable unique identifier");
    }
    const manifest = await loadManifest(requiredEnv("DELULU_LIVE_MANIFEST"));
    const selected = selectedCaseNames();
    const cases = manifest.cases.filter((entry) =>
      selected.includes(entry.name)
    );
    const names = cases.map((entry) => entry.name).sort();
    expect(names).toEqual([...selected].sort());
    for (const entry of cases) {
      assertCaseShape(entry);
    }
    await preflightMedia({ cases });

    const Pg = PgClient.layer({
      url: Redacted.make(normalizePostgresUrl(databaseUrl)),
      maxConnections: 3,
    });

    const PublishPg = PgClient.layer({
      url: Redacted.make(normalizePostgresUrl(databaseUrl)),
      transformQueryNames: EffectString.camelToSnake,
      transformResultNames: EffectString.snakeToCamel,
      transformJson: false,
    });
    const Transport = Layer.succeed(
      JobTransport,
      JobTransport.of({
        prepare: async (intent) => {
          const url = new URL("/internal/jobs", requiredEnv("SCHEDULER_URL"));
          if (url.protocol !== "https:") {
            throw new Error("Scheduler requires HTTPS");
          }
          const response = await fetch(url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${requiredEnv("SCHEDULER_SECRET")}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(intent),
          });
          if (!response.ok) {
            throw new Error(`Scheduler returned ${response.status}`);
          }
        },
      })
    );
    const PublishLayer = Layer.mergeAll(
      PublishPg,
      Layer.succeed(
        TokenCipher,
        TokenCipher.of(
          makeTokenCipher(
            process.env.DELULU_LIVE_ENCRYPTION_SECRET ||
              requiredEnv("ENCRYPTION_SECRET")
          )
        )
      ),
      JobService.layer.pipe(Layer.provide([PublishPg, Transport]))
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const connectionIds = [
          ...new Set(cases.map((entry) => entry.connectionId)),
        ];
        const connections = yield* sql<{
          id: string;
          platform: string;
          workspaceId: string;
          memberId: string;
        }>`
          SELECT c.id, c.platform, c.workspace_id AS "workspaceId",
                 wm.id AS "memberId"
          FROM connections c
          JOIN workspaces w ON w.id = c.workspace_id
          JOIN users u ON u.id = w.billing_owner_user_id
          JOIN workspace_members wm
            ON wm.workspace_id = w.id AND wm.user_id = u.id AND wm.role = 'owner'
          WHERE c.id IN ${sql.in(connectionIds)}
            AND u.external_id = ${clerkUserId}
            AND w.is_personal = true`;
        const allowed = new Map(connections.map((row) => [row.id, row]));

        // Finish authorization and format preflight before creating any records.
        for (const entry of cases) {
          const connection = allowed.get(entry.connectionId);
          if (!connection || connection.platform !== entry.platform) {
            throw new Error(
              `${entry.name} must reference an explicit matching connection in the user's personal workspace`
            );
          }
        }

        const work = yield* sql.withTransaction(
          Effect.gen(function* () {
            const seeded: Array<{
              name: string;
              jobId: string;
              targetId: string;
              workspaceId: string;
            }> = [];
            for (const entry of cases) {
              const connection = allowed.get(entry.connectionId);
              if (!connection) {
                throw new Error("Authorized connection disappeared");
              }
              const externalId = `live:${runId}:${entry.name}`;
              const existing = yield* sql<{
                jobId: string;
                targetId: string;
                targetStatus: string;
                workspaceId: string;
                platformPostId: string | null;
                platformPostUrl: string | null;
              }>`
                SELECT t.id AS "jobId", t.id AS "targetId", p.workspace_id AS "workspaceId",
                       t.status AS "targetStatus",
                       t.platform_post_id AS "platformPostId",
                       t.platform_post_url AS "platformPostUrl"
                FROM posts p
                JOIN post_targets t ON t.post_id = p.id
                WHERE p.external_submission_id = ${externalId}
                  AND p.workspace_id = ${connection.workspaceId}
                  AND t.connection_id = ${entry.connectionId}`;
              if (existing[0]) {
                if (existing[0].targetStatus === "published") {
                  if (
                    !(
                      existing[0].platformPostId &&
                      (!requiresPublicUrl(entry) ||
                        existing[0].platformPostUrl?.startsWith("https://"))
                    )
                  ) {
                    throw new Error(
                      `${entry.name} has an incomplete persisted result in run ${runId}`
                    );
                  }
                  continue;
                }
                if (existing[0].targetStatus === "failed") {
                  throw new Error(
                    `${entry.name} previously failed in run ${runId}; inspect it before starting a new run`
                  );
                }
                seeded.push({ name: entry.name, ...existing[0] });
                continue;
              }

              const postId = makeId(PostId);
              const targetId = makeId(PostTargetId);
              const jobId = makeId(JobId);
              const groupId = makeId(PostGroupId);
              const segments = [];
              for (const segment of entry.content.content) {
                const mediaReferences = [];
                for (const media of segment.media) {
                  const mediaId = makeId(MediaId);
                  const url = media.url as string;
                  yield* sql`INSERT INTO media
                    (id, workspace_id, bucket_key, url, media_type, mime_type,
                     size_bytes, duration_seconds, alt_text, thumbnails, status)
                    VALUES (${mediaId}, ${connection.workspaceId},
                      ${media.bucketKey ?? `live/${runId}/${entry.name}/${mediaId}`},
                      ${url}, ${media.mediaType.toLowerCase()},
                      ${mimeType(url, media.mediaType)}, 0,
                      ${media.durationSeconds ?? null}, ${media.altText ?? null},
                      ${JSON.stringify(media.thumbnailBucketUrl ? [media.thumbnailBucketUrl] : [])}::jsonb,
                      'ready')`;
                  mediaReferences.push({
                    id: mediaId,
                    altText: media.altText,
                    thumbnailTimestamp: media.thumbnailTimestamp,
                  });
                }
                segments.push({
                  text: segment.text,
                  media: mediaReferences,
                  delayMinutes: 0,
                });
              }
              const content = {
                groups: [{ id: groupId, isDefault: true, segments }],
              };
              const settings = {
                platform: entry.platform,
                values: {
                  ...(getConnection(entry.platform).settings.defaults as Record<
                    string,
                    unknown
                  >),
                  ...(entry.content.providerSettings?.settings ?? {}),
                },
              };
              yield* sql`INSERT INTO posts
                (id, workspace_id, status, content, created_by_member_id, source,
                 external_submission_id)
                VALUES (${postId}, ${connection.workspaceId}, 'scheduled',
                  ${JSON.stringify(content)}::jsonb, ${connection.memberId}, 'api',
                  ${externalId})`;
              yield* sql`INSERT INTO post_targets
                (id, post_id, connection_id, group_id, settings, status)
                VALUES (${targetId}, ${postId}, ${entry.connectionId}, ${groupId},
                  ${JSON.stringify(settings)}::jsonb, 'pending')`;
              seeded.push({
                name: entry.name,
                jobId,
                targetId,
                workspaceId: connection.workspaceId,
              });
            }
            return seeded;
          })
        );

        for (const item of work) {
          yield* Effect.tryPromise(() =>
            publishTarget(
              {
                id: item.jobId,
                workspaceId: item.workspaceId,
                payload: {
                  _tag: "PublishTarget",
                  targetId: item.targetId as PostTargetId,
                },
                runAt: Date.now(),
                maxAttempts: 1,
              },
              PublishLayer
            )
          );
          const result = yield* sql<{
            status: string;
            platformPostId: string | null;
            platformPostUrl: string | null;
            error: string | null;
          }>`SELECT status, platform_post_id AS "platformPostId",
                   platform_post_url AS "platformPostUrl", error
              FROM post_targets WHERE id = ${item.targetId}`;
          const target = result[0];
          if (target?.status !== "published") {
            throw new Error(
              `${item.name} failed: ${target?.error ?? "unknown"}`
            );
          }
          expect(target.platformPostId, item.name).toBeTruthy();
          const entry = cases.find((value) => value.name === item.name);
          if (!entry) {
            throw new Error(`Missing manifest case ${item.name}`);
          }
          if (requiresPublicUrl(entry)) {
            expect(target.platformPostUrl, item.name).toMatch(HTTPS_URL);
          }
        }
      }).pipe(Effect.provide(Pg))
    );
  });
});
