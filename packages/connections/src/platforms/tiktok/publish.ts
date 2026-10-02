import {
  getValidMediaUrls,
  promotionContentTypes,
  type SocialPublishInputType,
  type TikTokSettings,
} from "@delulu/core/publishing/post";
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
  profileNotFound,
  publishRejected,
} from "../../errors";
import { ConnectionStore } from "../../services/connection-store";
import { ensureFreshToken } from "../../services/token-service";
import type {
  PlatformPublisher,
  PostResult,
  PublishContext,
} from "../../types";
import {
  PHOTO_INIT_URL,
  POLL_INTERVAL_MS,
  POLL_MAX_ATTEMPTS,
  PROVIDER,
  STATUS_FETCH_URL,
  TITLE_LIMIT,
  VIDEO_INIT_URL,
} from "./constants";
import { getTikTokCreatorInfo } from "./queries";

export const buildTikTokCommercialFields = (
  promotionContent: TikTokSettings["promotionContent"]
) => ({
  brand_organic_toggle:
    promotionContent === promotionContentTypes.SELF ||
    promotionContent === promotionContentTypes.BOTH,
  brand_content_toggle:
    promotionContent === promotionContentTypes.PAID ||
    promotionContent === promotionContentTypes.BOTH,
});

export const buildTikTokPhotoPost = (
  photoUrls: string[],
  caption: string,
  settings: TikTokSettings
) => ({
  media_type: "PHOTO" as const,
  post_mode: "DIRECT_POST" as const,
  post_info: {
    title: caption.slice(0, 90),
    description: caption.slice(0, 4000),
    privacy_level: settings.privacy,
    disable_comment: settings.allowComments === false,
    auto_add_music: true,
    ...buildTikTokCommercialFields(settings.promotionContent),
  },
  source_info: {
    source: "PULL_FROM_URL" as const,
    photo_images: photoUrls,
    photo_cover_index: 0,
  },
});

/**
 * TikTok publishing (Effect port of `worker/providers/tiktok.provider.ts`).
 *
 * Flow: refresh the access token (TikTok's short-lived tokens expire fast),
 * init a video publish via PULL_FROM_URL, poll publish status until
 * PUBLISH_COMPLETE, then use the public post ID returned after moderation when
 * TikTok makes one available.
 */

interface TikTokProfile {
  id: string;
  username: string;
  profileId: string;
}
interface TikTokVideoInitResponse {
  data?: { publish_id?: string };
}
interface TikTokStatusResponse {
  data?: {
    status?: string;
    fail_reason?: string;
    publicaly_available_post_id?: Array<string | number>;
  };
}
const getProfile = (
  socialProviderId: string
): Effect.Effect<TikTokProfile, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const store = yield* ConnectionStore;
    const profile =
      yield* store.getSocialProviderWithDecryptedTokens(socialProviderId);
    if (!profile?.accessToken) {
      return yield* Effect.fail(profileNotFound(PROVIDER));
    }
    return {
      id: profile._id,
      username: profile.username ?? "",
      profileId: profile.profileId ?? "",
    } satisfies TikTokProfile;
  });

/**
 * Init a video publish via PULL_FROM_URL, threading TikTok content settings
 * (privacy/comments/duet/stitch/promotion) into `post_info`. Returns publish_id.
 */
const uploadVideo = (
  accessToken: string,
  videoUrl: string,
  caption: string,
  media: { thumbnailTimestamp?: number },
  settings: TikTokSettings
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const thumbnailTimestampMs = media.thumbnailTimestamp
      ? Math.floor(media.thumbnailTimestamp * 1000)
      : 1000;

    // biome-ignore lint/suspicious/noExplicitAny: TikTok post_info is dynamically shaped.
    const postInfo: any = {
      title: caption.slice(0, TITLE_LIMIT) || "TikTok Video",
      privacy_level: settings.privacy,
      disable_duet: settings.allowDuet === false,
      disable_comment: settings.allowComments === false,
      disable_stitch: settings.allowStitch === false,
      video_cover_timestamp_ms: thumbnailTimestampMs,
      ...buildTikTokCommercialFields(settings.promotionContent),
    };

    const uploadData = {
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
      post_info: postInfo,
    };

    const data = yield* Effect.tryPromise({
      try: () =>
        axios
          .post(VIDEO_INIT_URL, uploadData, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
            },
          })
          .then((r) => r.data as TikTokVideoInitResponse),
      catch: (err) => fromUnknownCreate(PROVIDER, err),
    });

    const publishId = data.data?.publish_id;
    if (!publishId) {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Failed to get publish ID from TikTok")
      );
    }
    return publishId;
  });

