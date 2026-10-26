import axios from "axios";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStore } from "../../services/connection-store";
import { twitterAuth } from "./auth";
import { twitterPublisher } from "./publish";

const xdk = vi.hoisted(() => ({
  articleCreateDraft: vi.fn(),
  articlePublish: vi.fn(),
  configs: [] as Record<string, unknown>[],
  create: vi.fn(),
  upload: vi.fn(),
  initializeUpload: vi.fn(),
  appendUpload: vi.fn(),
  finalizeUpload: vi.fn(),
  getUploadStatus: vi.fn(),
}));

vi.mock("axios", () => ({ default: vi.fn() }));

vi.mock("@xdevplatform/xdk", () => ({
  Client: class {
    readonly posts = { create: xdk.create };
    readonly articles = {
      articleCreateDraft: xdk.articleCreateDraft,
      articlePublish: xdk.articlePublish,
    };
    readonly media = {
      upload: xdk.upload,
      initializeUpload: xdk.initializeUpload,
      appendUpload: xdk.appendUpload,
      finalizeUpload: xdk.finalizeUpload,
      getUploadStatus: xdk.getUploadStatus,
    };

    constructor(config: Record<string, unknown>) {
      xdk.configs.push(config);
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  xdk.configs.length = 0;
  xdk.create.mockReset();
  xdk.articleCreateDraft.mockReset();
  xdk.articlePublish.mockReset();
  xdk.upload.mockReset();
  xdk.initializeUpload.mockReset();
  xdk.appendUpload.mockReset();
  xdk.finalizeUpload.mockReset();
  xdk.getUploadStatus.mockReset();
  vi.mocked(axios).mockReset();
});

const MEDIA_RANGE = /bytes=(\d+)-(\d+)/;
const mockMedia = (value: string) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const bytes = new TextEncoder().encode(value);
      const range = new Headers(init?.headers).get("range")?.match(MEDIA_RANGE);
      const start = Number(range?.[1] ?? 0);
      const end = Number(range?.[2] ?? bytes.length - 1);
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          "content-range": `bytes ${start}-${end}/${bytes.length}`,
          "content-type": "application/octet-stream",
        },
      });
    })
  );

const currentStore = () =>
  Layer.succeed(ConnectionStore, {
    getSocialProviderWithDecryptedTokens: () =>
      Effect.succeed({
        _id: "connection_x",
        socialType: "TWITTER" as const,
        accessToken: "current-access",
        expiresIn: Date.now() + 12 * 60 * 60 * 1000,
        profileId: "x_user_1",
        username: "tester",
      }),
    updateSocialProvider: () => Effect.void,
  });

