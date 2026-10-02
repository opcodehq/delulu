import {
  getValidMediaUrls,
  type SocialPublishInputType,
} from "@delulu/core/publishing/post";
import axios from "axios";
import { Effect } from "effect";
import {
  type ConnectionError,
  fromUnknownHttp,
  invalidMedia,
  profileNotFound,
} from "../../errors";
import { ConnectionStore } from "../../services/connection-store";
import type {
  PlatformPublisher,
  PostResult,
  PublishContext,
} from "../../types";
import { API_BASE, PROVIDER } from "./constants";

interface FarcasterProfile {
  id: string;
  /** Farcaster ID — stored as the profile's `profileId`. */
  fid: string;
  /** Signer UUID — stored as the profile's `accessToken`. */
  signerUuid: string;
}

interface FarcasterCastRequest {
  text: string;
  embeds?: Array<{ url: string }>;
  channelId?: string;
  parent?: string;
}

interface FarcasterCastResponse {
  hash: string;
  timestamp: number;
  fid: number;
  text: string;
}

const getProfile = (
  socialProviderId: string
): Effect.Effect<FarcasterProfile, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const store = yield* ConnectionStore;
    const profile =
      yield* store.getSocialProviderWithDecryptedTokens(socialProviderId);
    if (!(profile?.accessToken && profile.profileId)) {
      return yield* Effect.fail(profileNotFound(PROVIDER));
    }
    return {
      id: profile._id,
      fid: profile.profileId, // Farcaster uses FID as profileId
      signerUuid: profile.accessToken, // Signer UUID stored as accessToken
    };
  });

const submitCast = (
  profile: FarcasterProfile,
  castData: FarcasterCastRequest
): Effect.Effect<FarcasterCastResponse, ConnectionError> =>
  Effect.tryPromise({
    try: () =>
      axios
        .post(`${API_BASE}/casts`, castData, {
          headers: {
            Authorization: `Bearer ${profile.signerUuid}`,
            "Content-Type": "application/json",
          },
        })
        .then((r) => r.data.result.cast as FarcasterCastResponse),
    catch: (e) => fromUnknownHttp(PROVIDER, e),
  });

const publishContent = (
  content: SocialPublishInputType,
  profile: FarcasterProfile
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const firstContent = content.content[0];
    if (!firstContent) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    // Farcaster doesn't upload media directly, but can embed URLs.
    const validMedia = getValidMediaUrls(firstContent.media);
    const embeds = validMedia
      .filter((media): media is typeof media & { url: string } => !!media.url)
      .map((media) => ({ url: media.url }));

    // channelId comes from the FARCASTER provider settings (discriminated union).
    const settings = content.providerSettings;
    const channelId =
      settings?.type === "FARCASTER" ? settings.settings.channelId : undefined;

    const castData: FarcasterCastRequest = {
      text: firstContent.text,
      ...(embeds.length > 0 && { embeds }),
      ...(channelId && { channelId }),
    };

    const cast = yield* submitCast(profile, castData);

    return {
      platformPostId: cast.hash,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: `https://warpcast.com/${profile.fid}/${cast.hash}`,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const farcasterPublisher: PlatformPublisher = {
  id: "FARCASTER",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) => publishContent(ctx.content, profile))
    ),
};