const uploadPhotos = (
  accessToken: string,
  photoUrls: string[],
  caption: string,
  settings: TikTokSettings
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const data = yield* Effect.tryPromise({
      try: () =>
        axios
          .post(
            PHOTO_INIT_URL,
            buildTikTokPhotoPost(photoUrls, caption, settings),
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
              },
            }
          )
          .then((response) => response.data as TikTokVideoInitResponse),
      catch: (error) => fromUnknownCreate(PROVIDER, error),
    });
    const publishId = data.data?.publish_id;
    if (!publishId) {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Failed to get publish ID from TikTok")
      );
    }
    return publishId;
  });

const checkPostStatus = (
  accessToken: string,
  publishId: string
): Effect.Effect<
  { status: string; fail_reason?: string; postId?: string },
  ConnectionError
> =>
  Effect.gen(function* () {
    const data = yield* Effect.tryPromise({
      try: () =>
        axios
          .post(
            STATUS_FETCH_URL,
            { publish_id: publishId },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
              },
            }
          )
          .then((r) => r.data as TikTokStatusResponse),
      catch: (err) => fromUnknownHttp(PROVIDER, err),
    });

    if (!data.data) {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Failed to get post status from TikTok")
      );
    }
    return {
      status: data.data.status ?? "",
      fail_reason: data.data.fail_reason,
      postId: data.data.publicaly_available_post_id?.[0]?.toString(),
    };
  });

/** Poll publish status until PUBLISH_COMPLETE / FAILED / timeout. */
const waitForPostCompletion = (
  accessToken: string,
  publishId: string,
  attempt = 0
): Effect.Effect<string | null, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }

    const { status, fail_reason, postId } = yield* checkPostStatus(
      accessToken,
      publishId
    );

    if (status === "PUBLISH_COMPLETE") {
      return postId ?? null;
    }
    if (status === "FAILED") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, fail_reason || "Unknown error")
      );
    }

    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
    return yield* waitForPostCompletion(accessToken, publishId, attempt + 1);
  });

const waitForPublicPostId = (
  accessToken: string,
  publishId: string,
  attempt = 0
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }
    const { status, fail_reason, postId } = yield* checkPostStatus(
      accessToken,
      publishId
    );
    if (postId) {
      return postId;
    }
    if (status === "FAILED") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, fail_reason || "Unknown error")
      );
    }
    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
    return yield* waitForPublicPostId(accessToken, publishId, attempt + 1);
  });

const persistTikTokState = (
  persistProviderState: PublishContext["persistProviderState"],
  state: Record<string, unknown>
): Effect.Effect<void, ConnectionError> =>
  persistProviderState
    ? Effect.tryPromise({
        try: () => persistProviderState(state),
        catch: () => ambiguousPublish(PROVIDER),
      })
    : Effect.void;