describe("X publishing token lifecycle", () => {
  it("refreshes and persists an expiring token before creating a post", async () => {
    vi.stubEnv("TWITTER_CLIENT_ID", "client");
    vi.stubEnv("TWITTER_CLIENT_SECRET", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "fresh-access",
            refresh_token: "fresh-refresh",
            expires_in: 7200,
          }),
          { status: 200 }
        )
      )
    );
    xdk.create.mockResolvedValue({ data: { id: "post_1" } });
    const update = vi.fn(() => Effect.void);
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_x",
          socialType: "TWITTER" as const,
          accessToken: "stale-access",
          refreshToken: "current-refresh",
          expiresIn: Date.now() + 30_000,
          profileId: "x_user_1",
          username: "tester",
        }),
      updateSocialProvider: update,
    });

    const result = await Effect.runPromise(
      twitterPublisher
        .publish({
          socialProviderId: "connection_x",
          content: {
            postId: "local_post_1",
            socialProviderId: "connection_x",
            content: [
              {
                order: 0,
                name: "Post",
                text: "Hello X",
                tags: [],
                media: [],
              },
            ],
          },
        })
        .pipe(Effect.provide(Store))
    );

    expect(result.platformPostId).toBe("post_1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
      })
    );
    expect(xdk.configs).toContainEqual({ accessToken: "fresh-access" });
  });

  it("resumes an interrupted thread from durable segment state", async () => {
    xdk.create
      .mockResolvedValueOnce({ data: { id: "post_2" } })
      .mockResolvedValueOnce({ data: { id: "post_3" } });
    const Store = Layer.succeed(ConnectionStore, {
      getSocialProviderWithDecryptedTokens: () =>
        Effect.succeed({
          _id: "connection_x",
          socialType: "TWITTER" as const,
          accessToken: "current-access",
          expiresIn: Date.now() + 12 * 60 * 60 * 1000,
          profileId: "x_user_1",
          username: "tester",
        }),
      updateSocialProvider: () => Effect.void,
    });
    const persistProviderState = vi.fn().mockResolvedValue(undefined);

    const result = await Effect.runPromise(
      twitterPublisher
        .publish({
          socialProviderId: "connection_x",
          providerState: { publishedSegmentIds: ["post_1"] },
          persistProviderState,
          content: {
            postId: "local_thread_1",
            socialProviderId: "connection_x",
            content: ["First", "Second", "Third"].map((text, order) => ({
              order,
              name: `Post ${order + 1}`,
              text,
              tags: [],
              media: [],
            })),
          },
        })
        .pipe(Effect.provide(Store))
    );

    expect(result.platformPostId).toBe("post_1");
    expect(xdk.create).toHaveBeenCalledTimes(2);
    expect(xdk.create).toHaveBeenNthCalledWith(1, {
      text: "Second",
      reply: { inReplyToTweetId: "post_1" },
    });
    expect(xdk.create).toHaveBeenNthCalledWith(2, {
      text: "Third",
      reply: { inReplyToTweetId: "post_2" },
    });
    expect(persistProviderState).toHaveBeenLastCalledWith({
      publishedSegmentIds: ["post_1", "post_2", "post_3"],
    });
  });
});

describe("X publishing formats", () => {
  it("does not retry when a created thread segment cannot be persisted", async () => {
    xdk.create.mockResolvedValue({ data: { id: "post-created" } });

    await expect(
      Effect.runPromise(
        twitterPublisher
          .publish({
            socialProviderId: "connection_x",
            persistProviderState: vi
              .fn()
              .mockRejectedValue(new Error("database unavailable")),
            content: {
              postId: "local-persist-failure",
              socialProviderId: "connection_x",
              content: [
                {
                  order: 0,
                  name: "First",
                  text: "Created remotely",
                  tags: [],
                  media: [],
                },
                {
                  order: 1,
                  name: "Second",
                  text: "Must not be attempted",
                  tags: [],
                  media: [],
                },
              ],
            },
          })
          .pipe(Effect.provide(currentStore()))
      )
    ).rejects.toMatchObject({
      code: "AMBIGUOUS_PUBLISH",
      retryable: false,
    });
    expect(xdk.create).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry an unconfirmed create response", async () => {
    xdk.create.mockRejectedValue(new Error("connection reset"));

    await expect(
      Effect.runPromise(
        twitterPublisher
          .publish({
            socialProviderId: "connection_x",
            content: {
              postId: "local-ambiguous",
              socialProviderId: "connection_x",
              content: [
                {
                  order: 0,
                  name: "Post",
                  text: "Potentially accepted",
                  tags: [],
                  media: [],
                },
              ],
            },
          })
          .pipe(Effect.provide(currentStore()))
      )
    ).rejects.toMatchObject({
      code: "AMBIGUOUS_PUBLISH",
      retryable: false,
    });
  });

  it("publishes a single post with multiple images", async () => {
    mockMedia("image");
    xdk.upload
      .mockResolvedValueOnce({ data: { id: "media-1" } })
      .mockResolvedValueOnce({ data: { id: "media-2" } });
    xdk.create.mockResolvedValue({ data: { id: "post-1" } });

    await Effect.runPromise(
      twitterPublisher
        .publish({
          socialProviderId: "connection_x",
          content: {
            postId: "local-post",
            socialProviderId: "connection_x",
            content: [
              {
                order: 0,
                name: "Images",
                text: "Two images",
                tags: [],
                media: [
                  { mediaType: "IMAGE", url: "https://media.test/1.jpg" },
                  { mediaType: "IMAGE", url: "https://media.test/2.png" },
                ],
              },
            ],
          },
        })
        .pipe(Effect.provide(currentStore()))
    );

    expect(xdk.upload).toHaveBeenCalledTimes(2);
    expect(xdk.create).toHaveBeenCalledWith({
      text: "Two images",
      media: { mediaIds: ["media-1", "media-2"] },
    });
  });

  it("uploads video through the current chunked media SDK", async () => {
    mockMedia("video");
    xdk.initializeUpload.mockResolvedValue({ data: { id: "media-video" } });
    xdk.appendUpload.mockResolvedValue({ data: {} });
    xdk.finalizeUpload.mockResolvedValue({ data: {} });
    xdk.create.mockResolvedValue({ data: { id: "post-video" } });

    await Effect.runPromise(
      twitterPublisher
        .publish({
          socialProviderId: "connection_x",
          content: {
            postId: "local-video",
            socialProviderId: "connection_x",
            content: [
              {
                order: 0,
                name: "Video",
                text: "Video post",
                tags: [],
                media: [
                  { mediaType: "VIDEO", url: "https://media.test/clip.mp4" },
                ],
              },
            ],
          },
        })
        .pipe(Effect.provide(currentStore()))
    );

    expect(xdk.initializeUpload).toHaveBeenCalledWith({
      totalBytes: 5,
      mediaType: "video/mp4",
      mediaCategory: "tweet_video",
    });
    expect(xdk.appendUpload).toHaveBeenCalledWith("media-video", {
      media: Buffer.from("video").toString("base64"),
      segmentIndex: 0,
    });
    expect(xdk.finalizeUpload).toHaveBeenCalledWith("media-video");
    expect(xdk.create).toHaveBeenCalledWith({
      text: "Video post",
      media: { mediaIds: ["media-video"] },
    });
  });
});

