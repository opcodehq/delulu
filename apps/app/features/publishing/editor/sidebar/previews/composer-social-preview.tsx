"use client";

import { SocialPostPreview } from "@delulu/design-system/components/social-preview/social-post-preview";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import Image from "next/image";
import { PhoneFrame } from "./phone-frame";
import { usePreviewData } from "./preview-utils";

type PreviewPostData = Parameters<typeof usePreviewData>[1];

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

  const media =
    (hasVideo || hasImage) && mediaUrl ? (
      <div
        className={
          platform === "TIKTOK"
            ? "relative size-full"
            : platform === "YOUTUBE"
              ? "relative aspect-video w-full"
              : "relative aspect-square w-full"
        }
      >
        {hasVideo ? (
          <video
            autoPlay
            className="size-full object-cover"
            loop
            muted
            playsInline
            src={mediaUrl}
          />
        ) : (
          <Image
            alt="Post media preview"
            className="object-cover"
            fill
            src={mediaUrl}
          />
        )}
      </div>
    ) : undefined;

  return (
    <PhoneFrame darkMode={platform === "TIKTOK" ? true : undefined}>
      <div className="h-full overflow-y-auto bg-neutral-100 p-2 dark:bg-neutral-950">
        <SocialPostPreview
          avatarUrl={provider?.profileImage ?? undefined}
          className="rounded-xl shadow-none"
          comments={42}
          dateLabel="2h"
          displayName={provider?.fullName}
          headline={provider?.username || "Professional headline"}
          likes={4821}
          media={media}
          platform={platform}
          shares={156}
          text={content.text || "Your post will appear here."}
          username={provider?.username ?? undefined}
        />
      </div>
    </PhoneFrame>
  );
}
