import {
  getValidMediaUrls,
  type SocialPublishInputType,
} from "@delulu/core/publishing/post";
import axios from "axios";
import { Duration, Effect } from "effect";
import {
  type ConnectionError,
  fromUnknownCreate,
  fromUnknownHttp,
  invalidMedia,
  mediaProcessingError,
  mediaProcessingTimeout,
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
import {
  LINKEDIN_VERSION,
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES,
  MIN_VIDEO_BYTES,
  PROVIDER,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_MAX_ATTEMPTS,
} from "./constants";

interface LinkedInProfile {
  id: string;
  profileId: string;
  accessToken: string;
  username: string;
  targetType: "member" | "organization";
}

interface LinkedInMediaAsset {
  assetUrn: string;
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  title?: string;
  description?: string;
}

type PostContentType =
  | "TEXT_ONLY"
  | "SINGLE_IMAGE"
  | "MULTI_IMAGE"
  | "VIDEO"
  | "DOCUMENT";

type VideoStatus =
  | "AVAILABLE"
  | "PROCESSING"
  | "PROCESSING_FAILED"
  | "WAITING_UPLOAD";

interface BuildLinkedInPostDataOptions {
  visibility?: "PUBLIC" | "CONNECTIONS";
}

// LinkedIn's REST API auth/version headers, shared across every call.
const jsonHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
});

const binaryHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/octet-stream",
});

const streamMedia = async (
  sourceUrl: string,
  uploadUrl: string,
  accessToken: string
) => {
  const source = await fetch(sourceUrl);
  if (!(source.ok && source.body)) {
    throw new Error("Media download failed");
  }
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      ...binaryHeaders(accessToken),
      ...(source.headers.get("content-length")
        ? { "content-length": source.headers.get("content-length")! }
        : {}),
    },
    body: source.body,
    duplex: "half",
  } as RequestInit);
  if (!response.ok) {
    throw new Error(`Media upload returned ${response.status}`);
  }
  await response.body?.cancel();
};

const ownerUrn = (profileId: string, isOrg: boolean) =>
  profileId.startsWith("urn:li:")
    ? profileId
    : isOrg
      ? `urn:li:organization:${profileId}`
      : `urn:li:person:${profileId}`;

// ── Profile ─────────────────────────────────────────────────────────────────

const getProfile = (
  socialProviderId: string
): Effect.Effect<LinkedInProfile, ConnectionError, ConnectionStore> =>
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
      targetType: profile.linkedinTargetType ?? "member",
    };
  });

// ── Image upload ──────────────────────────────────────────────────────────────

const uploadImageToLinkedIn = (
  imageUrl: string,
  profileId: string,
  accessToken: string,
  isOrg = false
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    // Step 2: Register upload with LinkedIn.
    const registerRes = yield* Effect.tryPromise({
      try: () =>
        axios.post(
          "https://api.linkedin.com/rest/images?action=initializeUpload",
          {
            initializeUploadRequest: {
              owner: ownerUrn(profileId, isOrg),
            },
          },
          { headers: jsonHeaders(accessToken) }
        ),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    const uploadUrl = registerRes.data.value.uploadUrl;
    const assetUrn = registerRes.data.value.image;

    // Step 3: Upload the image binary to LinkedIn.
    yield* Effect.tryPromise({
      try: () => streamMedia(imageUrl, uploadUrl, accessToken),
      catch: () => mediaProcessingError(PROVIDER, "Image upload failed"),
    });

    return assetUrn;
  });

// ── Document upload ───────────────────────────────────────────────────────────

const uploadDocumentToLinkedIn = (
  documentUrl: string,
  profileId: string,
  accessToken: string,
  isOrg = false
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const document = yield* Effect.tryPromise({
      try: () => inspectMedia(documentUrl),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    if (document.size > MAX_DOCUMENT_BYTES) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "Document exceeds 100MB")
      );
    }

    const registerRes = yield* Effect.tryPromise({
      try: () =>
        axios.post(
          "https://api.linkedin.com/rest/documents?action=initializeUpload",
          {
            initializeUploadRequest: {
              owner: ownerUrn(profileId, isOrg),
            },
          },
          { headers: jsonHeaders(accessToken) }
        ),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    const uploadUrl = registerRes.data.value.uploadUrl;
    const documentUrn = registerRes.data.value.document;

    yield* Effect.tryPromise({
      try: () => streamMedia(documentUrl, uploadUrl, accessToken),
      catch: () => mediaProcessingError(PROVIDER, "Document upload failed"),
    });

    return documentUrn;
  });

const waitForDocumentProcessing = (
  documentUrn: string,
  accessToken: string,
  attempt = 0
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= VIDEO_POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }
    const response = yield* Effect.tryPromise({
      try: () =>
        axios.get(
          `https://api.linkedin.com/rest/documents/${encodeURIComponent(documentUrn)}`,
          { headers: jsonHeaders(accessToken) }
        ),
      catch: (error) => fromUnknownHttp(PROVIDER, error),
    });
    const status = response.data?.status as VideoStatus | undefined;
    if (status === "AVAILABLE") {
      return;
    }
    if (status === "PROCESSING_FAILED") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Document processing failed")
      );
    }
    if (status === "PROCESSING" || status === "WAITING_UPLOAD") {
      yield* Effect.sleep(Duration.millis(VIDEO_POLL_INTERVAL_MS));
      return yield* waitForDocumentProcessing(
        documentUrn,
        accessToken,
        attempt + 1
      );
    }
    return yield* Effect.fail(
      mediaProcessingError(
        PROVIDER,
        `Unknown document status: ${String(status)}`
      )
    );
  });

