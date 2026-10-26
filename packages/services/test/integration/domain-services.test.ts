import {
  Connection,
  ConnectionId,
  makeConnectionRepository,
  makeId,
  makeTokenCipher,
  PostGroupId,
  TokenCipher,
} from "@delulu/core";
import { PgClient } from "@effect/sql-pg";
import {
  Effect,
  String as EffectString,
  Layer,
  Option,
  Redacted,
} from "effect";
import { SqlClient } from "effect/unstable/sql";
import { beforeAll, describe, expect, it } from "vitest";
import { AutomationKvService } from "../../src/automation-kv";
import {
  ConnectionStateConfig,
  ConnectionStateService,
  ConnectionsService,
} from "../../src/connections";
import { IdentityService } from "../../src/identity";
import { type JobIntent, JobTransport } from "../../src/job-transport";
import { JobService } from "../../src/jobs";

const intents: JobIntent[] = [];
let rejectCancellation = false;

import { LifecycleService } from "../../src/lifecycle";
import { MembershipService } from "../../src/membership";
import { PostService } from "../../src/posts";
import { ReviewService } from "../../src/reviews";

const Pg = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: true,
});

let AppLayer: Layer.Layer<
  | IdentityService
  | MembershipService
  | JobService
  | PostService
  | ReviewService
  | ConnectionsService
  | PgClient.PgClient
>;

beforeAll(() => {
  const Jobs = JobService.layer.pipe(
    Layer.provide(
      Layer.succeed(
        JobTransport,
        JobTransport.of({
          prepare: async (intent) => {
            if (rejectCancellation && intent.job === null) {
              throw new Error("scheduler unavailable");
            }
            intents.push(intent);
          },
        })
      )
    )
  );
  const Posts = PostService.layer.pipe(Layer.provide(Jobs));
  const Reviews = ReviewService.layer.pipe(Layer.provide(Jobs));
  const StateConfig = Layer.succeed(
    ConnectionStateConfig,
    ConnectionStateConfig.of({ secret: "integration-state-secret" })
  );
  const State = ConnectionStateService.layer.pipe(Layer.provide(StateConfig));
  const Cipher = Layer.succeed(
    TokenCipher,
    TokenCipher.of(makeTokenCipher("integration-encryption-secret"))
  );
  const TemporaryStore = AutomationKvService.memoryLayer();
  const Lifecycle = Layer.succeed(
    LifecycleService,
    LifecycleService.of({
      record: () => Effect.void,
      syncWorkspace: () => Effect.void,
      runScheduled: () => Effect.succeed(null),
    })
  );
  const Connections = ConnectionsService.layer.pipe(
    Layer.provide([State, Cipher, TemporaryStore, Lifecycle])
  );
  AppLayer = Layer.mergeAll(
    IdentityService.layer,
    MembershipService.layer,
    Jobs,
    Posts,
    Reviews,
    Connections
  ).pipe(Layer.provideMerge(Pg));
});

