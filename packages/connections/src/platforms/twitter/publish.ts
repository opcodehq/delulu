import {
  getValidMediaUrls,
  type MediaType,
  type SocialPublishInputType,
} from "@delulu/core/publishing/post";
import { Client } from "@xdevplatform/xdk";
import axios from "axios";
import { Duration, Effect } from "effect";
import {
  ambiguousPublish,
  type ConnectionError,
  fromUnknownCreate,
  fromUnknownHttp,
  invalidMedia,
  mediaProcessingError,
  mediaProcessingTimeout,
  networkError,
  profileNotFound,
  publishRejected,
} from "../../errors";
import { inspectMedia, readMediaRange } from "../../remote-media";
import { ConnectionStore } from "../../services/connection-store";
import { ensureFreshToken } from "../../services/token-service";
import type {
  PlatformPublisher,
  PostResult,
  PublishContext,
} from "../../types";
import { PROVIDER } from "./constants";

const POLL_MAX_ATTEMPTS = 30;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

interface TwitterProfile {
  id: string;
  accessToken: string;
  username?: string;
}

interface Tweet {
  text: string;
  media: MediaType[];
  order: number;
}

type MediaCategory = "tweet_image" | "tweet_gif" | "tweet_video";

// ── MIME helpers (ported verbatim) ────────────────────────────────────────────

const getMimeType = (url: string): string => {
  const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
};

const getMediaCategory = (mimeType: string): MediaCategory => {
  if (mimeType === "image/gif") {
    return "tweet_gif";
  }
  if (mimeType.startsWith("image/")) {
    return "tweet_image";
  }
  if (mimeType.startsWith("video/")) {
    return "tweet_video";
  }
  return "tweet_image";
};

// ── Profile ─────────────────────────────────────────────────────────────────

const getProfile = (
  socialProviderId: string
): Effect.Effect<TwitterProfile, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const store = yield* ConnectionStore;
    const profile =
      yield* store.getSocialProviderWithDecryptedTokens(socialProviderId);
    if (!profile?.accessToken) {
      return yield* Effect.fail(profileNotFound(PROVIDER));
    }
    return {
      id: profile._id,
      accessToken: profile.accessToken,
      username: profile.username ?? undefined,
    };
  });

// ── Media download + upload ───────────────────────────────────────────────────

const oneShotUpload = (
  client: Client,
  buffer: Buffer,
  mediaCategory: MediaCategory
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        client.media.upload({
          media: buffer.toString("base64"),
          mediaCategory,
        }),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    if (!response.data?.id) {
      return yield* Effect.fail(invalidMedia(PROVIDER, "image upload failed"));
    }
    return response.data.id as string;
  });

const initializeChunkedUpload = (
  client: Client,
  totalBytes: number,
  mimeType: string,
  mediaCategory: MediaCategory
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        client.media.initializeUpload({
          totalBytes,
          // MIME is derived from a validated media URL at this boundary.
          mediaType: mimeType as
            | "video/mp4"
            | "video/webm"
            | "video/quicktime"
            | "image/jpeg"
            | "image/gif"
            | "image/png"
            | "image/webp",
          mediaCategory,
        }),
      catch: () => networkError(PROVIDER, "media upload initialization"),
    });
    if (!response.data?.id) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "media upload initialization failed")
      );
    }
    return response.data.id as string;
  });

const uploadChunks = (
  client: Client,
  mediaId: string,
  fileUrl: string,
  fileSize: number,
  mimeType: string
): Effect.Effect<void, ConnectionError> => {
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  const uploadAllChunks = async (): Promise<void> => {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunk = Buffer.from(await readMediaRange(fileUrl, start, end - 1));

      await client.media.appendUpload(mediaId, {
        media: chunk.toString("base64"),
        segmentIndex: i,
      });
    }
  };

  return Effect.tryPromise({
    try: () => uploadAllChunks(),
    catch: () => networkError(PROVIDER, "chunk upload"),
  });
};

const finalizeUpload = (
  client: Client,
  mediaId: string
): Effect.Effect<{ processingRequired: boolean }, ConnectionError> =>
  Effect.tryPromise({
    try: () => client.media.finalizeUpload(mediaId),
    catch: () => networkError(PROVIDER, "media finalization"),
  }).pipe(
    Effect.map((response) => ({
      processingRequired: !!response.data?.processingInfo,
    }))
  );

const waitForProcessing = (
  client: Client,
  mediaId: string,
  attempt = 0
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }

    const response = yield* Effect.tryPromise({
      try: () => client.media.getUploadStatus(mediaId),
      catch: () => networkError(PROVIDER, "status check"),
    });

    const processingInfo = response.data?.processingInfo;
    if (!processingInfo) {
      return; // no processing info → treated as complete
    }

    if (processingInfo.state === "succeeded") {
      return;
    }
    if (processingInfo.state === "failed") {
      return yield* Effect.fail(
        mediaProcessingError(
          PROVIDER,
          // biome-ignore lint/suspicious/noExplicitAny: XDK processing_info type doesn't include error field
          (processingInfo as any).error?.message
        )
      );
    }

    const waitMs = Math.max((processingInfo.checkAfterSecs ?? 10) * 1000, 1000);
    yield* Effect.sleep(Duration.millis(waitMs));
    return yield* waitForProcessing(client, mediaId, attempt + 1);
  });