// ── Video upload ──────────────────────────────────────────────────────────────

const validateVideoForLinkedIn = (
  fileSizeBytes: number
): Effect.Effect<void, ConnectionError> => {
  if (fileSizeBytes < MIN_VIDEO_BYTES) {
    return Effect.fail(
      invalidMedia(
        PROVIDER,
        `Video file too small: ${fileSizeBytes} bytes (minimum 75KB)`
      )
    );
  }
  if (fileSizeBytes > MAX_VIDEO_BYTES) {
    return Effect.fail(
      invalidMedia(
        PROVIDER,
        `Video file too large: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB (maximum 500MB)`
      )
    );
  }

  // Note: We can't validate video length without decoding, but LinkedIn will
  // reject invalid videos.
  return Effect.void;
};

const uploadVideoToLinkedIn = (
  videoUrl: string,
  profileId: string,
  accessToken: string,
  isOrg = false
): Effect.Effect<string, ConnectionError> =>
  Effect.gen(function* () {
    const source = yield* Effect.tryPromise({
      try: () => inspectMedia(videoUrl),
      catch: (e) => fromUnknownHttp(PROVIDER, e),
    });
    yield* validateVideoForLinkedIn(source.size);
    const owner = ownerUrn(profileId, isOrg);

    // Step 2: Register upload with LinkedIn.
    const registerRes = yield* Effect.tryPromise({
      try: () =>
        axios.post(
          "https://api.linkedin.com/rest/videos?action=initializeUpload",
          {
            initializeUploadRequest: {
              owner,
              fileSizeBytes: source.size,
              uploadCaptions: false,
              uploadThumbnail: false,
            },
          },
          { headers: jsonHeaders(accessToken) }
        ),
      catch: (error) => fromUnknownHttp(PROVIDER, error),
    });

    const uploadInstructions = registerRes.data.value
      .uploadInstructions as Array<{
      uploadUrl?: string;
      firstByte: number;
      lastByte: number;
    }>;
    const assetUrn = registerRes.data.value.video as string;
    const uploadToken = registerRes.data.value.uploadToken;

    if (!uploadInstructions || uploadInstructions.length === 0) {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "No upload instructions returned")
      );
    }

    const uploadedPartIds: string[] = [];
    for (const instruction of uploadInstructions) {
      if (!instruction.uploadUrl) {
        return yield* Effect.fail(
          mediaProcessingError(PROVIDER, "Missing upload URL")
        );
      }
      const chunk = yield* Effect.tryPromise({
        try: () =>
          readMediaRange(videoUrl, instruction.firstByte, instruction.lastByte),
        catch: (e) => fromUnknownHttp(PROVIDER, e),
      });
      const response = yield* Effect.tryPromise({
        try: () =>
          axios.put(instruction.uploadUrl!, chunk, {
            headers: binaryHeaders(accessToken),
          }),
        catch: (e) => fromUnknownHttp(PROVIDER, e),
      });
      if (!response.headers.etag) {
        return yield* Effect.fail(
          mediaProcessingError(PROVIDER, "Missing uploaded part ID")
        );
      }
      uploadedPartIds.push(response.headers.etag);
    }
    // Step 4: Finalize the upload.
    yield* Effect.tryPromise({
      try: () =>
        axios.post(
          "https://api.linkedin.com/rest/videos?action=finalizeUpload",
          {
            finalizeUploadRequest: {
              video: assetUrn,
              uploadToken,
              uploadedPartIds,
            },
          },
          { headers: jsonHeaders(accessToken) }
        ),
      catch: (error: unknown) => fromUnknownHttp(PROVIDER, error),
    });

    return assetUrn;
  });