describe("M2 PostService and JobService", () => {
  it("atomically creates a scheduled post, target, and idempotent publish job", async () => {
    const externalSubmissionId = `submission-${crypto.randomUUID()}`;
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const memberships = yield* MembershipService;
      const posts = yield* PostService;
      const connectionRepo = yield* makeConnectionRepository();
      const resolved = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const workspaceId = resolved.personalWorkspace?.id;
      if (!workspaceId) {
        return yield* Effect.die("missing personal workspace");
      }
      const member = Option.getOrThrow(
        yield* memberships.resolve({ workspaceId, userId: resolved.user.id })
      );
      const connection = yield* connectionRepo.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId,
          platform: "INSTAGRAM",
          profileId: crypto.randomUUID(),
          username: "publisher",
          displayName: "Publisher",
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const groupId = makeId(PostGroupId);
      const value = {
        groups: [
          {
            id: groupId,
            isDefault: true,
            segments: [{ text: "Scheduled", media: [] }],
          },
        ],
        targets: [
          {
            connectionId: connection.id,
            groupId,
            settings: {
              platform: "INSTAGRAM" as const,
              values: {
                shareToFeed: true,
                shareToStory: false,
                trialReels: false,
                graduationStrategy: "MANUAL" as const,
              },
            },
            scheduledAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
        source: "api" as const,
        externalSubmissionId,
      };
      const actor = { memberId: member.memberId, role: member.role };
      const first = yield* posts.create({ workspaceId, actor, value });
      const second = yield* posts.create({ workspaceId, actor, value });
      const sql = yield* SqlClient.SqlClient;
      rejectCancellation = true;
      try {
        const removal = yield* posts
          .remove(workspaceId, first.id)
          .pipe(Effect.exit);
        expect(removal._tag).toBe("Failure");
      } finally {
        rejectCancellation = false;
      }
      const rows = yield* sql<{
        deletedAt: Date | null;
      }>`SELECT deleted_at FROM posts WHERE id = ${first.id}`;
      expect(rows[0].deletedAt).toBeNull();
      yield* posts.remove(workspaceId, first.id);
      const deleted = yield* sql<{
        deletedAt: Date | null;
      }>`SELECT deleted_at FROM posts WHERE id = ${first.id}`;
      expect(deleted[0].deletedAt).toBeInstanceOf(Date);
      return { first, second };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.first.id).toBe(result.second.id);
    expect(result.first.status).toBe("scheduled");
    expect(result.first.targets).toHaveLength(1);
  });

  it("atomically creates publish-now posts without replacing their target", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const memberships = yield* MembershipService;
      const posts = yield* PostService;
      const sql = yield* SqlClient.SqlClient;
      const connectionRepo = yield* makeConnectionRepository();
      const resolved = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const workspaceId = resolved.personalWorkspace?.id;
      if (!workspaceId) {
        return yield* Effect.die("missing personal workspace");
      }
      const member = Option.getOrThrow(
        yield* memberships.resolve({ workspaceId, userId: resolved.user.id })
      );
      const connection = yield* connectionRepo.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId,
          platform: "LINKEDIN",
          profileId: crypto.randomUUID(),
          username: "atomic-publisher",
          displayName: "Atomic Publisher",
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const groupId = makeId(PostGroupId);
      const actor = { memberId: member.memberId, role: member.role };
      const value = {
        groups: [
          {
            id: groupId,
            isDefault: true,
            segments: [{ text: "Publish exactly once", media: [] }],
          },
        ],
        targets: [
          {
            connectionId: connection.id,
            groupId,
            settings: {
              platform: "LINKEDIN" as const,
              values: { visibility: "PUBLIC" as const },
            },
            scheduledAt: null,
          },
        ],
        intent: "publish_now" as const,
        source: "api" as const,
        externalSubmissionId: `publish-once-${crypto.randomUUID()}`,
      };
      const created = yield* posts.create({
        workspaceId,
        actor,
        value,
      });
      const duplicateCreate = yield* posts.create({
        workspaceId,
        actor,
        value,
      });
      const repeated = yield* posts.publishNow({
        workspaceId,
        postId: created.id,
        actor,
      });
      const counts = yield* sql<{
        targets: string;
      }>`SELECT count(*)::text AS targets FROM post_targets WHERE post_id = ${created.id}`;
      return { created, duplicateCreate, repeated, counts: counts[0] };
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.created.status).toBe("publishing");
    expect(result.duplicateCreate.id).toBe(result.created.id);
    expect(result.duplicateCreate.targets[0]?.id).toBe(
      result.created.targets[0]?.id
    );
    expect(result.repeated.status).toBe("publishing");
    expect(result.repeated.targets[0]?.id).toBe(result.created.targets[0]?.id);
    expect(result.counts).toEqual({ targets: "1" });
    expect(
      intents.filter(
        (i) => i.key === `publish-target:${result.created.targets[0]?.id}`
      )
    ).toHaveLength(1);
  });

  it("rolls back the transaction witness when the business transaction aborts", async () => {
    const key = `rollback:${crypto.randomUUID()}`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const jobs = yield* JobService;
        const result = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* jobs.enqueue({
                workspaceId: "unused",
                payload: { _tag: "SweepPendingMedia" },
                runAt: new Date(),
                idempotencyKey: key,
              });
              return yield* Effect.fail("abort business transaction");
            })
          )
          .pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        const intent = intents.find((i) => i.key === key)!;
        expect(intent).toBeDefined();
        const rows =
          yield* sql`SELECT id FROM execution_receipts WHERE id = ${intent.receiptId}::uuid`;
        expect(rows).toHaveLength(0);
      }).pipe(Effect.provide(AppLayer))
    );
  });

  it("reschedules only missed targets when approving a delayed review", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const memberships = yield* MembershipService;
      const posts = yield* PostService;
      const reviews = yield* ReviewService;
      const sql = yield* SqlClient.SqlClient;
      const connectionRepo = yield* makeConnectionRepository();
      const resolved = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const workspaceId = resolved.personalWorkspace?.id;
      if (!workspaceId) {
        return yield* Effect.die("missing workspace");
      }
      const member = Option.getOrThrow(
        yield* memberships.resolve({ workspaceId, userId: resolved.user.id })
      );
      const connection = yield* connectionRepo.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId,
          platform: "INSTAGRAM",
          profileId: crypto.randomUUID(),
          username: "review-schedules",
          displayName: null,
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const secondConnection = yield* connectionRepo.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId,
          platform: "INSTAGRAM",
          profileId: crypto.randomUUID(),
          username: "review-schedules-future",
          displayName: null,
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const groupId = makeId(PostGroupId);
      const settings = {
        platform: "INSTAGRAM" as const,
        values: {
          shareToFeed: true,
          shareToStory: false,
          trialReels: false,
          graduationStrategy: "MANUAL" as const,
        },
      };
      const post = yield* posts.create({
        workspaceId,
        actor: { memberId: member.memberId, role: "editor" },
        value: {
          groups: [
            {
              id: groupId,
              isDefault: true,
              segments: [{ text: "Mixed schedules", media: [] }],
            },
          ],
          targets: [
            {
              connectionId: connection.id,
              groupId,
              settings,
              scheduledAt: new Date(Date.now() - 60_000).toISOString(),
            },
            {
              connectionId: secondConnection.id,
              groupId,
              settings,
              scheduledAt: future.toISOString(),
            },
          ],
          source: "api",
        },
      });
      yield* reviews.act({
        workspaceId,
        postId: post.id,
        memberId: member.memberId,
        role: "owner",
        action: { action: "approve", missedSlot: "publish_now" },
      });
      return yield* sql<{
        id: string;
        scheduledAt: Date | null;
      }>`SELECT id, scheduled_at FROM post_targets WHERE post_id = ${post.id}
          ORDER BY scheduled_at`;
    });
    const targets = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(targets).toHaveLength(2);
    expect(targets[0]?.scheduledAt?.getTime()).toBeLessThan(future.getTime());
    expect(targets[1]?.scheduledAt?.toISOString()).toBe(future.toISOString());
  });

  it("always routes editor scheduling through review without a publish job", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const memberships = yield* MembershipService;
      const posts = yield* PostService;
      const sql = yield* SqlClient.SqlClient;
      const connectionRepo = yield* makeConnectionRepository();
      const resolved = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const workspaceId = resolved.personalWorkspace?.id;
      if (!workspaceId) {
        return yield* Effect.die("missing workspace");
      }
      const member = Option.getOrThrow(
        yield* memberships.resolve({ workspaceId, userId: resolved.user.id })
      );
      const connection = yield* connectionRepo.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId,
          platform: "INSTAGRAM",
          profileId: crypto.randomUUID(),
          username: "editor-target",
          displayName: null,
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const groupId = makeId(PostGroupId);
      const post = yield* posts.create({
        workspaceId,
        actor: { memberId: member.memberId, role: "editor" },
        value: {
          groups: [
            {
              id: groupId,
              isDefault: true,
              segments: [{ text: "Needs approval", media: [] }],
            },
          ],
          targets: [
            {
              connectionId: connection.id,
              groupId,
              settings: {
                platform: "INSTAGRAM",
                values: {
                  shareToFeed: true,
                  shareToStory: false,
                  trialReels: false,
                  graduationStrategy: "MANUAL",
                },
              },
              scheduledAt: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
          source: "api",
        },
      });
      const queued = intents.filter(
        (i) =>
          i.key === `publish-target:${post.targets[0]?.id}` && i.job !== null
      ).length;
      yield* posts.updateTarget({
        workspaceId,
        postId: post.id,
        targetId: post.targets[0]?.id ?? "",
        scheduledAt: null,
        actor: { memberId: member.memberId, role: "editor" },
      });
      const reviews = yield* sql<{
        status: string;
      }>`SELECT status FROM post_reviews WHERE post_id = ${post.id}`;
      return {
        post,
        queued,
        reviewStatus: reviews[0]?.status,
      };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.post.status).toBe("pending_review");
    expect(result.queued).toBe(0);
    expect(result.reviewStatus).toBe("rejected");
  });

  it("moves an existing connection only after explicit transfer confirmation", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const connections = yield* ConnectionsService;
      const repository = yield* makeConnectionRepository();
      const source = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const destination = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      if (!(source.personalWorkspace && destination.personalWorkspace)) {
        return yield* Effect.die("missing workspaces");
      }
      const connection = yield* repository.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId: source.personalWorkspace.id,
          platform: "INSTAGRAM",
          profileId: crypto.randomUUID(),
          username: null,
          displayName: null,
          accessToken: "opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      yield* connections.confirmTransfer({
        connectionId: connection.id,
        sourceWorkspaceId: source.personalWorkspace.id,
        destinationWorkspaceId: destination.personalWorkspace.id,
      });
      return yield* connections.list(destination.personalWorkspace.id, 10, 0);
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.total).toBe(1);
  });

  it("moves a connection after the destination user proves provider ownership", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const connections = yield* ConnectionsService;
      const repository = yield* makeConnectionRepository();
      const source = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const destination = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      if (!(source.personalWorkspace && destination.personalWorkspace)) {
        return yield* Effect.die("missing workspaces");
      }
      const profileId = crypto.randomUUID();
      const connection = yield* repository.insert(
        Connection.insert.make({
          id: makeId(ConnectionId),
          legacyConvexId: null,
          workspaceId: source.personalWorkspace.id,
          platform: "INSTAGRAM",
          profileId,
          username: "creator",
          displayName: "Creator",
          accessToken: "old-opaque",
          refreshToken: null,
          cipherVersion: "v1",
          expiresAt: null,
          metadata: {},
        })
      );
      const auth = {
        userId: destination.user.id,
        credential: "session" as const,
        scopes: "full" as const,
      };
      const result = yield* connections.upsertFromOAuth(
        destination.personalWorkspace.id,
        {
          socialType: "INSTAGRAM",
          profileId,
          username: "creator",
          accessToken: "fresh-provider-token",
        },
        `u:${destination.user.id}`
      );
      if (!(result.status === "transfer_required" && result.transferToken)) {
        return yield* Effect.die("missing OAuth transfer grant");
      }
      const unauthorized = yield* connections
        .confirmOAuthTransfer({
          connectionId: connection.id,
          destinationWorkspaceId: destination.personalWorkspace.id,
          auth: {
            userId: source.user.id,
            credential: "session",
            scopes: "full",
          },
          transferToken: result.transferToken,
        })
        .pipe(Effect.result);
      yield* connections.confirmOAuthTransfer({
        connectionId: connection.id,
        destinationWorkspaceId: destination.personalWorkspace.id,
        auth,
        transferToken: result.transferToken,
      });
      const list = yield* connections.list(
        destination.personalWorkspace.id,
        10,
        0
      );
      return { list, unauthorized };
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    expect(result.unauthorized._tag).toBe("Failure");
    expect(result.list.total).toBe(1);
  });

  it("re-arms an explicitly rescheduled durable job", async () => {
    const program = Effect.gen(function* () {
      const identity = yield* IdentityService;
      const jobs = yield* JobService;
      const resolved = yield* identity.resolve({
        sub: `clerk_${crypto.randomUUID()}`,
      });
      const workspaceId = resolved.personalWorkspace?.id;
      if (!workspaceId) {
        return yield* Effect.die("missing workspace");
      }
      const key = `rearm-${crypto.randomUUID()}`;
      const id = yield* jobs.enqueue({
        workspaceId,
        payload: { _tag: "SweepPendingMedia" },
        runAt: new Date(Date.now() - 1000),
        idempotencyKey: key,
      });
      yield* jobs.cancel(key);
      yield* jobs.enqueue({
        workspaceId,
        payload: { _tag: "SweepPendingMedia" },
        runAt: new Date(Date.now() - 1000),
        idempotencyKey: key,
      });
      return { id, key };
    });
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );
    const mutations = intents.filter((i) => i.key === result.key);
    expect(mutations).toHaveLength(3);
    expect(mutations[1].job).toBeNull();
    expect(mutations[2].job?.id).not.toBe(result.id);
  });
});

