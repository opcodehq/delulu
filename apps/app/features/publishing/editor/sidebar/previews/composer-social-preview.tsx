"use client";

import { SocialPostPreview } from "@delulu/design-system/components/social-preview/social-post-preview";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import Image from "next/image";
import { PhoneFrame } from "@/features/publishing/editor/sidebar/previews/phone-frame";
import { usePreviewData } from "@/features/publishing/editor/sidebar/previews/preview-utils";

type PreviewPostData = Parameters<typeof usePreviewData>[1];

export interface PhonePreviewPost {
  readonly text: string;
  readonly media?: {
    readonly url: string;
    readonly mediaType: "image" | "video" | "document";
  };
}

/**
 * A post rendered inside a phone frame. Each entry in `posts` is one card, so
 * threads render as consecutive posts.
 */
export function SocialPhonePreview({
  platform,
  posts,
  account,
}: {
  platform: SupportedSocialPlatform;
  posts: readonly PhonePreviewPost[];
  account: {
    readonly displayName?: string;
    readonly username?: string;
    readonly profileImage?: string;
  };
}) {
  return (
    <PhoneFrame darkMode={platform === "TIKTOK" ? true : undefined}>
      <div className="h-full space-y-2 overflow-y-auto bg-neutral-100 px-2 pt-10 pb-2 dark:bg-neutral-950">
        {posts.map((post, index) => (
          <SocialPostPreview
            avatarUrl={account.profileImage}
            className="rounded-xl shadow-none"
            comments={42}
            dateLabel="2h"
            displayName={account.displayName}
            headline={account.username || "Professional headline"}
            key={index}
            likes={4821}
            media={
              post.media &&
              post.media.mediaType !== "document" && (
                <PreviewMedia media={post.media} platform={platform} />
              )
            }
            platform={platform}
            shares={156}
            text={post.text || "Your post will appear here."}
            username={account.username}
          />
        ))}
      </div>
    </PhoneFrame>
  );
}

function PreviewMedia({
  platform,
  media,
}: {
  platform: SupportedSocialPlatform;
  media: NonNullable<PhonePreviewPost["media"]>;
}) {
  return (
    <div
      className={
        platform === "TIKTOK"
          ? "relative size-full"
          : platform === "YOUTUBE"
            ? "relative aspect-video w-full"
            : "relative aspect-square w-full"
      }
    >
      {media.mediaType === "video" ? (
        <video
          autoPlay
          className="size-full object-cover"
          loop
          muted
          playsInline
          src={media.url}
        />
      ) : (
        <Image
          alt="Post media preview"
          className="object-cover"
          fill
          src={media.url}
        />
      )}
    </div>
  );
}

/** Preview of the composer draft (or a review payload) for one platform. */
export function ComposerSocialPreview({
  platform,
  postData,
}: {
  platform: SupportedSocialPlatform;
  postData?: PreviewPostData;
}) {
  const { content, mediaUrl, hasVideo, hasImage, provider } = usePreviewData(
    platform,
    postData
  );

  if (!content) {
    return null;
  }

  return (
    <SocialPhonePreview
      account={{
        displayName: provider?.fullName,
        username: provider?.username ?? undefined,
        profileImage: provider?.profileImage ?? undefined,
      }}
      platform={platform}
      posts={[
        {
          text: content.text,
          media:
            (hasVideo || hasImage) && mediaUrl
              ? { url: mediaUrl, mediaType: hasVideo ? "video" : "image" }
              : undefined,
        },
      ]}
    />
  );
}