describe("X OAuth PKCE", () => {
  it("mints a fresh S256 verifier and stores it against signed state", async () => {
    vi.stubEnv("TWITTER_CLIENT_ID", "client");
    vi.stubEnv("TWITTER_CALLBACK_URL", "https://app.test/callback");
    const temporaryStore = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const first = new URL(
      await twitterAuth.getConnectUrl({
        state: "signed-state-1",
        temporaryStore,
      })
    );
    const second = new URL(
      await twitterAuth.getConnectUrl({
        state: "signed-state-2",
        temporaryStore,
      })
    );

    expect(first.searchParams.get("code_challenge_method")).toBe("S256");
    expect(first.searchParams.get("code_challenge")).not.toBe("challenge");
    expect(second.searchParams.get("code_challenge")).not.toBe(
      first.searchParams.get("code_challenge")
    );
    expect(temporaryStore.put).toHaveBeenCalledTimes(2);
    expect(temporaryStore.put).toHaveBeenNthCalledWith(
      1,
      "oauth:twitter:pkce:signed-state-1",
      expect.any(String),
      { expirationTtl: 600 }
    );
  });

  it("uses and consumes the stored verifier during callback", async () => {
    vi.stubEnv("TWITTER_CLIENT_ID", "client");
    vi.stubEnv("TWITTER_CLIENT_SECRET", "secret");
    vi.stubEnv("TWITTER_CALLBACK_URL", "https://app.test/callback");
    const temporaryStore = {
      get: vi.fn().mockResolvedValue("stored-verifier"),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 7200,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { id: "x_1", name: "Test", username: "tester" },
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await twitterAuth.handleCallback({
      code: "authorization-code",
      error: null,
      errorReason: null,
      state: "signed-state",
      userId: "user_1",
      upsert: vi.fn().mockResolvedValue({ status: "created" }),
      temporaryStore,
    });

    const tokenRequest = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenRequest[0]).toBe("https://api.x.com/2/oauth2/token");
    expect(String(tokenRequest[1].body)).toContain(
      "code_verifier=stored-verifier"
    );
    expect(temporaryStore.delete).toHaveBeenCalledWith(
      "oauth:twitter:pkce:signed-state"
    );
  });
});