describe("X publishing settings persistence", () => {
  it("preserves quotes and Articles, validates publishing, and permits incomplete drafts", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const identity = yield* IdentityService;
        const memberships = yield* MembershipService;
        const posts = yield* PostService;
        const connections = yield* makeConnectionRepository();
        const resolved = yield* identity.resolve({
          sub: `clerk_${crypto.randomUUID()}`,
        });
        const workspaceId = resolved.personalWorkspace!.id;
        const member = Option.getOrThrow(
          yield* memberships.resolve({ workspaceId, userId: resolved.user.id })
        );
        const actor = { memberId: member.memberId, role: member.role };
        const connection = yield* connections.insert(
          Connection.insert.make({
            id: makeId(ConnectionId),
            legacyConvexId: null,
            workspaceId,
            platform: "TWITTER",
            profileId: crypto.randomUUID(),
            username: "writer",
            displayName: "Writer",
            accessToken: "opaque",
            refreshToken: null,
            cipherVersion: "v1",
            expiresAt: null,
            metadata: {},
          })
        );
        const groupId = makeId(PostGroupId);
        for (const values of [
          {
            replyRestriction: "following" as const,
            quoteTweetId: "https://x.com/wiz/status/1234567890123456789",
          },
          {
            replyRestriction: "everyone" as const,
            format: "article" as const,
            articleTitle: "Article title",
          },
        ]) {
          const value = {
            groups: [
              {
                id: groupId,
                isDefault: true,
                segments: [{ text: "Body ".repeat(100), media: [] }],
              },
            ],
            targets: [
              {
                connectionId: connection.id,
                groupId,
                settings: { platform: "TWITTER" as const, values },
                scheduledAt: null,
              },
            ],
            intent: "draft" as const,
          };
          const saved = yield* posts.create({ workspaceId, actor, value });
          const read = yield* posts.get(workspaceId, saved.id);
          expect(read.targets[0]?.settings).toEqual({
            platform: "TWITTER",
            values,
          });
        }
        const incomplete = {
          groups: [
            {
              id: groupId,
              isDefault: true,
              segments: [{ text: "", media: [] }],
            },
          ],
          targets: [
            {
              connectionId: connection.id,
              groupId,
              settings: {
                platform: "TWITTER" as const,
                values: {
                  replyRestriction: "everyone" as const,
                  format: "article" as const,
                },
              },
              scheduledAt: null,
            },
          ],
          intent: "draft" as const,
        };
        const draft = yield* posts.create({
          workspaceId,
          actor,
          value: incomplete,
        });
        expect(draft.status).toBe("draft");
        const rejected = yield* posts
          .create({
            workspaceId,
            actor,
            value: { ...incomplete, intent: "publish_now" },
          })
          .pipe(Effect.flip);
        expect(rejected._tag).toBe("ValidationError");
      }).pipe(Effect.provide(AppLayer))
    );
  });
});
