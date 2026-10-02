import {
  type ContentType,
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
import { BLUESKY_HOST, PROVIDER } from "./constants";

// ── Types ─────────────────────────────────────────────────────────────────

interface BlueskyProfile {
  id: string;
  profileId: string;
  accessToken: string;
  refreshToken: string;
  username: string;
}

interface BlueskyAuthResponse {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface BlueskyBlobResponse {
  blob: {
    $type: string;
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
}

interface BlueskyPostResponse {
  uri: string;
  cid: string;
}

// AT Protocol facet types
interface FacetIndex {
  byteStart: number;
  byteEnd: number;
}
interface LinkFeature {
  $type: "app.bsky.richtext.facet#link";
  uri: string;
}
interface MentionFeature {
  $type: "app.bsky.richtext.facet#mention";
  did: string;
}
interface RichTextFacet {
  index: FacetIndex;
  features: (LinkFeature | MentionFeature)[];
}
interface RichTextResult {
  text: string;
  facets?: RichTextFacet[];
}

interface BlueskyImageEmbed {
  $type: "app.bsky.embed.images";
  images: Array<{
    alt: string;
    image: {
      $type: string;
      ref: { $link: string };
      mimeType: string;
      size: number;
    };
  }>;
}
interface BlueskyReply {
  root: { uri: string; cid: string };
  parent: { uri: string; cid: string };
}
interface BlueskyPostRecord {
  $type: "app.bsky.feed.post";
  text: string;
  createdAt: string;
  facets?: RichTextFacet[];
  reply?: BlueskyReply;
  embed?: BlueskyImageEmbed;
}

// ── Profile ─────────────────────────────────────────────────────────────────

const getProfile = (
  socialProviderId: string
): Effect.Effect<BlueskyProfile, ConnectionError, ConnectionStore> =>
  Effect.gen(function* () {
    const store = yield* ConnectionStore;
    const profile =
      yield* store.getSocialProviderWithDecryptedTokens(socialProviderId);
    if (!(profile?.accessToken && profile.profileId && profile.refreshToken)) {
      return yield* Effect.fail(profileNotFound(PROVIDER));
    }
    return {
      id: profile._id,
      profileId: profile.profileId,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      username: profile.username ?? "",
    };
  });

// ── Auth ──────────────────────────────────────────────────────────────────

// In the OAuth flow we already hold a valid access token, so this just formats
// the stored profile as an auth response (DID is stored as profileId).
const authenticateWithBluesky = (
  profile: BlueskyProfile
): BlueskyAuthResponse => ({
  accessJwt: profile.accessToken,
  refreshJwt: profile.refreshToken,
  handle: profile.username,
  did: profile.profileId,
});

// ── Blob upload ───────────────────────────────────────────────────────────

const uploadMediaBlob = (
  mediaUrl: string,
  accessToken: string
): Effect.Effect<BlueskyBlobResponse, ConnectionError> =>
  Effect.gen(function* () {
    const arrayBuffer = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch media: ${response.status}`);
        }
        return response.arrayBuffer();
      },
      catch: () =>
        invalidMedia(PROVIDER, "Failed to download media for upload"),
    });

    return yield* Effect.tryPromise({
      try: () =>
        axios
          .post(
            `${BLUESKY_HOST}/xrpc/com.atproto.repo.uploadBlob`,
            arrayBuffer,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/octet-stream",
              },
            }
          )
          .then((r) => r.data as BlueskyBlobResponse),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
  });

// ── Rich text / facets ────────────────────────────────────────────────────

// Create rich text with facets for mentions and links per AT Protocol specs.
const createRichText = (text: string): RichTextResult => {
  const facets: RichTextFacet[] = [];

  // Find URLs.
  const urlRegex =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&=]*)/g;
  let urlMatch: RegExpExecArray | null = urlRegex.exec(text);
  while (urlMatch !== null) {
    const start = new TextEncoder().encode(
      text.slice(0, urlMatch.index)
    ).length;
    const end = start + new TextEncoder().encode(urlMatch[0]).length;
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: urlMatch[0] }],
    });
    urlMatch = urlRegex.exec(text);
  }

  // Find mentions — @handle.domain or @handle.
  const mentionRegex =
    /@([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/g;
  let mentionMatch: RegExpExecArray | null = mentionRegex.exec(text);
  while (mentionMatch !== null) {
    const start = new TextEncoder().encode(
      text.slice(0, mentionMatch.index)
    ).length;
    const end = start + new TextEncoder().encode(mentionMatch[0]).length;
    // Mentions would ideally resolve the handle to a DID; for now include the
    // handle without resolution (basic text formatting).
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [
        {
          $type: "app.bsky.richtext.facet#mention",
          did: `at://${mentionMatch[0].slice(1)}`,
        },
      ],
    });
    mentionMatch = mentionRegex.exec(text);
  }

  return { text, facets: facets.length > 0 ? facets : undefined };
};

