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
import { GRAPH_VERSION, PROVIDER } from "./constants";

const POLL_MAX_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 3000;
const urlRegex =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

interface ThreadsProfile {
  id: string;
  profileId: string;
  accessToken: string;
}
interface Container {
  id: string;
}

const base = (profileId: string) =>
  `https://graph.threads.net/${GRAPH_VERSION}/${profileId}`;

const post = <T>(url: string): Effect.Effect<T, ConnectionError> =>
  Effect.tryPromise({
    try: () => axios.post(url).then((r) => r.data as T),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

const getProfile = (
  socialProviderId: string
): Effect.Effect<ThreadsProfile, ConnectionError, ConnectionStore> =>
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

const createMediaContainer = (
  media: MediaType | null,
  profile: ThreadsProfile,
  text: string,
  options: { isCarouselItem?: boolean; replyToId?: string } = {}
): Effect.Effect<Container, ConnectionError> => {
  const params = new URLSearchParams({
    access_token: profile.accessToken,
    text,
  });

  if (media?.url) {
    const mediaType = media.mediaType === "VIDEO" ? "VIDEO" : "IMAGE";
    params.append("media_type", mediaType);
    params.append(mediaType === "VIDEO" ? "video_url" : "image_url", media.url);
    if (options.isCarouselItem) {
      params.append("is_carousel_item", "true");
    }
  } else {
    params.append("media_type", "TEXT");
    const urlMatch = text.match(urlRegex);
    if (urlMatch) {
      params.append("link_attachment", urlMatch[0]);
    }
  }
  if (options.replyToId) {
    params.append("reply_to_id", options.replyToId);
  }

  return post<Container>(
    `${base(profile.profileId)}/threads?${params.toString()}`
  );
};

const createCarouselContainer = (
  childrenIds: string[],
  profile: ThreadsProfile,
  text: string
): Effect.Effect<Container, ConnectionError> => {
  const params = new URLSearchParams({
    access_token: profile.accessToken,
    media_type: "CAROUSEL",
    children: childrenIds.join(","),
    text,
  });
  return post<Container>(
    `${base(profile.profileId)}/threads?${params.toString()}`
  );
};

const waitForProcessing = (
  containerId: string,
  accessToken: string,
  attempt = 0
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }
    // A 500 here means "still processing" — retry rather than fail.
    const statusData = yield* Effect.tryPromise({
      try: () =>
        axios
          .get(`https://graph.threads.net/${GRAPH_VERSION}/${containerId}`, {
            params: { access_token: accessToken },
          })
          .then((r) => r.data as { status?: string; error_message?: string }),
      catch: (e) => {
        if (axios.isAxiosError(e) && e.response?.status === 500) {
          return mediaProcessingError(PROVIDER, "still processing");
        }
        return fromUnknownHttp(PROVIDER, e);
      },
    }).pipe(Effect.option);

    if (statusData._tag === "None") {
      yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
      return yield* waitForProcessing(containerId, accessToken, attempt + 1);
    }

    const status = statusData.value.status;
    if (status === "FINISHED") {
      return;
    }
    if (status === "ERROR" || status === "EXPIRED") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, statusData.value.error_message ?? status)
      );
    }
    yield* Effect.sleep(Duration.millis(POLL_INTERVAL_MS));
    return yield* waitForProcessing(containerId, accessToken, attempt + 1);
  });

const publishContainer = (
  creationId: string,
  profile: ThreadsProfile
): Effect.Effect<{ id: string }, ConnectionError> => {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: profile.accessToken,
  });
  return post<{ id: string }>(
    `${base(profile.profileId)}/threads_publish?${params.toString()}`
  );
};

const getPostDetails = (
  mediaId: string,
  accessToken: string
): Effect.Effect<{ permalink: string }, ConnectionError> =>
  Effect.tryPromise({
    try: () =>
      axios
        .get(`https://graph.threads.net/${GRAPH_VERSION}/${mediaId}`, {
          params: {
            fields: "id,permalink,link_attachment_url",
            access_token: accessToken,
          },
        })
        .then((r) => r.data as { permalink: string }),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

const processPost = (
  post_: { text: string; media: MediaType[] },
  profile: ThreadsProfile,
  replyToId?: string
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const validMedia = getValidMediaUrls(post_.media) as MediaType[];

    if (validMedia.length > 1) {
      const items = yield* Effect.all(
        validMedia.map((m) =>
          createMediaContainer(m, profile, post_.text, { isCarouselItem: true })
        ),
        { concurrency: "unbounded" }
      );
      const carousel = yield* createCarouselContainer(
        items.map((c) => c.id),
        profile,
        post_.text
      );
      yield* waitForProcessing(carousel.id, profile.accessToken);
      const published = yield* publishContainer(carousel.id, profile);
      return published.id;
    }

    const container = yield* createMediaContainer(
      validMedia[0] ?? null,
      profile,
      post_.text,
      { replyToId }
    );
    yield* waitForProcessing(container.id, profile.accessToken);
    const published = yield* publishContainer(container.id, profile);
    return published.id;
  });

const publishContent = (
  content: SocialPublishInputType,
  profile: ThreadsProfile
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const posts = [...content.content].sort((a, b) => a.order - b.order);
    if (posts.length === 0) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    // Post sequentially so each item replies to the previous (thread order).
    let firstPostId: string | undefined;
    let lastPostId: string | undefined;
    for (const p of posts) {
      const id = yield* processPost(p, profile, lastPostId);
      firstPostId ??= id;
      lastPostId = id;
    }

    const details = yield* getPostDetails(
      firstPostId as string,
      profile.accessToken
    );
    return {
      platformPostId: firstPostId as string,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: details.permalink,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const threadsPublisher: PlatformPublisher = {
  id: "THREADS",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) => publishContent(ctx.content, profile))
    ),
};