const uploadMediaToTwitter = (
  fileUrl: string,
  client: Client
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const { size } = yield* Effect.tryPromise({
      try: () => inspectMedia(fileUrl),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    const mimeType = getMimeType(fileUrl);
    const mediaCategory = getMediaCategory(mimeType);
    const isSmallImage =
      mimeType.startsWith("image/") &&
      mimeType !== "image/gif" &&
      size <= 5 * 1024 * 1024;

    if (isSmallImage) {
      const bytes = yield* Effect.tryPromise({
        try: () => readMediaRange(fileUrl, 0, size - 1),
        catch: (e) => fromUnknownHttp(PROVIDER, e),
      });
      return yield* oneShotUpload(client, Buffer.from(bytes), mediaCategory);
    }

    const mediaId = yield* initializeChunkedUpload(
      client,
      size,
      mimeType,
      mediaCategory
    );
    yield* uploadChunks(client, mediaId, fileUrl, size, mimeType);
    const { processingRequired } = yield* finalizeUpload(client, mediaId);
    if (processingRequired) {
      yield* waitForProcessing(client, mediaId);
    }
    return mediaId;
  });

const uploadTweetMedia = (
  media: MediaType[],
  client: Client
): Effect.Effect<string[], ConnectionError> => {
  if (!media.length) {
    return Effect.succeed([]);
  }

  const validMediaUrls = getValidMediaUrls(media.slice(0, 4)).filter(
    (item) => item.url
  );

  return Effect.all(
    validMediaUrls.map((item) =>
      uploadMediaToTwitter(item.url as string, client)
    ),
    { concurrency: 1 }
  );
};

// ── Tweets / thread ────────────────────────────────────────────────────────────

const validateAndSortTweets = (
  content: SocialPublishInputType["content"]
): Effect.Effect<Tweet[], ConnectionError> => {
  if (!content.length) {
    return Effect.fail(invalidMedia(PROVIDER, "No content to publish"));
  }

  const tweets: Tweet[] = content
    .map((tweet) => ({
      text: tweet.text,
      media: tweet.media,
      order: tweet.order,
    }))
    .sort((a, b) => a.order - b.order);

  return Effect.succeed(tweets);
};

const postTweet = (
  tweet: Tweet,
  client: Client,
  replyToTweetId?: string
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const mediaIds = yield* uploadTweetMedia(tweet.media, client);
    const tweetData = {
      text: tweet.text,
      ...(replyToTweetId
        ? { reply: { inReplyToTweetId: replyToTweetId } }
        : {}),
      ...(mediaIds.length > 0 && { media: { mediaIds } }),
    };

    const response = yield* Effect.tryPromise({
      try: () => client.posts.create(tweetData),
      catch: (e) => fromUnknownCreate(PROVIDER, e),
    });
    if (!response.data?.id) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "post creation failed")
      );
    }
    return response.data.id;
  });

const publishTwitterThread = (
  tweets: Tweet[],
  profile: TwitterProfile,
  postId: string,
  providerState?: Record<string, unknown>,
  persistProviderState?: (state: Record<string, unknown>) => Promise<void>
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const client = new Client({ accessToken: profile.accessToken });
    const storedIds = providerState?.publishedSegmentIds;
    const publishedSegmentIds = Array.isArray(storedIds)
      ? storedIds.filter((id): id is string => typeof id === "string")
      : [];
    if (
      publishedSegmentIds.length > tweets.length ||
      (Array.isArray(storedIds) &&
        publishedSegmentIds.length !== storedIds.length)
    ) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "Stored thread progress is invalid")
      );
    }
    if (tweets.length > 1 && !persistProviderState) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "Durable thread progress is unavailable")
      );
    }

    for (
      let index = publishedSegmentIds.length;
      index < tweets.length;
      index++
    ) {
      const tweet = tweets[index];
      if (!tweet) {
        break;
      }
      const previousId = publishedSegmentIds[index - 1];
      const tweetId = yield* postTweet(tweet, client, previousId);
      publishedSegmentIds.push(tweetId);
      if (persistProviderState) {
        yield* Effect.tryPromise({
          try: () =>
            persistProviderState({
              publishedSegmentIds: [...publishedSegmentIds],
            }),
          catch: () => ambiguousPublish(PROVIDER),
        });
      }
    }

    const firstTweetId = publishedSegmentIds[0];
    if (!firstTweetId) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "post creation returned no ID")
      );
    }

    return {
      platformPostId: firstTweetId,
      postId,
      platformId: profile.id,
      platformPostUrl: `https://x.com/${profile.username ?? "unknown"}/status/${firstTweetId}`,
      postedAt: new Date(),
    } satisfies PostResult;
  });

// ── Orchestration ────────────────────────────────────────────────────────────

const publishContent = (
  content: SocialPublishInputType,
  profile: TwitterProfile,
  providerState?: Record<string, unknown>,
  persistProviderState?: (state: Record<string, unknown>) => Promise<void>
): Effect.Effect<PostResult, ConnectionError> =>
  validateAndSortTweets(content.content).pipe(
    Effect.flatMap((tweets) =>
      publishTwitterThread(
        tweets,
        profile,
        content.postId,
        providerState,
        persistProviderState
      )
    )
  );

export const twitterPublisher: PlatformPublisher = {
  id: "TWITTER",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) =>
        ensureFreshToken(ctx.socialProviderId).pipe(
          Effect.flatMap((accessToken) =>
            publishContent(
              ctx.content,
              { ...profile, accessToken },
              ctx.providerState,
              ctx.persistProviderState
            )
          )
        )
      )
    ),
};
