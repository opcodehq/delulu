import {
  getValidMediaUrls,
  type MediaType,
  type SocialPublishInputType,
} from "@delulu/core/publishing/post";
import axios from "axios";
import { Duration, Effect } from "effect";
import {
  type ConnectionError,
  fromUnknownHttp,
  invalidMedia,
  mediaProcessingError,
  mediaProcessingTimeout,
  profileNotFound,
} from "../../errors";
import { ConnectionStore } from "../../services/connection-store";
import type {
  PlatformPublisher,
  PostResult,
  PublishContext,
} from "../../types";
import {
  GRAPH_VERSION,
  POLL_INTERVAL_MS,
  POLL_MAX_ATTEMPTS,
  PROVIDER,
} from "./constants";

const graph = (path: string) =>
  `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;

interface FacebookProfile {
  id: string;
  profileId: string;
  accessToken: string;
  username: string;
}
interface FacebookMediaUploadResponse {
  id: string;
  upload_url?: string;
}
interface FacebookVideoInitResponse {
  videoId: string;
  uploadUrl: string;
}
interface FacebookVideoStatus {
  video_status: string;
  processing_phase?: {
    status: string;
    errors?: { message: string; code: number }[];
  };
}
interface FacebookPostResponse {
  id: string;
  post_id?: string;
}
interface FacebookPostDetails {
  id: string;
  permalink_url: string;
}

// ── Profile ─────────────────────────────────────────────────────────────────

const getProfile = (
  socialProviderId: string
): Effect.Effect<FacebookProfile, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const store = yield* ConnectionStore;
    const profile =
      yield* store.getSocialProviderWithDecryptedTokens(socialProviderId);
    if (!(profile?.accessToken && profile.profileId)) {
      return yield* Effect.fail(profileNotFound(PROVIDER));
    }
    return {
      id: profile._id,
      profileId: profile.profileId,
      accessToken: profile.accessToken,
      username: profile.username ?? "",
    };
  });

// ── Photo upload ─────────────────────────────────────────────────────────────

const uploadPhoto = (
  media: MediaType,
  profile: FacebookProfile
): Effect.Effect<string, ConnectionError> => {
  if (!media.url) {
    return Effect.fail(invalidMedia(PROVIDER, "Media URL is required"));
  }
  const params = new URLSearchParams({
    access_token: profile.accessToken,
    url: media.url,
    published: "false",
    temporary: "false",
  });
  return Effect.tryPromise({
    try: () =>
      axios
        .post<FacebookMediaUploadResponse>(
          `${graph(`${profile.profileId}/photos`)}?${params.toString()}`
        )
        .then((r) => r.data.id),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });
};

// ── Reel (video) upload ──────────────────────────────────────────────────────

const initializeReelUpload = (
  profile: FacebookProfile
): Effect.Effect<FacebookVideoInitResponse, ConnectionError> =>
  Effect.gen(function* () {
    const data = yield* Effect.tryPromise({
      try: () =>
        axios
          .post(graph(`${profile.profileId}/video_reels`), {
            upload_phase: "start",
            access_token: profile.accessToken,
          })
          .then((r) => r.data as { video_id?: string; upload_url?: string }),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    const { video_id: videoId, upload_url: uploadUrl } = data;
    if (!(videoId && uploadUrl)) {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Reel init missing video_id/upload_url")
      );
    }
    return { videoId, uploadUrl };
  });

const uploadReelContent = (
  uploadUrl: string,
  videoUrl: string,
  accessToken: string
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const deadline = AbortSignal.timeout(5 * 60_000);
        const source = await fetch(videoUrl, { signal: deadline });
        if (!(source.ok && source.body)) {
          await source.body?.cancel();
          throw new Error(`Video fetch returned ${source.status}`);
        }
        const size = source.headers.get("content-length");
        if (!size) {
          await source.body.cancel();
          throw new Error("Video size unavailable");
        }
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: source.body,
          signal: deadline,
          duplex: "half",
          headers: {
            Authorization: `OAuth ${accessToken}`,
            "content-type": "application/octet-stream",
            file_size: size,
            offset: "0",
          },
        } as RequestInit).catch(async (error) => {
          await source.body?.cancel().catch(() => undefined);
          throw error;
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Video upload returned ${response.status}`);
        }
        await response.body?.cancel();
      },
      catch: (error) => fromUnknownHttp(PROVIDER, error),
    });
  });

const publishReel = (
  profile: FacebookProfile,
  videoId: string,
  description: string
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const data = yield* Effect.tryPromise({
      try: () =>
        axios
          .post(graph(`${profile.profileId}/video_reels`), {
            video_id: videoId,
            upload_phase: "finish",
            description,
            access_token: profile.accessToken,
            published: "1",
          })
          .then((r) => r.data as { success?: boolean }),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    if (!data.success) {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Reel publish failed")
      );
    }
    // Always return the videoId — we still wait for processing to complete.
    return videoId;
  });