// ── Video processing status ────────────────────────────────────────────────────

const checkVideoProcessingStatus = (
  videoUrn: string,
  accessToken: string
): Effect.Effect<VideoStatus, ConnectionError> => {
  const encodedUrn = encodeURIComponent(videoUrn);
  return Effect.tryPromise({
    try: () =>
      axios.get(`https://api.linkedin.com/rest/videos/${encodedUrn}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }),
    catch: (error: unknown) => fromUnknownHttp(PROVIDER, error),
  }).pipe(Effect.map((response) => response.data.status as VideoStatus));
};

const waitForVideoProcessing = (
  videoUrn: string,
  accessToken: string,
  attempt = 0
): Effect.Effect<void, ConnectionError> =>
  Effect.gen(function* () {
    if (attempt >= VIDEO_POLL_MAX_ATTEMPTS) {
      return yield* Effect.fail(mediaProcessingTimeout(PROVIDER));
    }

    const status = yield* checkVideoProcessingStatus(videoUrn, accessToken);

    if (status === "AVAILABLE") {
      return;
    }

    if (status === "PROCESSING_FAILED") {
      return yield* Effect.fail(
        mediaProcessingError(PROVIDER, "Video processing failed")
      );
    }

    if (status === "PROCESSING" || status === "WAITING_UPLOAD") {
      yield* Effect.sleep(Duration.millis(VIDEO_POLL_INTERVAL_MS));
      return yield* waitForVideoProcessing(videoUrn, accessToken, attempt + 1);
    }
    return yield* Effect.fail(
      mediaProcessingError(PROVIDER, `Unknown status: ${status}`)
    );
  });

// ── Post creation ─────────────────────────────────────────────────────────────

// LinkedIn's "little text format" requires reserved characters to be escaped.
// See: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
const LITTLE_TEXT_RESERVED = /[|{}@[\]()<>#\\*_~]/g;

function escapeLinkedInText(text: string): string {
  return text.replace(LITTLE_TEXT_RESERVED, (char) => `\\${char}`);
}

function buildLinkedInPostData(
  authorUrn: string,
  text: string,
  media: LinkedInMediaAsset[],
  contentType: PostContentType,
  options?: BuildLinkedInPostDataOptions
) {
  const basePost = {
    author: authorUrn,
    commentary: escapeLinkedInText(text),
    visibility: options?.visibility || "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  switch (contentType) {
    case "TEXT_ONLY":
      return basePost;

    case "SINGLE_IMAGE":
      return {
        ...basePost,
        content: {
          media: {
            altText: media[0]?.description || "Image",
            id: media[0]?.assetUrn,
          },
        },
      };

    case "MULTI_IMAGE":
      return {
        ...basePost,
        content: {
          multiImage: {
            images: media.map((m) => ({
              altText: m.description || "Image",
              id: m.assetUrn,
            })),
          },
        },
      };

    case "VIDEO":
      return {
        ...basePost,
        content: {
          media: {
            title: media[0]?.title || "Video",
            id: media[0]?.assetUrn,
          },
        },
      };

    case "DOCUMENT":
      return {
        ...basePost,
        content: {
          media: {
            title: media[0]?.title || "Document",
            id: media[0]?.assetUrn,
          },
        },
      };

    default:
      return basePost;
  }
}

const createAndPublishPost = (
  text: string,
  mediaAssets: LinkedInMediaAsset[],
  profile: LinkedInProfile,
  isOrg?: boolean
): Effect.Effect<{ id: string }, ConnectionError> =>
  Effect.gen(function* () {
    const authorUrn = ownerUrn(profile.profileId, isOrg ?? false);

    // Determine content type based on media.
    let contentType: PostContentType;
    if (mediaAssets.length === 0) {
      contentType = "TEXT_ONLY";
    } else if (mediaAssets[0].type === "VIDEO") {
      contentType = "VIDEO";
    } else if (mediaAssets[0].type === "DOCUMENT") {
      contentType = "DOCUMENT";
    } else if (mediaAssets.length === 1) {
      contentType = "SINGLE_IMAGE";
    } else {
      contentType = "MULTI_IMAGE";
    }

    const postData = buildLinkedInPostData(
      authorUrn,
      text,
      mediaAssets,
      contentType
    );

    const response = yield* Effect.tryPromise({
      try: () =>
        axios.post("https://api.linkedin.com/rest/posts", postData, {
          headers: jsonHeaders(profile.accessToken),
        }),
      catch: (error: unknown) => fromUnknownCreate(PROVIDER, error),
    });

    // The new API returns the post ID in the x-restli-id header.
    const postId = response.headers["x-restli-id"] || response.data?.id;
    if (typeof postId !== "string" || postId.length === 0) {
      return yield* Effect.fail(
        publishRejected(PROVIDER, "post creation returned no ID")
      );
    }
    return { id: postId };
  });

// ── Orchestration ─────────────────────────────────────────────────────────────

const publishContent = (
  content: SocialPublishInputType,
  profile: LinkedInProfile,
  isOrg?: boolean
): Effect.Effect<PostResult, ConnectionError> =>
  Effect.gen(function* () {
    const firstContent = content.content[0];
    if (!firstContent) {
      return yield* Effect.fail(
        invalidMedia(PROVIDER, "No content to publish")
      );
    }

    const validMedia = getValidMediaUrls(firstContent.media);
    const imageMedia = validMedia.filter(
      (media) => media.mediaType === "IMAGE" && media.url
    );
    const videoMedia = validMedia.filter(
      (media) => media.mediaType === "VIDEO" && media.url
    );
    const documentMedia = validMedia.filter(
      (media) => media.mediaType === "DOCUMENT" && media.url
    );

    let mediaAssets: LinkedInMediaAsset[];

    if (videoMedia.length > 0) {
      // Only support one video per post for now.
      const video = videoMedia[0];
      const assetUrn = yield* uploadVideoToLinkedIn(
        video.url as string,
        profile.profileId,
        profile.accessToken,
        isOrg
      );
      // Wait for video processing to complete before proceeding.
      yield* waitForVideoProcessing(assetUrn, profile.accessToken);
      mediaAssets = [
        {
          assetUrn,
          type: "VIDEO",
          title: video.altText || "Video",
          description: "Video description",
        },
      ];
    } else if (documentMedia.length > 0) {
      // Only support one document per post.
      const doc = documentMedia[0];
      const assetUrn = yield* uploadDocumentToLinkedIn(
        doc.url as string,
        profile.profileId,
        profile.accessToken,
        isOrg
      );
      yield* waitForDocumentProcessing(assetUrn, profile.accessToken);
      mediaAssets = [
        {
          assetUrn,
          type: "DOCUMENT",
          title: doc.altText || "Document",
          description: "Document",
        },
      ];
    } else if (imageMedia.length > 0) {
      // Support multiple images.
      const assetUrns = yield* Effect.all(
        imageMedia.map((img) =>
          uploadImageToLinkedIn(
            img.url as string,
            profile.profileId,
            profile.accessToken,
            isOrg
          )
        )
      );
      mediaAssets = assetUrns.map((assetUrn) => ({
        assetUrn,
        type: "IMAGE",
        title: "Image",
        description: "Image description",
      }));
    } else {
      mediaAssets = [];
    }

    const postResponse = yield* createAndPublishPost(
      firstContent.text,
      mediaAssets,
      profile,
      isOrg
    );

    return {
      platformPostId: postResponse.id,
      postId: content.postId,
      platformId: profile.id,
      platformPostUrl: `https://www.linkedin.com/feed/update/${postResponse.id}`,
      postedAt: new Date(),
    } satisfies PostResult;
  });

export const linkedinPublisher: PlatformPublisher = {
  id: "LINKEDIN",
  publish: (ctx: PublishContext) =>
    getProfile(ctx.socialProviderId).pipe(
      Effect.flatMap((profile) =>
        ensureFreshToken(ctx.socialProviderId).pipe(
          Effect.flatMap((accessToken) =>
            publishContent(
              ctx.content,
              { ...profile, accessToken },
              profile.targetType === "organization"
            )
          )
        )
      )
    ),
};