const publishContent = (
  content: SocialPublishInputType,
  profile: TikTokProfile,
  providerState?: Record<string, unknown>,
  persistProviderState?: (state: Record<string, unknown>) => Promise<void>
): Effect.Effect<PostResult, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const firstContent = content.content[0];
    if (!firstContent) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    const validMedia = getValidMediaUrls(firstContent.media);
    const videoMedia = validMedia.find((m) => m.mediaType === "VIDEO" && m.url);
    const photoUrls = validMedia.flatMap((item) =>
      item.mediaType === "IMAGE" && item.url ? [item.url] : []
    );
    if (!(videoMedia?.url || photoUrls.length > 0)) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "TikTok requires a video or photo carousel")
      );
    }

    const caption = firstContent.text || "TikTok Video";

    const tiktokSettings =
      content.providerSettings?.type === "TIKTOK"
        ? content.providerSettings.settings
        : undefined;
    if (!tiktokSettings) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "TikTok creator settings are required")
      );
    }

    const storedPublishId =
      typeof providerState?.tiktokPublishId === "string"
        ? providerState.tiktokPublishId
        : undefined;
    const storedPostId =
      typeof providerState?.tiktokPublicPostId === "string"
        ? providerState.tiktokPublicPostId
        : undefined;
    const storedStatus = providerState?.tiktokStatus;
    const hasStoredPublish =
      storedPublishId !== undefined &&
      (storedStatus === "INITIATED" || storedStatus === "PUBLISH_COMPLETE");
    if (
      storedStatus === "PUBLISH_COMPLETE" &&
      storedPublishId !== undefined &&
      (storedPostId !== undefined || tiktokSettings.privacy === "SELF_ONLY")
    ) {
      return {
        platformPostId: storedPostId ?? storedPublishId,
        postId: content.postId,
        platformId: profile.id,
        platformPostUrl: storedPostId
          ? `https://www.tiktok.com/@${profile.username}/video/${storedPostId}`
          : "",
        postedAt: new Date(),
      } satisfies PostResult;
    }
    if (hasStoredPublish && !persistProviderState) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "Durable publish progress is unavailable")
      );
    }

    const freshAccessToken = yield* ensureFreshToken(profile.id);
    if (!hasStoredPublish) {
      const creator = yield* getTikTokCreatorInfo({
        accessToken: freshAccessToken,
      });
      if (!creator.privacy_level_options.includes(tiktokSettings.privacy)) {
        return yield* Effect.fail(
          publishRejected(
            PROVIDER,
            "The selected privacy level is not available for this creator"
          )
        );
      }
      if (creator.comment_disabled && tiktokSettings.allowComments) {
        return yield* Effect.fail(
          publishRejected(PROVIDER, "Comments are disabled for this creator")
        );
      }
      if (creator.duet_disabled && tiktokSettings.allowDuet) {
        return yield* Effect.fail(
          publishRejected(PROVIDER, "Duet is disabled for this creator")
        );
      }
      if (creator.stitch_disabled && tiktokSettings.allowStitch) {
        return yield* Effect.fail(
          publishRejected(PROVIDER, "Stitch is disabled for this creator")
        );
      }
      if (
        videoMedia?.durationSeconds !== undefined &&
        videoMedia.durationSeconds > creator.max_video_post_duration_sec
      ) {
        return yield* Effect.fail(
          invalidMedia(
            PROVIDER,
            `Video duration exceeds this creator's ${creator.max_video_post_duration_sec}-second limit`
          )
        );
      }
    }

    if (!persistProviderState) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "Durable publish progress is unavailable")
      );
    }

    let publishId: string;
    if (hasStoredPublish && storedPublishId) {
      publishId = storedPublishId;
    } else {
      publishId = videoMedia?.url
        ? yield* uploadVideo(
            freshAccessToken,
            videoMedia.url,
            caption,
            videoMedia,
            tiktokSettings
          )
        : yield* uploadPhotos(
            freshAccessToken,
            photoUrls,
            caption,
            tiktokSettings
          );
      yield* persistTikTokState(persistProviderState, {
        tiktokStatus: "INITIATED",
        tiktokPublishId: publishId,
      });
    }

    let publicPostId = typeof storedPostId === "string" ? storedPostId : null;
    if (storedStatus !== "PUBLISH_COMPLETE") {
      publicPostId = yield* waitForPostCompletion(freshAccessToken, publishId);
      yield* persistTikTokState(persistProviderState, {
        tiktokStatus: "PUBLISH_COMPLETE",
        tiktokPublishId: publishId,
        ...(publicPostId ? { tiktokPublicPostId: publicPostId } : {}),
      });
    }
    if (!publicPostId && tiktokSettings.privacy !== "SELF_ONLY") {
      publicPostId = yield* waitForPublicPostId(freshAccessToken, publishId);
      yield* persistTikTokState(persistProviderState, {
        tiktokStatus: "PUBLISH_COMPLETE",
        tiktokPublishId: publishId,
        tiktokPublicPostId: publicPostId,
      });
    }

    return {
      platformPostId: publicPostId ?? publishId,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: publicPostId
        ? `https://www.tiktok.com/@${profile.username}/video/${publicPostId}`
        : "",
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const tiktokPublisher: PlatformPublisher = {
  id: "TIKTOK",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) =>
        publishContent(
          ctx.content,
          profile,
          ctx.providerState,
          ctx.persistProviderState
        )
      )
    ),
};
