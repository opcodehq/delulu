import { getValidMediaUrls } from "@delulu/core/publishing/post";
import { Effect } from "effect";
import {
  apiError,
  fromUnknownHttp,
  invalidMedia,
  PublishContinuation,
  profileNotFound,
} from "../../errors";
import { inspectMedia, readMediaRange } from "../../remote-media";
import { ConnectionStore } from "../../services/connection-store";
import type { PlatformPublisher, PublishContext } from "../../types";
import { MAX_FILE_SIZE, PROVIDER } from "./constants";

const timedFetch = (url: string, init: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });

const check = async (response: Response) => {
  if (!response.ok) {
    throw apiError(PROVIDER, response.status, await response.text());
  }
  return response;
};

/** Resumable, bounded uploads; the provider session is durable before any bytes. */
const upload = async (ctx: PublishContext, refreshToken: string) => {
  const started = Date.now();
  const content = ctx.content.content[0];
  const video = getValidMediaUrls(content?.media ?? []).find(
    (item) => item.mediaType === "VIDEO" && item.url
  );
  if (!(content && video?.url)) {
    throw invalidMedia(PROVIDER, "YouTube requires a video");
  }
  if (!ctx.persistProviderState) {
    throw new Error("YouTube requires durable upload progress");
  }
  const tokenResponse = await check(
    await timedFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })
  );
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new Error("YouTube access token missing");
  }
  const authorization = `Bearer ${token.access_token}`;
  const settings =
    ctx.content.providerSettings?.type === "YOUTUBE"
      ? ctx.content.providerSettings.settings
      : undefined;
  const state = { ...ctx.providerState };
  let id =
    typeof state.youtubeVideoId === "string" ? state.youtubeVideoId : undefined;
  if (!id) {
    const source = await inspectMedia(video.url);
    if (source.size > MAX_FILE_SIZE) {
      throw invalidMedia(PROVIDER, "Video exceeds YouTube file limit");
    }
    let session =
      typeof state.youtubeUploadUrl === "string"
        ? state.youtubeUploadUrl
        : undefined;
    if (!session) {
      const response = await check(
        await timedFetch(
          "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
          {
            method: "POST",
            headers: {
              authorization,
              "content-type": "application/json",
              "x-upload-content-length": String(source.size),
              "x-upload-content-type": source.mimeType,
            },
            body: JSON.stringify({
              snippet: {
                title:
                  content.title ||
                  content.text?.slice(0, 80) ||
                  "YouTube Short",
                description:
                  (content.text ?? "") +
                  ((content.text ?? "").includes("#Shorts")
                    ? ""
                    : "\n\n#Shorts"),
                tags: content.tags ?? [],
                categoryId: "24",
                defaultLanguage: "en",
              },
              status: {
                privacyStatus: settings?.privacy?.toLowerCase() ?? "public",
                selfDeclaredMadeForKids: settings?.madeForKids ?? false,
              },
            }),
          }
        )
      );
      session = response.headers.get("location") ?? undefined;
      await response.body?.cancel();
      if (!session) {
        throw new Error("YouTube upload session missing");
      }
      state.youtubeUploadUrl = session;
      await ctx.persistProviderState(state);
    }
    const sessionUrl = new URL(session);
    if (
      sessionUrl.protocol !== "https:" ||
      sessionUrl.hostname !== "www.googleapis.com"
    ) {
      throw new Error("Invalid YouTube upload session");
    }
    // Probe the provider after every restart, including a lost final response.
    const probe = () =>
      timedFetch(session!, {
        method: "PUT",
        redirect: "manual",
        headers: { authorization, "content-range": `bytes */${source.size}` },
        body: new Uint8Array(),
      });
    let response = await probe();
    let offset = 0;
    if (response.status === 308) {
      const range = response.headers.get("range");
      offset = range ? Number(range.split("-")[1]) + 1 : 0;
      await response.body?.cancel();
      while (offset < source.size) {
        if (Date.now() - started > 10 * 60_000) {
          throw new PublishContinuation({
            code: "PUBLISH_CONTINUATION",
            provider: PROVIDER,
            retryable: true,
            message: "Resume video upload",
            resumeAt: Date.now() + 1000,
          });
        }
        const end = Math.min(offset + 8 * 1024 * 1024, source.size) - 1;
        const bytes = await readMediaRange(video.url, offset, end);
        response = await timedFetch(session, {
          method: "PUT",
          redirect: "manual",
          headers: {
            authorization,
            "content-type": source.mimeType,
            "content-range": `bytes ${offset}-${end}/${source.size}`,
          },
          body: bytes,
        });
        if (response.status !== 308) {
          break;
        }
        const accepted = response.headers.get("range");
        const next = accepted ? Number(accepted.split("-")[1]) + 1 : 0;
        await response.body?.cancel();
        if (
          !Number.isSafeInteger(next) ||
          next <= offset ||
          next > source.size
        ) {
          throw new Error("YouTube upload made no valid progress");
        }
        offset = next;
      }
    }
    if (response.status === 308) {
      // All bytes were acknowledged, but the resource may still be finalizing.
      response = await probe();
      if (response.status === 308) {
        await response.body?.cancel();
        throw new PublishContinuation({
          code: "PUBLISH_CONTINUATION",
          provider: PROVIDER,
          retryable: true,
          message: "Await video upload finalization",
          resumeAt: Date.now() + 30_000,
        });
      }
    }
    if (response.status === 404 || response.status === 410) {
      const { youtubeUploadUrl: _expired, ...remainingState } = state;
      await ctx.persistProviderState(remainingState);
    }
    await check(response);
    id = ((await response.json()) as { id?: string }).id;
    if (!id) {
      throw new Error("YouTube video ID missing");
    }
    state.youtubeVideoId = id;
    await ctx.persistProviderState(state);
  }
  if (video.thumbnailBucketUrl && !state.youtubeThumbnailComplete) {
    try {
      const thumbnail = await inspectMedia(video.thumbnailBucketUrl);
      const bytes = await readMediaRange(
        video.thumbnailBucketUrl,
        0,
        thumbnail.size - 1,
        2 * 1024 * 1024
      );
      const response = await check(
        await timedFetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(id)}`,
          {
            method: "POST",
            headers: { authorization, "content-type": thumbnail.mimeType },
            body: bytes,
          }
        )
      );
      await response.body?.cancel();
    } catch (error) {
      // The video is already published. Preserve thumbnail failure separately
      // so a rejected optional thumbnail cannot hide the confirmed video.
      state.youtubeThumbnailError = fromUnknownHttp(PROVIDER, error).message;
    }
    state.youtubeThumbnailComplete = true;
    await ctx.persistProviderState(state);
  }
  return {
    platformPostId: id,
    platformPostUrl: `https://www.youtube.com/shorts/${id}`,
    platformId: ctx.socialProviderId,
    postId: ctx.content.postId,
    postedAt: new Date(),
  };
};

export const youtubePublisher: PlatformPublisher = {
  id: "YOUTUBE",
  publish: (ctx) =>
    Effect.gen(function* () {
      const store = yield* ConnectionStore;
      const profile = yield* store.getSocialProviderWithDecryptedTokens(
        ctx.socialProviderId
      );
      if (!profile?.refreshToken) {
        return yield* Effect.fail(profileNotFound(PROVIDER));
      }
      return yield* Effect.tryPromise({
        try: () => upload(ctx, profile.refreshToken!),
        catch: (e) => fromUnknownHttp(PROVIDER, e),
      });
    }),
};
