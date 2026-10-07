import type { runPublish } from "@delulu/connections/worker";
import {
  AutomationId,
  ConnectionId,
  JobId,
  MediaId,
  MemberId,
  makeId,
  makeTokenCipher,
  PostGroupId,
  PostId,
  PostTargetId,
  SubscriptionId,
  TokenCipher,
  UserId,
  WorkspaceId,
} from "@delulu/core";
import { JobService } from "@delulu/services";
import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect, it } from "vitest";
import { publishTarget } from "./publish-target";

const followups: unknown[] = [];
const execute = (
  seeded: { jobId: string; targetId: PostTargetId; workspaceId: string },
  runner: typeof runPublish
) =>
  publishTarget(
    {
      id: seeded.jobId,
      workspaceId: seeded.workspaceId,
      payload: { _tag: "PublishTarget", targetId: seeded.targetId },
      runAt: Date.now(),
      maxAttempts: 5,
    },
    Layer.mergeAll(
      Pg,
      Layer.succeed(
        TokenCipher,
        TokenCipher.of(makeTokenCipher("integration-key"))
      ),
      Layer.succeed(
        JobService,
        JobService.of({
          enqueue: (input) =>
            Effect.sync(() => {
              followups.push(input);
              return crypto.randomUUID();
            }),
          cancel: () => Effect.void,
        })
      )
    ),
    runner
  );

const Pg = PgClient.layer({
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: false,
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
});

const seed = (text: string, withThumbnail = false) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const userId = makeId(UserId);
      const workspaceId = makeId(WorkspaceId);
      const memberId = makeId(MemberId);
      const connectionId = makeId(ConnectionId);
      const postId = makeId(PostId);
      const targetId = makeId(PostTargetId);
      const jobId = makeId(JobId);
      const groupId = makeId(PostGroupId);
      const mediaId = makeId(MediaId);
      const thumbnailMediaId = makeId(MediaId);
      yield* sql`INSERT INTO users (id, external_id) VALUES (${userId}, ${`worker-${crypto.randomUUID()}`})`;
      yield* sql`INSERT INTO workspaces (id, name, billing_owner_user_id, is_personal) VALUES (${workspaceId}, 'Worker', ${userId}, true)`;
      yield* sql`INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (${memberId}, ${workspaceId}, ${userId}, 'owner')`;
      yield* sql`INSERT INTO subscriptions (id, billing_owner_user_id, plan, status) VALUES (${makeId(SubscriptionId)}, ${userId}, 'VIBE', 'active')`;
      yield* sql`INSERT INTO connections (id, workspace_id, platform, profile_id, access_token) VALUES (${connectionId}, ${workspaceId}, 'TWITTER', ${crypto.randomUUID()}, 'unused')`;
      if (withThumbnail) {
        yield* sql`INSERT INTO media (id, workspace_id, bucket_key, url, media_type, mime_type, size_bytes, status)
          VALUES (${mediaId}, ${workspaceId}, 'video.mp4', 'https://example.test/video.mp4', 'video', 'video/mp4', 100, 'ready'),
                 (${thumbnailMediaId}, ${workspaceId}, 'cover.jpg', 'https://example.test/cover.jpg', 'image', 'image/jpeg', 10, 'ready')`;
      }
      yield* sql`INSERT INTO posts (id, workspace_id, status, content, created_by_member_id, source)
    VALUES (${postId}, ${workspaceId}, 'scheduled', ${JSON.stringify({ groups: [{ id: groupId, isDefault: true, segments: [{ text, media: withThumbnail ? [{ id: mediaId, thumbnailMediaId }] : [] }] }] })}::jsonb, ${memberId}, 'api')`;
      yield* sql`INSERT INTO post_targets (id, post_id, connection_id, group_id, settings, status)
      VALUES (${targetId}, ${postId}, ${connectionId}, ${groupId}, ${JSON.stringify({ platform: "TWITTER", values: {} })}::jsonb, 'pending')`;
      return {
        sql,
        connectionId,
        workspaceId,
        jobId,
        targetId,
        postId,
        mediaId,
        thumbnailMediaId,
      };
    }).pipe(Effect.provide(Pg))
  );

