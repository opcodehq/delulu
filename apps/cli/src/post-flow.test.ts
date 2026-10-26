import { describe, expect, it, vi } from "vitest";
import {
  type PostFlowAdapter,
  type PostFlowResult,
  parseTwitterOptions,
  submitPost,
  validateTrialReelOptions,
} from "./post-flow.js";

const post = (status: string): PostFlowResult => ({
  id: "post_atomic123456",
  status,
  targets: [{ id: "post_target_atomic", status: "pending" }],
});

const adapterFor = (
  overrides: Partial<PostFlowAdapter> = {}
): PostFlowAdapter => ({
  listAccounts: async () => [
    {
      id: "connection_linkedin1",
      platform: "LINKEDIN",
      username: "swaraj",
    },
  ],
  addMedia: async () => ({ id: "media_uploaded123", mediaType: "VIDEO" }),
  create: async () => post("publishing"),
  get: async () => post("published"),
  sleep: async () => undefined,
  now: () => 0,
  ...overrides,
});

describe("submitPost", () => {
  it("uploads media and publishes with one atomic create call", async () => {
    const create = vi.fn(async () => post("publishing"));
    const get = vi.fn(async () => post("published"));
    const addMedia = vi.fn(async () => ({
      id: "media_uploaded123",
      mediaType: "VIDEO",
    }));
    const result = await submitPost(
      {
        caption: "Publish once",
        accountSelectors: ["linkedin"],
        mediaSources: ["video.mp4"],
        intent: "publish_now",
        idempotencyKey: "agent-run-123",
      },
      adapterFor({ create, get, addMedia })
    );

    expect(result.status).toBe("published");
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "publish_now",
        idempotencyKey: "agent-run-123",
        mediaIds: ["media_uploaded123"],
      })
    );
    expect(get).toHaveBeenCalledOnce();
  });

  it("never retries a publish response that incorrectly remains draft", async () => {
    const create = vi.fn(async () => post("draft"));
    const get = vi.fn(async () => post("published"));

    await expect(
      submitPost(
        {
          caption: "Do not duplicate",
          accountSelectors: ["linkedin"],
          intent: "publish_now",
        },
        adapterFor({ create, get })
      )
    ).rejects.toThrow("remains a draft and was not retried");
    expect(create).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
  });

  it("requires a specific selector when a platform has multiple accounts", async () => {
    const adapter = adapterFor({
      listAccounts: async () => [
        { id: "connection_one", platform: "LINKEDIN", username: "one" },
        { id: "connection_two", platform: "LINKEDIN", username: "two" },
      ],
    });

    await expect(
      submitPost(
        {
          caption: "Choose explicitly",
          accountSelectors: ["linkedin"],
          intent: "draft",
        },
        adapter
      )
    ).rejects.toThrow("linkedin:connection_one, linkedin:connection_two");
  });

  it("resolves multiple canonical selectors when provider names collide", async () => {
    const create = vi.fn(async () => post("draft"));
    const accounts = [
      {
        id: "connection_Aa",
        platform: "LINKEDIN",
        username: null,
        displayName: "Same Name",
      },
      {
        id: "connection_aa",
        platform: "LINKEDIN",
        username: null,
        displayName: "Same Name",
      },
    ];
    await submitPost(
      {
        caption: "Publish to both",
        accountSelectors: ["linkedin:connection_Aa", "linkedin:connection_aa"],
        intent: "draft",
      },
      adapterFor({ listAccounts: async () => accounts, create })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: accounts.map(({ id, platform }) => ({ id, platform })),
      })
    );
  });

  it("requires an explicit target even when only one account exists", async () => {
    await expect(
      submitPost(
        {
          caption: "Choose explicitly",
          intent: "draft",
        },
        adapterFor()
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED", exitCode: 2 });
  });

  it("adds Trial Reel settings only to selected Instagram targets", async () => {
    const create = vi.fn(async () => post("draft"));
    await submitPost(
      {
        caption: "Try this reel",
        accountSelectors: ["instagram", "linkedin"],
        mediaSources: ["video.mp4"],
        intent: "draft",
        trialReel: true,
        graduationStrategy: "performance",
      },
      adapterFor({
        listAccounts: async () => [
          {
            id: "connection_instagram1",
            platform: "INSTAGRAM",
            username: "creator",
          },
          {
            id: "connection_linkedin1",
            platform: "LINKEDIN",
            username: "swaraj",
          },
        ],
        create,
      })
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: [
          {
            id: "connection_instagram1",
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
          { id: "connection_linkedin1", platform: "LINKEDIN" },
        ],
      })
    );
  });

  it("rejects Trial Reels without an Instagram target before uploading", async () => {
    const addMedia = vi.fn(async () => ({
      id: "media_uploaded123",
      mediaType: "VIDEO",
    }));
    const create = vi.fn(async () => post("draft"));

    await expect(
      submitPost(
        {
          caption: "Wrong platform",
          accountSelectors: ["linkedin"],
          mediaSources: ["video.mp4"],
          intent: "draft",
          trialReel: true,
        },
        adapterFor({ addMedia, create })
      )
    ).rejects.toMatchObject({ code: "INSTAGRAM_TARGET_REQUIRED", exitCode: 2 });
    expect(addMedia).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("requires media for a Trial Reel before API access", async () => {
    const listAccounts = vi.fn(async () => []);

    await expect(
      submitPost(
        {
          caption: "Missing video",
          accountSelectors: ["instagram"],
          intent: "draft",
          trialReel: true,
        },
        adapterFor({ listAccounts })
      )
    ).rejects.toMatchObject({ code: "TRIAL_REEL_MEDIA_REQUIRED", exitCode: 2 });
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("requires exactly one media item for a Trial Reel before API access", () => {
    expect(() =>
      validateTrialReelOptions({
        trialReel: true,
        mediaSources: ["first.mp4", "second.mp4"],
      })
    ).toThrow("requires exactly one video");
  });

  it("rejects non-video Trial Reel media before creating the post", async () => {
    const addMedia = vi.fn(async () => ({
      id: "media_uploaded123",
      mediaType: "IMAGE",
    }));
    const create = vi.fn(async () => post("draft"));

    await expect(
      submitPost(
        {
          caption: "Not a video",
          accountSelectors: ["instagram"],
          mediaSources: ["image.jpg"],
          intent: "draft",
          trialReel: true,
        },
        adapterFor({
          listAccounts: async () => [
            { id: "connection_instagram1", platform: "INSTAGRAM" },
          ],
          addMedia,
          create,
        })
      )
    ).rejects.toMatchObject({ code: "TRIAL_REEL_VIDEO_REQUIRED", exitCode: 2 });
    expect(addMedia).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects authoritative non-video metadata before creating the post", async () => {
    const create = vi.fn(async () => post("draft"));

    await expect(
      submitPost(
        {
          caption: "Not a video",
          accountSelectors: ["instagram"],
          mediaSources: ["media_existing123"],
          intent: "draft",
          trialReel: true,
        },
        adapterFor({
          listAccounts: async () => [
            { id: "connection_instagram1", platform: "INSTAGRAM" },
          ],
          addMedia: async () => ({
            id: "media_existing123",
            mediaType: "IMAGE",
          }),
          create,
        })
      )
    ).rejects.toMatchObject({ code: "TRIAL_REEL_VIDEO_REQUIRED", exitCode: 2 });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a graduation strategy unless Trial Reels are enabled", async () => {
    const listAccounts = vi.fn(async () => []);

    await expect(
      submitPost(
        {
          caption: "Invalid options",
          accountSelectors: ["instagram"],
          intent: "draft",
          graduationStrategy: "manual",
        },
        adapterFor({ listAccounts })
      )
    ).rejects.toMatchObject({ code: "TRIAL_REEL_REQUIRED", exitCode: 2 });
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("rejects an unknown Trial Reel graduation strategy before API access", async () => {
    const listAccounts = vi.fn(async () => []);

    await expect(
      submitPost(
        {
          caption: "Invalid strategy",
          accountSelectors: ["instagram"],
          intent: "draft",
          trialReel: true,
          graduationStrategy: "later",
          mediaSources: ["video.mp4"],
        },
        adapterFor({ listAccounts })
      )
    ).rejects.toMatchObject({
      code: "INVALID_GRADUATION_STRATEGY",
      exitCode: 2,
    });
    expect(listAccounts).not.toHaveBeenCalled();
  });
});

describe("X options", () => {
  const accounts = async () => [
    { id: "connection_twitter01", platform: "TWITTER", username: "writer" },
    { id: "connection_linkedin1", platform: "LINKEDIN", username: "swaraj" },
  ];

  it("parses quote, replies and Article flags", () => {
    expect(parseTwitterOptions({})).toBeUndefined();
    expect(parseTwitterOptions({ quote: "123", replies: "Following" })).toEqual(
      { quotePost: "123", replyRestriction: "following" }
    );
    expect(() => parseTwitterOptions({ replies: "friends" })).toThrow(
      expect.objectContaining({ code: "INVALID_X_OPTIONS", exitCode: 2 })
    );
  });

  it("applies a quote and reply audience to X targets only", async () => {
    const create = vi.fn(async () => post("draft"));
    await submitPost(
      {
        caption: "Quoting this",
        accountSelectors: ["twitter", "linkedin"],
        intent: "draft",
        twitter: {
          quotePost: "https://x.com/wiz/status/1234567890123456789",
          replyRestriction: "mentioned",
        },
      },
      adapterFor({ listAccounts: accounts, create })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: [
          {
            id: "connection_twitter01",
            platform: "TWITTER",
            settings: {
              platform: "TWITTER",
              values: {
                replyRestriction: "mentioned",
                quoteTweetId: "https://x.com/wiz/status/1234567890123456789",
              },
            },
          },
          { id: "connection_linkedin1", platform: "LINKEDIN" },
        ],
      })
    );
  });

  it("publishes an Article title as an X Article", async () => {
    const create = vi.fn(async () => post("draft"));
    await submitPost(
      {
        caption: "Body",
        accountSelectors: ["twitter"],
        intent: "draft",
        twitter: { articleTitle: "Long read" },
      },
      adapterFor({ listAccounts: accounts, create })
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: [
          expect.objectContaining({
            settings: {
              platform: "TWITTER",
              values: {
                replyRestriction: "everyone",
                quoteTweetId: "",
                format: "article",
                articleTitle: "Long read",
              },
            },
          }),
        ],
      })
    );
  });

  it("rejects X options without an X target before uploading", async () => {
    const addMedia = vi.fn(async () => ({
      id: "media_uploaded123",
      mediaType: "IMAGE",
    }));
    const create = vi.fn(async () => post("draft"));
    await expect(
      submitPost(
        {
          caption: "No X here",
          accountSelectors: ["linkedin"],
          mediaSources: ["image.png"],
          intent: "draft",
          twitter: { quotePost: "123" },
        },
        adapterFor({ listAccounts: accounts, addMedia, create })
      )
    ).rejects.toMatchObject({ code: "INVALID_X_OPTIONS", exitCode: 2 });
    expect(addMedia).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
