import {
  Connection,
  ConnectionId,
  MediaId,
  makeConnectionRepository,
  makeId,
  makeTokenCipher,
  PostGroupId,
  TokenCipher,
  type WorkspaceId,
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
import { IdentityService } from "../../src/identity";
import { JobTransport } from "../../src/job-transport";
import { JobService } from "../../src/jobs";
import { MembershipService } from "../../src/membership";
import { PostService } from "../../src/posts";
import { ShareLinkService, type ShareViewer } from "../../src/share-links";

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
  | PostService
  | ShareLinkService
  | PgClient.PgClient
>;

beforeAll(() => {
  const Jobs = JobService.layer.pipe(
    Layer.provide(
      Layer.succeed(
        JobTransport,
        JobTransport.of({ prepare: async () => undefined })
      )
    )
  );
  const Posts = PostService.layer.pipe(Layer.provide(Jobs));
  const Cipher = Layer.succeed(
    TokenCipher,
    TokenCipher.of(makeTokenCipher("integration-encryption-secret"))
  );
  AppLayer = Layer.mergeAll(
    IdentityService.layer,
    MembershipService.layer,
    Posts,
    ShareLinkService.layer.pipe(Layer.provide([Posts, Cipher]))
  ).pipe(Layer.provideMerge(Pg));
});

/** A personal workspace with one Instagram account and a draft using media. */
const seed = Effect.gen(function* () {
  const identity = yield* IdentityService;
  const memberships = yield* MembershipService;
  const posts = yield* PostService;
  const sql = yield* SqlClient.SqlClient;
  const resolved = yield* identity.resolve({
    sub: `clerk_${crypto.randomUUID()}`,
  });
  const workspaceId = resolved.personalWorkspace?.id as WorkspaceId;
  const member = Option.getOrThrow(
    yield* memberships.resolve({ workspaceId, userId: resolved.user.id })
  );
  const connection = yield* (yield* makeConnectionRepository()).insert(
    Connection.insert.make({
      id: makeId(ConnectionId),
      legacyConvexId: null,
      workspaceId,
      platform: "INSTAGRAM",
      profileId: crypto.randomUUID(),
      username: "studio",
      displayName: "Studio",
      accessToken: "opaque",
      refreshToken: null,
      cipherVersion: "v1",
      expiresAt: null,
      metadata: { profileImage: "https://cdn.example.com/avatar.png" },
    })
  );
  const mediaId = makeId(MediaId);
  yield* sql`INSERT INTO media (id, workspace_id, bucket_key, url, media_type, size_bytes, status)
    VALUES (${mediaId}, ${workspaceId}, ${`${workspaceId}/photo.jpg`},
      'https://media.example.com/photo.jpg', 'image', 10, 'ready')`;
  const groupId = makeId(PostGroupId);
  const write = (text: string) => ({
    groups: [
      {
        id: groupId,
        isDefault: true,
        segments: [{ text, media: [{ id: mediaId }] }],
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
        scheduledAt: null,
      },
    ],
    intent: "draft" as const,
  });
  const actor = { memberId: member.memberId, role: member.role };
  const post = yield* posts.create({
    workspaceId,
    actor,
    value: write("First draft"),
  });
  return { workspaceId, member, post, actor, write, userId: resolved.user.id };
});

const run = <A, E>(
  program: Effect.Effect<
    A,
    E,
    | IdentityService
    | MembershipService
    | PostService
    | ShareLinkService
    | SqlClient.SqlClient
  >
) => Effect.runPromise(program.pipe(Effect.provide(AppLayer)));

const failureTag = <A, E extends { _tag: string }, R>(
  effect: Effect.Effect<A, E, R>
) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => error._tag)
  );