describe("Durable publish outcomes", () => {
  it.each([
    false,
    true,
  ])("resolves pending automation targets without publishing twice (saved outcome: %s)", async (savedOutcome) => {
    const seeded = await seed("pending automation target", true);
    const automationId = makeId(AutomationId);
    const otherPostId = makeId(PostId);
    const triggers = [
      {
        id: "trigger_pending",
        type: "trigger",
        triggerType: "comment",
        targetMode: "specific",
        targetPostIds: ["remote-existing"],
        pendingPostIds: [seeded.postId, otherPostId],
      },
      {
        id: "trigger_other",
        type: "trigger",
        triggerType: "comment",
        targetMode: "specific",
        targetPostIds: ["remote-other"],
        pendingPostIds: [otherPostId],
      },
    ];
    const result = {
      platformPostId: "remote-automation",
      platformPostUrl: "https://example.test/remote-automation",
      platformId: "INSTAGRAM",
      postId: seeded.postId,
      postedAt: new Date(),
    };
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE connections SET platform = 'INSTAGRAM' WHERE id = ${seeded.connectionId}`;
        yield* sql`INSERT INTO automations
            (id, workspace_id, connection_id, platform, category, triggers)
            VALUES (${automationId}, ${seeded.workspaceId}, ${seeded.connectionId}, 'instagram', 'dm', ${JSON.stringify(triggers)}::jsonb)`;
        if (savedOutcome) {
          yield* sql`UPDATE post_targets SET status = 'publishing',
              provider_state = ${JSON.stringify({ executionOutcome: { status: "PUBLISHED", result } })}::jsonb
              WHERE id = ${seeded.targetId}`;
        }
      }).pipe(Effect.provide(Pg))
    );
    const followupsBefore = followups.length;
    let calls = 0;
    const publisher: typeof runPublish = async () => {
      calls++;
      return { status: "PUBLISHED", result };
    };
    await execute(seeded, publisher);
    await execute(seeded, publisher);
    expect(calls).toBe(savedOutcome ? 0 : 1);

    const state = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const targets = yield* sql<{
          status: string;
          postStatus: string;
          platformPostId: string;
        }>`
            SELECT t.status, p.status AS post_status, t.platform_post_id
            FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.id = ${seeded.targetId}`;
        const automations = yield* sql<{ triggers: typeof triggers }>`
            SELECT triggers FROM automations WHERE id = ${automationId}`;
        const index = yield* sql<{ mediaId: string; enabled: boolean }>`
            SELECT media_id, enabled FROM automation_trigger_index WHERE automation_id = ${automationId}`;
        return { target: targets[0], automation: automations[0], index };
      }).pipe(Effect.provide(Pg))
    );
    expect(state.target).toMatchObject({
      status: "published",
      postStatus: "published",
      platformPostId: result.platformPostId,
    });
    expect(state.automation.triggers).toEqual([
      {
        ...triggers[0],
        targetPostIds: ["remote-existing", result.platformPostId],
        pendingPostIds: [otherPostId],
      },
      triggers[1],
    ]);
    expect(state.index).toEqual([
      { mediaId: result.platformPostId, enabled: true },
    ]);
    expect(followups.slice(followupsBefore)).toContainEqual(
      expect.objectContaining({
        workspaceId: seeded.workspaceId,
        payload: expect.objectContaining({
          _tag: "RepairAutomation",
          mediaId: result.platformPostId,
        }),
      })
    );
  });

  it("passes a post-specific thumbnail image to the publisher", async () => {
    const seeded = await seed("publish with cover", true);
    let receivedThumbnail: string | undefined;
    await execute(seeded, async (_platform, context) => {
      receivedThumbnail =
        context.content.content[0]?.media[0]?.thumbnailBucketUrl;
      return {
        status: "PUBLISHED",
        result: {
          platformPostId: "remote-cover",
          platformPostUrl: "https://example.test/remote-cover",
          platformId: "TWITTER",
          postId: seeded.postId,
          postedAt: new Date(),
        },
      };
    });

    expect(receivedThumbnail).toBe("https://example.test/cover.jpg");
  });

  it("records success transactionally and ignores duplicate delivery", async () => {
    const seeded = await seed("publish me");
    let calls = 0;
    const publish = async () => {
      calls += 1;
      return {
        status: "PUBLISHED" as const,
        result: {
          platformPostId: "remote-1",
          platformPostUrl: "https://example.test/remote-1",
          platformId: "INSTAGRAM",
          postId: seeded.postId,
          postedAt: new Date(),
        },
      };
    };
    const body = JSON.stringify({
      jobId: seeded.jobId,
      targetId: seeded.targetId,
    });
    await execute(seeded, publish);
    await execute(seeded, publish);
    const state = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          target: string;
          job: string;
          post: string;
        }>`SELECT t.status AS target, p.status AS post
        FROM post_targets t JOIN posts p ON p.id = t.post_id WHERE t.id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    expect(calls).toBe(1);
    expect(state[0]).toMatchObject({
      target: "published",
      post: "published",
    });
  });

  it("records permanent platform validation failures", async () => {
    const seeded = await seed("x".repeat(5000));
    await execute(seeded, async () => {
      throw new Error("publisher must not run");
    });
    const state = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          target: string;
          job: string;
        }>`SELECT t.status AS target FROM post_targets t WHERE t.id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    expect(state[0]).toMatchObject({ target: "failed" });
  });

  it("keeps retryable publish failures eligible for DO retry", async () => {
    const seeded = await seed("retry me");
    await expect(
      execute(seeded, async () => ({
        status: "FAILED",
        message: "temporary outage",
        retryable: true,
      }))
    ).rejects.toThrow("Retryable publish failure");
    const state = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          target: string;
          job: string;
        }>`SELECT t.status AS target FROM post_targets t WHERE t.id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    expect(state[0]).toMatchObject({ target: "pending" });
  });

  it("persists provider progress so a redelivery can resume without duplicates", async () => {
    const seeded = await seed("first segment\nsecond segment");
    const body = JSON.stringify({
      jobId: seeded.jobId,
      targetId: seeded.targetId,
    });

    await expect(
      execute(seeded, async (_platform, context) => {
        expect(context.providerState).toEqual({});
        await context.persistProviderState?.({
          publishedSegmentIds: ["remote-1"],
        });
        return {
          status: "FAILED",
          message: "temporary outage after first segment",
          retryable: true,
        };
      })
    ).rejects.toThrow("Retryable publish failure");

    await execute(seeded, async (_platform, context) => {
      expect(context.providerState).toMatchObject({
        publishedSegmentIds: ["remote-1"],
      });
      await context.persistProviderState?.({
        publishedSegmentIds: ["remote-1", "remote-2"],
      });
      return {
        status: "PUBLISHED",
        result: {
          platformPostId: "remote-1",
          platformPostUrl: "https://example.test/remote-1",
          platformId: "TWITTER",
          postId: seeded.postId,
          postedAt: new Date(),
        },
      };
    });

    const state = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          providerState: Record<string, unknown>;
          status: string;
        }>`SELECT provider_state AS "providerState", status
          FROM post_targets WHERE id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    expect(state[0]).toMatchObject({
      providerState: expect.objectContaining({
        publishedSegmentIds: ["remote-1", "remote-2"],
      }),
      status: "published",
    });
  });

  it("does not publish a removed target", async () => {
    const seeded = await seed("cancel me");
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`DELETE FROM post_targets WHERE id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    let calls = 0;
    await execute(seeded, async () => {
      calls += 1;
      return { status: "FAILED", message: "must not run", retryable: false };
    });
    expect(calls).toBe(0);
  });
  it("finalizes a saved publication after its media disappears", async () => {
    const seeded = await seed("confirmed with deleted media", true);
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE media SET deleted_at = now() WHERE id = ${seeded.mediaId}`;
        yield* sql`UPDATE post_targets SET status = 'publishing', provider_state = ${JSON.stringify(
          {
            executionOutcome: {
              status: "PUBLISHED",
              result: {
                platformPostId: "confirmed",
                platformPostUrl: "https://example.test/confirmed",
                platformId: "TWITTER",
                postId: seeded.postId,
                postedAt: new Date(),
              },
            },
          }
        )}::jsonb WHERE id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    await execute(seeded, async () => {
      throw new Error("must not publish twice");
    });
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{
          status: string;
        }>`SELECT status FROM post_targets WHERE id = ${seeded.targetId}`;
      }).pipe(Effect.provide(Pg))
    );
    expect(rows[0].status).toBe("published");
  });
});