const checkVideoStatus = (
  videoId: string,
  accessToken: string
): Effect.Effect<FacebookVideoStatus, ConnectionError> =>
  Effect.tryPromise({
    try: () =>
      axios
        .get(graph(videoId), {
          params: {
            fields: "status,id,title,description,updated_time",
            access_token: accessToken,
          },
        })
        .then((r) => r.data.status as FacebookVideoStatus),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

const waitForVideoProcessing = (
  videoId: string,
  accessToken: string,
  attempt = 0
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }

    const status = yield* checkVideoStatus(videoId, accessToken);

    if (status.video_status === "error") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Video processing failed")
      );
    }
    if (status.processing_phase?.status === "error") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Video processing phase failed")
      );
    }
    if (
      status.video_status === "ready" ||
      status.video_status === "published" ||
      (status.video_status === "upload_complete" &&
        status.processing_phase?.status === "complete")
    ) {
      return;
    }

    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
    return yield* waitForVideoProcessing(videoId, accessToken, attempt + 1);
  });

const processReelMedia = (
  media: MediaType,
  profile: FacebookProfile,
  text: string
): Effect.Effect<string, ConnectionError> => {
  if (!media.url) {
    return Effect.fail(invalidMedia(PROVIDER, "Video URL is required"));
  }
  const videoUrl = media.url;
  return initializeReelUpload(profile).pipe(
    Effect.flatMap(({ videoId, uploadUrl }) =>
      uploadReelContent(uploadUrl, videoUrl, profile.accessToken).pipe(
        Effect.flatMap(() => publishReel(profile, videoId, text)),
        Effect.flatMap(() =>
          waitForVideoProcessing(videoId, profile.accessToken)
        ),
        Effect.map(() => videoId)
      )
    )
  );
};

const processMedia = (
  media: MediaType,
  profile: FacebookProfile,
  text: string
): Effect.Effect<string, ConnectionError> =>
  media.mediaType === "VIDEO"
    ? processReelMedia(media, profile, text)
    : uploadPhoto(media, profile);

// ── Feed post ────────────────────────────────────────────────────────────────

const createFeedPost = (
  profile: FacebookProfile,
  message: string,
  mediaIds: string[]
): Effect.Effect<FacebookPostResponse, ConnectionError> => {
  const data: Record<string, string | { media_fbid: string }[]> = {
    access_token: profile.accessToken,
    message,
    published: "1",
  };
  if (mediaIds.length > 0) {
    data.attached_media = mediaIds.map((id) => ({ media_fbid: id }));
  }
  return Effect.tryPromise({
    try: () =>
      axios
        .post<FacebookPostResponse>(graph(`${profile.profileId}/feed`), data, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })
        .then((r) => r.data),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });
};

const getPostDetails = (
  postId: string,
  accessToken: string
): Effect.Effect<FacebookPostDetails, ConnectionError> =>
  Effect.tryPromise({
    try: () =>
      axios
        .get<FacebookPostDetails>(graph(postId), {
          params: { access_token: accessToken, fields: "id,permalink_url" },
        })
        .then((r) => r.data),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

// ── Orchestration ────────────────────────────────────────────────────────────

const publishContent = (
  content: SocialPublishInputType,
  profile: FacebookProfile
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const firstContent = content.content[0];
    if (!firstContent) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    const validMedia = getValidMediaUrls(firstContent.media) as MediaType[];

    // Process all media in parallel (mirrors ResultAsync.combine).
    const mediaIds = yield* Effect.all(
      validMedia.map((media) =>
        processMedia(media, profile, firstContent.text)
      ),
      { concurrency: "unbounded" }
    );

    const hasVideos = validMedia.some((media) => media.mediaType === "VIDEO");

    // Reels are standalone — return the reel info directly.
    if (hasVideos && mediaIds.length > 0) {
      return {
        platformPostId: mediaIds[0],
        postId: content.postId,
        platformId: profile.id,
        platformPostUrl: `https://www.facebook.com/${profile.profileId}/videos/${mediaIds[0]}`,
        postedAt: new Date(),
      } satisfies PostResult;
    }

    // Otherwise create a feed post for photos/text.
    const postResponse = yield* createFeedPost(
      profile,
      firstContent.text,
      mediaIds
    );
    const postDetails = yield* getPostDetails(
      postResponse.id,
      profile.accessToken
    );
    return {
      platformPostId: postResponse.id,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: postDetails.permalink_url,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const facebookPublisher: PlatformPublisher = {
  id: "FACEBOOK",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) => publishContent(ctx.content, profile))
    ),
};