// ── Record creation ───────────────────────────────────────────────────────

const createPost = (
  content: ContentType,
  authResponse: BlueskyAuthResponse,
  replyTo?: { uri: string; cid: string }
): Effect.Effect<BlueskyPostResponse, ConnectionError> =>
  Effect.gen(function* () {
    const validMedia = getValidMediaUrls(content.media);
    const richText = createRichText(content.text);

    // Upload media blobs first (filter out media without URLs).
    const mediaWithUrls = validMedia.filter((media) => media.url);
    const mediaBlobs = yield* Effect.all(
      mediaWithUrls.map((media) =>
        uploadMediaBlob(media.url as string, authResponse.accessJwt)
      ),
      { concurrency: "unbounded" }
    );

    const record: BlueskyPostRecord = {
      $type: "app.bsky.feed.post",
      text: richText.text,
      createdAt: new Date().toISOString(),
    };

    if (richText.facets) {
      record.facets = richText.facets;
    }

    if (replyTo) {
      record.reply = { root: replyTo, parent: replyTo };
    }

    if (mediaBlobs.length > 0) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: mediaBlobs.map((blob) => ({
          alt: content.text.slice(0, 100),
          image: blob.blob,
        })),
      };
    }

    return yield* Effect.tryPromise({
      try: () =>
        axios
          .post(
            `${BLUESKY_HOST}/xrpc/com.atproto.repo.createRecord`,
            {
              repo: authResponse.did,
              collection: "app.bsky.feed.post",
              record,
            },
            {
              headers: {
                Authorization: `Bearer ${authResponse.accessJwt}`,
                "Content-Type": "application/json",
              },
            }
          )
          .then((r) => r.data as BlueskyPostResponse),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
  });

// ── Orchestration ────────────────────────────────────────────────────────

// Publish each content item sequentially as a reply, forming a thread.
const processSequentially = (
  remainingPosts: ContentType[],
  authResponse: BlueskyAuthResponse,
  lastPost?: { uri: string; cid: string }
): Effect.Effect<BlueskyPostResponse, ConnectionError> =>
  Effect.gen(function* () {
    const [currentPost, ...nextPosts] = remainingPosts;
    const postResponse = yield* createPost(currentPost, authResponse, lastPost);
    if (nextPosts.length > 0) {
      return yield* processSequentially(nextPosts, authResponse, postResponse);
    }
    return postResponse;
  });

const publishContent = (
  content: SocialPublishInputType,
  profile: BlueskyProfile
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const posts = [...content.content].sort((a, b) => a.order - b.order);
    if (posts.length === 0) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    const authResponse = authenticateWithBluesky(profile);
    const postResponse = yield* processSequentially(posts, authResponse);

    // Extract the record key from the AT-URI for the post URL.
    const uriParts = postResponse.uri.split("/");
    const recordKey = uriParts.at(-1) || "";

    return {
      platformPostId: postResponse.uri,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: `https://bsky.app/profile/${authResponse.handle}/post/${recordKey}`,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const blueskyPublisher: PlatformPublisher = {
  id: "BLUESKY",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) => publishContent(ctx.content, profile))
    ),
};
