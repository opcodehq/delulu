import {
  getValidMediaUrls,
  type ProviderSetting,
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
import { CAPTION_LIMIT, PROVIDER, PUBLISH_GRAPH_VERSION } from "./constants";

const POLL_MAX_ATTEMPTS = 60; // 10 minutes at 10s intervals
const POLL_INTERVAL_MS = 10_000;

interface IgProfile {
  id: string;
  profileId: string;
  accessToken: string;
}
interface IgContainer {
  id: string;
}
interface IgContainerStatus {
  status_code: "IN_PROGRESS" | "FINISHED" | "ERROR";
  status?: string;
}

const base = (profileId: string) =>
  `https://graph.instagram.com/${PUBLISH_GRAPH_VERSION}/${profileId}`;

const post = <T>(url: string): Effect.Effect<T, ConnectionError> =>
  Effect.tryPromise({
    try: () => axios.post(url).then((r) => r.data as T),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

const get = <T>(
  url: string,
  params: Record<string, string>
): Effect.Effect<T, ConnectionError> =>
  Effect.tryPromise({
    try: () => axios.get(url, { params }).then((r) => r.data as T),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

// ── Profile ─────────────────────────────────────────────────────────────────

const getProfile = (
  socialProviderId: string
): Effect.Effect<IgProfile, ConnectionError, ConnectionStore> =>
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
    };
  });

// ── Containers ───────────────────────────────────────────────────────────────

const createSingleContainer = (
  media: {
    url: string;
    mediaType: "IMAGE" | "VIDEO";
    thumbnailBucketUrl?: string;
    thumbnailTimestamp?: number;
  },
  profile: IgProfile,
  caption: string,
  providerSettings?: ProviderSetting
): Effect.Effect<IgContainer, ConnectionError> => {
  if (caption.length > CAPTION_LIMIT) {
    return Effect.fail(
      invalidMedia(
        PROVIDER,
        `Caption exceeds Instagram's ${CAPTION_LIMIT} character limit`
      )
    );
  }

  const params = buildSingleContainerParams(
    media,
    profile.accessToken,
    caption,
    providerSettings
  );

  return post<IgContainer>(
    `${base(profile.profileId)}/media?${params.toString()}`
  );
};

export function buildSingleContainerParams(
  media: {
    url: string;
    mediaType: "IMAGE" | "VIDEO";
    thumbnailBucketUrl?: string;
    thumbnailTimestamp?: number;
  },
  accessToken: string,
  caption: string,
  providerSettings?: ProviderSetting
): URLSearchParams {
  const params = new URLSearchParams({ access_token: accessToken, caption });

  if (media.mediaType === "VIDEO") {
    params.append("media_type", "REELS");
    params.append("video_url", media.url);
    params.append("share_to_feed", "true");
    if (media.thumbnailBucketUrl?.startsWith("http")) {
      params.append("cover_url", media.thumbnailBucketUrl);
    } else if (media.thumbnailTimestamp && media.thumbnailTimestamp > 0) {
      params.append(
        "thumb_offset",
        Math.floor(media.thumbnailTimestamp * 1000).toString()
      );
    }
    if (
      providerSettings?.type === "INSTAGRAM" &&
      providerSettings.settings?.trialReels
    ) {
      params.append(
        "trial_params",
        JSON.stringify({
          graduation_strategy:
            providerSettings.settings.graduationStrategy || "MANUAL",
        })
      );
    }
  } else {
    params.append("image_url", media.url);
  }

  return params;
}

const createCarouselContainer = (
  imageUrls: string[],
  profile: IgProfile,
  caption: string
): Effect.Effect<IgContainer, ConnectionError> =>
  Effect.gen(function* () {
    // Create carousel items in parallel, then the parent container.
    const childIds = yield* Effect.all(
      imageUrls.map((url) => {
        const itemParams = new URLSearchParams({
          image_url: url,
          is_carousel_item: "true",
          access_token: profile.accessToken,
        });
        return post<IgContainer>(
          `${base(profile.profileId)}/media?${itemParams.toString()}`
        ).pipe(Effect.map((c) => c.id));
      }),
      { concurrency: "unbounded" }
    );

    const carouselParams = new URLSearchParams({
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
      access_token: profile.accessToken,
    });
    return yield* post<IgContainer>(
      `${base(profile.profileId)}/media?${carouselParams.toString()}`
    );
  });

// ── Processing / publish ─────────────────────────────────────────────────────

const waitForProcessing = (
  containerId: string,
  accessToken: string,
  attempt = 0
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }
    const status = yield* get<IgContainerStatus>(
      `https://graph.instagram.com/${PUBLISH_GRAPH_VERSION}/${containerId}`,
      { fields: "id,status_code,status", access_token: accessToken }
    );
    if (status.status_code === "FINISHED") {
      return;
    }
    if (status.status_code === "ERROR") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, status.status ?? "unknown error")
      );
    }
    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
    return yield* waitForProcessing(containerId, accessToken, attempt + 1);
  });

const publishContainer = (
  containerId: string,
  profile: IgProfile
): Effect.Effect<{ id: string }, ConnectionError> => {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: profile.accessToken,
  });
  return post<{ id: string }>(
    `${base(profile.profileId)}/media_publish?${params.toString()}`
  );
};

const getPermalink = (
  mediaId: string,
  accessToken: string
): Effect.Effect<string, ConnectionError> =>
  get<{ permalink: string }>(
    `https://graph.instagram.com/${PUBLISH_GRAPH_VERSION}/${mediaId}`,
    { fields: "id,permalink", access_token: accessToken }
  ).pipe(Effect.map((r) => r.permalink));

// ── Orchestration ────────────────────────────────────────────────────────────

const publishContent = (
  content: SocialPublishInputType,
  profile: IgProfile
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const firstContent = content.content[0];
    if (!firstContent) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    const valid = getValidMediaUrls(firstContent.media);
    if (valid.length === 0) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "Instagram requires at least one image or video")
      );
    }

    const videos = valid.filter((m) => m.mediaType === "VIDEO" && m.url);
    const images = valid.filter((m) => m.mediaType === "IMAGE" && m.url);

    if (videos.length > 1) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "Instagram supports only one video per post")
      );
    }
    if (videos.length > 0 && images.length > 0) {
      return yield* Effect.fail(
        invalidMedia(
          PROVIDER,
          "Instagram does not support mixing videos and images"
        )
      );
    }

    let container: IgContainer;
    if (videos.length === 1) {
      const v = videos[0];
      container = yield* createSingleContainer(
        {
          url: v.url as string,
          mediaType: "VIDEO",
          thumbnailBucketUrl: v.thumbnailBucketUrl,
          thumbnailTimestamp: v.thumbnailTimestamp,
        },
        profile,
        firstContent.text,
        content.providerSettings
      );
    } else if (images.length === 1) {
      container = yield* createSingleContainer(
        { url: images[0].url as string, mediaType: "IMAGE" },
        profile,
        firstContent.text
      );
    } else {
      container = yield* createCarouselContainer(
        images.map((m) => m.url as string),
        profile,
        firstContent.text
      );
    }

    yield* waitForProcessing(container.id, profile.accessToken);
    const published = yield* publishContainer(container.id, profile);
    const permalink = yield* getPermalink(published.id, profile.accessToken);

    return {
      platformPostId: published.id,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: permalink,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const instagramPublisher: PlatformPublisher = {
  id: "INSTAGRAM",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) => publishContent(ctx.content, profile))
    ),
};
