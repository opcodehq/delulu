import { PostGroupId } from "@delulu/core";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { makeComposerPostWrite, makeSimplePostWrite } from "./post-write.js";

describe("makeSimplePostWrite", () => {
  it("generates group ids accepted by the backend domain schema", () => {
    const post = makeSimplePostWrite({
      caption: "Production post",
      connections: [{ id: "connection_aaaaaaaaaaaa", platform: "INSTAGRAM" }],
    });

    const groupId = post.groups[0]?.id;
    expect(groupId).toBeDefined();
    expect(() => Schema.decodeUnknownSync(PostGroupId)(groupId)).not.toThrow();
    expect(post.targets[0]?.groupId).toBe(groupId);
  });

  it("rejects temporary browser media ids before creating a poisoned post", () => {
    expect(() =>
      makeSimplePostWrite({
        caption: "Production post",
        connections: [{ id: "connection_aaaaaaaaaaaa", platform: "INSTAGRAM" }],
        mediaIds: ["063286ba-6a68-4656-88bc-97a8e9b2a55e"],
      })
    ).toThrow("Selected media is not ready");
  });

  it("preserves connection-specific Instagram trial reel settings", () => {
    const post = makeSimplePostWrite({
      caption: "Trial reel",
      connections: [
        {
          id: "connection_aaaaaaaaaaaa",
          platform: "INSTAGRAM",
          settings: {
            platform: "INSTAGRAM",
            values: {
              shareToFeed: true,
              shareToStory: false,
              trialReels: true,
              graduationStrategy: "SS_PERFORMANCE",
            },
          },
        },
      ],
    });

    expect(post.targets[0]?.settings).toEqual({
      platform: "INSTAGRAM",
      values: {
        shareToFeed: true,
        shareToStory: false,
        trialReels: true,
        graduationStrategy: "SS_PERFORMANCE",
      },
    });
  });

  it("preserves a post-specific video thumbnail reference", () => {
    const post = makeSimplePostWrite({
      caption: "Video with a custom cover",
      connections: [{ id: "connection_aaaaaaaaaaaa", platform: "INSTAGRAM" }],
      media: [
        {
          id: "media_video1234567",
          thumbnailMediaId: "media_thumb1234567",
        },
      ],
    } as Parameters<typeof makeSimplePostWrite>[0]);

    expect(post.groups[0]?.segments[0]?.media).toEqual([
      {
        id: "media_video1234567",
        thumbnailMediaId: "media_thumb1234567",
      },
    ]);
  });

  it("preserves publish-now intent in the atomic create payload", () => {
    const post = makeSimplePostWrite({
      caption: "Publish exactly once",
      connections: [{ id: "connection_aaaaaaaaaaaa", platform: "LINKEDIN" }],
      intent: "publish_now",
      idempotencyKey: "agent-run-123",
    });

    expect(post.intent).toBe("publish_now");
    expect(post.externalSubmissionId).toBe("agent-run-123");
  });
});

describe("makeComposerPostWrite", () => {
  it("preserves ordered default and connection-specific thread segments", () => {
    const post = makeComposerPostWrite({
      segments: [
        { text: "Default one", media: [] },
        { text: "Default two", media: [] },
      ],
      connections: [
        { id: "connection_aaaaaaaaaaaa", platform: "TWITTER" },
        {
          id: "connection_bbbbbbbbbbbb",
          platform: "THREADS",
          segments: [
            { text: "Threads one", media: [] },
            { text: "Threads two", media: [] },
          ],
        },
      ],
      intent: "draft",
      source: "app",
    });

    expect(post.groups).toHaveLength(2);
    expect(post.groups.find((group) => group.isDefault)?.segments).toEqual([
      { text: "Default one", media: [] },
      { text: "Default two", media: [] },
    ]);

    const threadsTarget = post.targets.find(
      (target) => target.connectionId === "connection_bbbbbbbbbbbb"
    );
    const threadsGroup = post.groups.find(
      (group) => group.id === threadsTarget?.groupId
    );
    expect(threadsGroup?.isDefault).toBe(false);
    expect(threadsGroup?.segments).toEqual([
      { text: "Threads one", media: [] },
      { text: "Threads two", media: [] },
    ]);
    expect(post.source).toBe("app");
    expect(post.intent).toBe("draft");
  });
});
