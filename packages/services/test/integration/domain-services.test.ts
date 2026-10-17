import {
  Connection,
  ConnectionId,
  makeConnectionRepository,
  makeId,
  makeTokenCipher,
  PostGroupId,
  TokenCipher,
} from "@delulu/core";
import { makePostgresConnectionStore } from "@delulu/db";
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
  const postStatuses = ["published", "scheduled"] as const;
  it.each(postStatuses)("retains %s posts", async (status) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const identity = yield* IdentityService;
        const connections = yield* ConnectionsService;
        const sql = yield* SqlClient.SqlClient;
        const owner = yield* identity.resolve({ sub: crypto.randomUUID() });
        const stranger = yield* identity.resolve({
          sub: crypto.randomUUID(),
        });
        const workspaceId = owner.personalWorkspace!.id;
        const profileId = crypto.randomUUID();
        const input = {
          socialType: "INSTAGRAM" as const,
          profileId,
          accessToken: "access-secret",
          refreshToken: "refresh-secret",
        };
        yield* connections.upsertFromOAuth(workspaceId, input);
        const account = (yield* connections.list(workspaceId, 10, 0)).data[0]!;
        const members = yield* sql<{
          id: string;
        }>`SELECT id FROM workspace_members
          WHERE workspace_id = ${workspaceId} AND user_id = ${owner.user.id}`;
        const postId = crypto.randomUUID();
        yield* sql`INSERT INTO posts (id, workspace_id, status, content, created_by_member_id, source)
          VALUES (${postId}, ${workspaceId}, ${status}::post_status,
            '{"groups":[{"id":"group","isDefault":true,"segments":[]}]}', ${members[0].id}, 'app')`;
        yield* sql`INSERT INTO post_targets (id, post_id, connection_id, group_id, status)
          VALUES (${crypto.randomUUID()}, ${postId}, ${account.id}, 'group', ${status === "published" ? "published" : "pending"}::target_status)`;
        const automationId = crypto.randomUUID();
        yield* sql`INSERT INTO automations (id, workspace_id, connection_id, platform, category)
          VALUES (${automationId}, ${workspaceId}, ${account.id}, 'INSTAGRAM', 'auto_dm')`;

        const denied = yield* connections
          .remove(stranger.personalWorkspace!.id, account.id)
          .pipe(Effect.result);
        expect(denied._tag).toBe("Failure");
        expect((yield* connections.list(workspaceId, 10, 0)).total).toBe(1);
        yield* connections.remove(workspaceId, account.id);
        expect((yield* connections.list(workspaceId, 10, 0)).total).toBe(0);
        expect((yield* connections.list(workspaceId, 10, 0)).data).toEqual([]);
        const retained = yield* sql<{
          accessToken: string;
          refreshToken: string | null;
        }>`
          SELECT access_token, refresh_token FROM connections WHERE id = ${account.id}`;
        expect(retained).toEqual([{ accessToken: "", refreshToken: null }]);
        expect(
          yield* sql`SELECT id FROM post_targets WHERE post_id = ${postId}`
        ).toHaveLength(1);
        expect(
          yield* sql`SELECT id FROM automations WHERE id = ${automationId}`
        ).toHaveLength(1);
        const store = yield* makePostgresConnectionStore;
        expect(
          yield* store.getSocialProviderWithDecryptedTokens(account.id)
        ).toBeNull();
        const rotation = yield* store
          .updateSocialProvider({
            socialProviderId: account.id,
            accessToken: "stale-refresh",
          })
          .pipe(Effect.result);
        expect(rotation._tag).toBe("Failure");
        yield* connections.remove(workspaceId, account.id);
        yield* connections.upsertFromOAuth(workspaceId, input);
        const restored = yield* connections.list(workspaceId, 10, 0);
        expect(restored.total).toBe(1);
        expect(restored.data[0]?.id).toBe(account.id);
        expect(
          (yield* store.getSocialProviderWithDecryptedTokens(account.id))
            ?.accessToken
        ).toBe("access-secret");
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            AppLayer,
            Layer.succeed(
              TokenCipher,
              TokenCipher.of(makeTokenCipher("integration-encryption-secret"))
            )
          )
        )
      )
    );
  });

  it("disconnects an account with no dependent records", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const identity = yield* IdentityService;
        const connections = yield* ConnectionsService;
        const owner = yield* identity.resolve({ sub: crypto.randomUUID() });
        const workspaceId = owner.personalWorkspace!.id;
        yield* connections.upsertFromOAuth(workspaceId, {
          socialType: "INSTAGRAM",
          profileId: crypto.randomUUID(),
          accessToken: "access-secret",
        });
        const account = (yield* connections.list(workspaceId, 10, 0)).data[0]!;
        yield* connections.remove(workspaceId, account.id);
        expect((yield* connections.list(workspaceId, 10, 0)).total).toBe(0);
        const missing = yield* connections
          .remove(workspaceId, "missing")
          .pipe(Effect.result);
        expect(missing._tag).toBe("Failure");
      }).pipe(Effect.provide(AppLayer))
    );
  });

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