describe("X quotes and Articles", () => {
  const content = (
    settings: import("@delulu/core/publishing/post").TwitterSettings,
    texts = ["First paragraph\nSecond paragraph"]
  ) => ({
    postId: "local-article",
    socialProviderId: "connection_x",
    providerSettings: {
      type: "TWITTER" as const,
      socialProviderId: "connection_x",
      settings,
    },
    content: texts.map((text, order) => ({
      order,
      name: "Post",
      text,
      tags: [],
      media: [] as import("@delulu/core/publishing/post").MediaType[],
    })),
  });
  const publish = (ctx: Parameters<typeof twitterPublisher.publish>[0]) =>
    Effect.runPromise(
      twitterPublisher.publish(ctx).pipe(Effect.provide(currentStore()))
    );
  const article = {
    replyRestriction: "everyone" as const,
    format: "article" as const,
    articleTitle: "My article",
  };

  it("quotes a URL only on the first segment and applies reply restrictions", async () => {
    xdk.create
      .mockResolvedValueOnce({ data: { id: "first" } })
      .mockResolvedValueOnce({ data: { id: "second" } });
    await publish({
      socialProviderId: "connection_x",
      content: content(
        {
          replyRestriction: "mentioned",
          quoteTweetId: "https://x.com/wiz/status/1234567890123456789?s=20",
        },
        ["Comment", "Follow-up"]
      ),
      persistProviderState: vi.fn().mockResolvedValue(undefined),
    });
    expect(xdk.create).toHaveBeenNthCalledWith(1, {
      text: "Comment",
      quoteTweetId: "1234567890123456789",
      replySettings: "mentionedUsers",
    });
    expect(xdk.create).toHaveBeenNthCalledWith(2, {
      text: "Follow-up",
      reply: { inReplyToTweetId: "first" },
      replySettings: "mentionedUsers",
    });
  });

  it("does not re-quote when resuming a thread", async () => {
    xdk.create.mockResolvedValue({ data: { id: "second" } });
    await publish({
      socialProviderId: "connection_x",
      content: content({ replyRestriction: "following", quoteTweetId: "123" }, [
        "Comment",
        "Follow-up",
      ]),
      providerState: { publishedSegmentIds: ["first"] },
      persistProviderState: vi.fn().mockResolvedValue(undefined),
    });
    expect(xdk.create).toHaveBeenCalledTimes(1);
    expect(xdk.create).toHaveBeenCalledWith({
      text: "Follow-up",
      reply: { inReplyToTweetId: "first" },
      replySettings: "following",
    });
  });

  it("saves Article draft progress before publishing a long body with a cover", async () => {
    mockMedia("image");
    xdk.upload.mockResolvedValue({ data: { id: "cover" } });
    xdk.articleCreateDraft.mockResolvedValue({ data: { id: "draft" } });
    const persist = vi.fn().mockResolvedValue(undefined);
    xdk.articlePublish.mockImplementation(async () => {
      expect(persist).toHaveBeenCalledWith({ articleId: "draft" });
      return { data: { postId: "article-post" } };
    });
    const input = content(article, [
      "Long paragraph ".repeat(40) + "\nSecond paragraph",
    ]);
    input.content[0]!.media.push({
      mediaType: "IMAGE",
      url: "https://media.test/cover.jpg",
    });
    const result = await publish({
      socialProviderId: "connection_x",
      content: input,
      persistProviderState: persist,
    });
    expect(xdk.articleCreateDraft).toHaveBeenCalledWith({
      title: "My article",
      contentState: {
        blocks: [
          { text: "Long paragraph ".repeat(40), type: "unstyled" },
          { text: "Second paragraph", type: "unstyled" },
        ],
        entities: [],
      },
      coverMedia: { mediaId: "cover", mediaCategory: "tweet_image" },
    });
    expect(xdk.articlePublish).toHaveBeenCalledWith("draft");
    expect(xdk.create).not.toHaveBeenCalled();
    expect(persist).toHaveBeenLastCalledWith({
      articleId: "draft",
      articlePostId: "article-post",
    });
    expect(result.platformPostId).toBe("article-post");
    expect(result.platformPostUrl).toBe(
      "https://x.com/tester/status/article-post"
    );
  });

  it("reuses a saved Article draft on retry", async () => {
    xdk.articlePublish.mockResolvedValue({ data: { postId: "article-post" } });
    await publish({
      socialProviderId: "connection_x",
      content: content(article),
      providerState: { articleId: "existing-draft" },
      persistProviderState: vi.fn().mockResolvedValue(undefined),
    });
    expect(xdk.articleCreateDraft).not.toHaveBeenCalled();
    expect(xdk.articlePublish).toHaveBeenCalledTimes(1);
    expect(xdk.articlePublish).toHaveBeenCalledWith("existing-draft");
  });

  it.each([
    { ...article, articleTitle: "" },
    { ...article, quoteTweetId: "123" },
    { ...article, replyRestriction: "following" as const },
    {
      replyRestriction: "everyone" as const,
      quoteTweetId: "https://evil.test/wiz/status/123",
    },
  ])("rejects invalid settings before creating remote content: %j", async (settings) => {
    await expect(
      publish({
        socialProviderId: "connection_x",
        content: content(settings),
        persistProviderState: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toMatchObject({ retryable: false });
    expect(xdk.create).not.toHaveBeenCalled();
    expect(xdk.articleCreateDraft).not.toHaveBeenCalled();
    expect(xdk.articlePublish).not.toHaveBeenCalled();
  });

  it("rejects Article threads, empty bodies, unsupported media and missing durable storage", async () => {
    for (const input of [
      content(article, ["One", "Two"]),
      content(article, [" "]),
      content(article),
    ]) {
      await expect(
        publish({ socialProviderId: "connection_x", content: input })
      ).rejects.toMatchObject({ retryable: false });
    }
    const input = content(article);
    input.content[0]!.media.push({
      mediaType: "VIDEO",
      url: "https://media.test/video.mp4",
    });
    await expect(
      publish({
        socialProviderId: "connection_x",
        content: input,
        persistProviderState: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toMatchObject({ retryable: false });
    expect(xdk.articleCreateDraft).not.toHaveBeenCalled();
  });

  it("never publishes after failing to persist a newly created Article draft", async () => {
    xdk.articleCreateDraft.mockResolvedValue({ data: { id: "draft" } });
    await expect(
      publish({
        socialProviderId: "connection_x",
        content: content(article),
        persistProviderState: vi
          .fn()
          .mockRejectedValue(new Error("DB unavailable")),
      })
    ).rejects.toMatchObject({ code: "AMBIGUOUS_PUBLISH", retryable: false });
    expect(xdk.articleCreateDraft).toHaveBeenCalledTimes(1);
    expect(xdk.articlePublish).not.toHaveBeenCalled();
  });

  it("returns a durably published Article without creating another post", async () => {
    const result = await publish({
      socialProviderId: "connection_x",
      content: content(article),
      providerState: { articleId: "draft", articlePostId: "published-post" },
      persistProviderState: vi.fn().mockResolvedValue(undefined),
    });
    expect(result.platformPostId).toBe("published-post");
    expect(xdk.articleCreateDraft).not.toHaveBeenCalled();
    expect(xdk.articlePublish).not.toHaveBeenCalled();
  });

  it("stops automatic retries if a published Article result cannot be saved", async () => {
    xdk.articlePublish.mockResolvedValue({
      data: { postId: "published-post" },
    });
    await expect(
      publish({
        socialProviderId: "connection_x",
        content: content(article),
        providerState: { articleId: "draft" },
        persistProviderState: vi
          .fn()
          .mockRejectedValue(new Error("database unavailable")),
      })
    ).rejects.toMatchObject({ code: "AMBIGUOUS_PUBLISH", retryable: false });
    expect(xdk.articlePublish).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unconfirmed Article draft creation", async () => {
    xdk.articleCreateDraft.mockRejectedValue(new Error("connection reset"));
    await expect(
      publish({
        socialProviderId: "connection_x",
        content: content(article),
        persistProviderState: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toMatchObject({ code: "AMBIGUOUS_PUBLISH", retryable: false });
    expect(xdk.articleCreateDraft).toHaveBeenCalledTimes(1);
    expect(xdk.articlePublish).not.toHaveBeenCalled();
  });

  it("does not retry an unconfirmed Article publish", async () => {
    xdk.articlePublish.mockRejectedValue(new Error("connection reset"));
    await expect(
      publish({
        socialProviderId: "connection_x",
        content: content(article),
        providerState: { articleId: "draft" },
        persistProviderState: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toMatchObject({ code: "AMBIGUOUS_PUBLISH", retryable: false });
    expect(xdk.articlePublish).toHaveBeenCalledTimes(1);
  });
});
