import {
  getValidMediaUrls,
  type MediaType,
  type SocialPublishInputType,
} from "@delulu/core/publishing/post";
import axios from "axios";
import { Effect } from "effect";
import {
  type ConnectionError,
  fromUnknownHttp,
  invalidMedia,
  profileNotFound,
  publishRejected,
} from "../../errors";
import { ConnectionStore } from "../../services/connection-store";
import type {
  PlatformPublisher,
  PostResult,
  PublishContext,
} from "../../types";
import { API_BASE, PROVIDER, TITLE_LIMIT } from "./constants";

interface PinterestProfile {
  id: string;
  accessToken: string;
}

const getProfile = (
  socialProviderId: string
): Effect.Effect<PinterestProfile, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const store = yield* ConnectionStore;
    const profile =
      yield* store.getSocialProviderWithDecryptedTokens(socialProviderId);
    if (!profile?.accessToken) {
      return yield* Effect.fail(profileNotFound(PROVIDER));
    }
    return { id: profile._id, accessToken: profile.accessToken };
  });

const getUserBoards = (
  accessToken: string
): Effect.Effect<{ id: string }[], ConnectionError> =>
  Effect.tryPromise({
    try: () =>
      axios
        .get(`${API_BASE}/boards`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .then((r) => (r.data.items ?? []) as { id: string }[]),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

const createPin = (
  media: MediaType,
  text: string,
  boardId: string,
  accessToken: string
): Effect.Effect<{ id: string; link: string }, ConnectionError> => {
  if (!media.url) {
    return Effect.fail(invalidMedia(PROVIDER, "Media URL is required"));
  }
  const pinData = {
    link: media.url,
    title: text.slice(0, TITLE_LIMIT) || "Pin",
    description: text || "",
    board_id: boardId,
    media_source: { source_type: "image_url", url: media.url },
  };
  return Effect.tryPromise({
    try: () =>
      axios
        .post(`${API_BASE}/pins`, pinData, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        })
        .then((r) => r.data as { id: string; link: string }),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });
};

const publishContent = (
  content: SocialPublishInputType,
  profile: PinterestProfile
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const firstContent = content.content[0];
    if (!firstContent) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }
    const image = getValidMediaUrls(firstContent.media).find(
      (m) => m.mediaType === "IMAGE" && m.url
    );
    if (!image) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "Pinterest requires an image")
      );
    }

    const boards = yield* getUserBoards(profile.accessToken);
    if (boards.length === 0) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "No boards available")
      );
    }
    const pin = yield* createPin(
      image as MediaType,
      firstContent.text,
      boards[0].id,
      profile.accessToken
    );
    return {
      platformPostId: pin.id,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: pin.link,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const pinterestPublisher: PlatformPublisher = {
  id: "PINTEREST",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) => publishContent(ctx.content, profile))
    ),
};