describe("ShareLinkService", () => {
  it("shares the latest content with anyone and collects guest comments", async () => {
    await run(
      Effect.gen(function* () {
        const shares = yield* ShareLinkService;
        const posts = yield* PostService;
        const { workspaceId, member, post, actor, write } = yield* seed;

        const link = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "anyone",
        });
        expect(link.token.length).toBeGreaterThanOrEqual(43);
        expect(link.expired).toBe(false);
        const again = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "anyone",
        });
        expect(again.token).toBe(link.token);
        expect((yield* shares.get(workspaceId, post.id))?.token).toBe(
          link.token
        );

        yield* posts.update({
          workspaceId,
          postId: post.id,
          actor,
          value: write("Edited after sharing"),
        });
        const view = yield* shares.view(link.token, null);
        expect(view.channels).toEqual([
          expect.objectContaining({
            platform: "INSTAGRAM",
            displayName: "Studio",
            username: "studio",
            profileImage: "https://cdn.example.com/avatar.png",
            segments: [
              {
                text: "Edited after sharing",
                media: [
                  {
                    url: "https://media.example.com/photo.jpg",
                    mediaType: "image",
                    altText: null,
                  },
                ],
              },
            ],
          }),
        ]);

        const comment = yield* shares.comment({
          token: link.token,
          viewer: null,
          authorName: "Priya",
          body: "Love the photo",
        });
        expect(comment).toMatchObject({
          authorName: "Priya",
          body: "Love the photo",
        });
        expect((yield* shares.view(link.token, null)).comments).toHaveLength(1);
        expect(yield* shares.comments(workspaceId, post.id)).toEqual([comment]);
      })
    );
  });

  it("requires an authorized workspace member for members-only links", async () => {
    await run(
      Effect.gen(function* () {
        const shares = yield* ShareLinkService;
        const { workspaceId, member, post, userId } = yield* seed;
        const link = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "workspace",
        });
        const outsider: ShareViewer = {
          userId: "user_outsider0000",
          authorize: () => Effect.fail("not a member"),
        };
        const teammate: ShareViewer = { userId, authorize: () => Effect.void };

        expect(yield* failureTag(shares.view(link.token, null))).toBe(
          "UnauthorizedError"
        );
        expect(yield* failureTag(shares.view(link.token, outsider))).toBe(
          "ForbiddenError"
        );
        expect((yield* shares.view(link.token, teammate)).postId).toBe(post.id);

        const comment = yield* shares.comment({
          token: link.token,
          viewer: teammate,
          authorName: "ignored for members",
          body: "Ship it",
        });
        // Members comment as themselves; a supplied name can't impersonate.
        expect(comment.authorName).toBe("Team member");

        const opened = yield* shares.update({
          workspaceId,
          postId: post.id,
          access: "anyone",
        });
        expect(opened.access).toBe("anyone");
        expect((yield* shares.view(link.token, null)).access).toBe("anyone");
      })
    );
  });

  it("expires after a week, renews in place, and revokes for good", async () => {
    await run(
      Effect.gen(function* () {
        const shares = yield* ShareLinkService;
        const posts = yield* PostService;
        const sql = yield* SqlClient.SqlClient;
        const { workspaceId, member, post } = yield* seed;
        const link = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "anyone",
        });
        const days = (Date.parse(link.expiresAt) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(6.9);
        expect(days).toBeLessThanOrEqual(7);

        yield* sql`UPDATE post_share_links SET expires_at = now() - interval '1 minute'
          WHERE id = ${link.id}`;
        expect((yield* shares.get(workspaceId, post.id))?.expired).toBe(true);
        expect(yield* failureTag(shares.view(link.token, null))).toBe(
          "ShareLinkExpiredError"
        );
        expect(
          yield* failureTag(
            shares.comment({
              token: link.token,
              viewer: null,
              authorName: "Late",
              body: "Too late",
            })
          )
        ).toBe("ShareLinkExpiredError");

        const renewed = yield* shares.update({
          workspaceId,
          postId: post.id,
          renew: true,
        });
        expect(renewed.token).toBe(link.token);
        expect(renewed.expired).toBe(false);
        yield* shares.comment({
          token: link.token,
          viewer: null,
          authorName: "Sam",
          body: "Kept across links",
        });

        expect(yield* shares.revoke(workspaceId, post.id)).toEqual({
          revoked: true,
        });
        expect(yield* failureTag(shares.view(link.token, null))).toBe(
          "NotFoundError"
        );
        expect(yield* shares.get(workspaceId, post.id)).toBeNull();

        const replacement = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "anyone",
        });
        expect(replacement.token).not.toBe(link.token);
        expect(
          (yield* shares.view(replacement.token, null)).comments.map(
            (comment) => comment.body
          )
        ).toEqual(["Kept across links"]);

        yield* posts.remove(workspaceId, post.id);
        expect(yield* failureTag(shares.view(replacement.token, null))).toBe(
          "NotFoundError"
        );
        expect(yield* failureTag(shares.view("not-a-real-token", null))).toBe(
          "NotFoundError"
        );
      })
    );
  });

  it("refuses to share posts from another workspace", async () => {
    await run(
      Effect.gen(function* () {
        const shares = yield* ShareLinkService;
        const first = yield* seed;
        const second = yield* seed;
        expect(
          yield* failureTag(
            shares.create({
              workspaceId: second.workspaceId,
              postId: first.post.id,
              memberId: second.member.memberId,
              access: "anyone",
            })
          )
        ).toBe("NotFoundError");
      })
    );
  });

  it("lets admins restrict every link to members without losing settings", async () => {
    await run(
      Effect.gen(function* () {
        const shares = yield* ShareLinkService;
        const sql = yield* SqlClient.SqlClient;
        const { workspaceId, member, post, userId } = yield* seed;
        const link = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "anyone",
        });
        const setPublic = (allowed: boolean) =>
          sql`UPDATE workspaces SET public_share_links = ${allowed} WHERE id = ${workspaceId}`;

        yield* setPublic(false);
        // Existing public links immediately behave as members-only.
        expect((yield* shares.get(workspaceId, post.id))?.access).toBe(
          "workspace"
        );
        expect(yield* failureTag(shares.view(link.token, null))).toBe(
          "UnauthorizedError"
        );
        const teammate: ShareViewer = { userId, authorize: () => Effect.void };
        expect((yield* shares.view(link.token, teammate)).access).toBe(
          "workspace"
        );
        expect(
          yield* failureTag(
            shares.update({ workspaceId, postId: post.id, access: "anyone" })
          )
        ).toBe("ForbiddenError");
        // Renewing and members-only changes still work under the policy.
        expect(
          (yield* shares.update({ workspaceId, postId: post.id, renew: true }))
            .access
        ).toBe("workspace");
        yield* shares.revoke(workspaceId, post.id);
        expect(
          yield* failureTag(
            shares.create({
              workspaceId,
              postId: post.id,
              memberId: member.memberId,
              access: "anyone",
            })
          )
        ).toBe("ForbiddenError");
        const restricted = yield* shares.create({
          workspaceId,
          postId: post.id,
          memberId: member.memberId,
          access: "workspace",
        });
        expect(restricted.access).toBe("workspace");

        yield* setPublic(true);
        const reopened = yield* shares.update({
          workspaceId,
          postId: post.id,
          access: "anyone",
        });
        expect(reopened.access).toBe("anyone");
        expect((yield* shares.view(reopened.token, null)).access).toBe(
          "anyone"
        );
      })
    );
  });
});
