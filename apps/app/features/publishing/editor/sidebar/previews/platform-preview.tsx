"use client";

import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import { FacebookPreview } from "./facebook-preview";
import { InstagramPreview } from "./instagram-preview";
import { LinkedInPreview } from "./linkedin-preview";
import { usePreviewData } from "./preview-utils";
import { ThreadsPreview } from "./threads-preview";
import { TikTokPreview } from "./tiktok-preview";
import { TwitterPreview } from "./twitter-preview";
import { YouTubePreview } from "./youtube-preview";

function GenericPreview({ socialType }: { socialType: string }) {
  const { content, mediaUrl, hasImage, hasVideo, media } = usePreviewData(
    socialType as SupportedSocialPlatform
  );

  if (!content) {
    return null;
  }

  return (
    <div className="flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-4">
        <p className="mb-2 font-semibold text-sm capitalize">
          {socialType.toLowerCase()} Preview
        </p>
        <p className="text-sm">{content.text || "No content yet..."}</p>
        {(hasVideo || hasImage) && media?.url && mediaUrl && (
          <div className="mt-3 overflow-hidden rounded-lg">
            {hasVideo ? (
              <video
                autoPlay
                className="w-full"
                loop
                muted
                playsInline
                src={mediaUrl}
              />
            ) : (
              <img
                alt="Preview"
                className="w-full object-cover"
                src={mediaUrl}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlatformPreview({
  socialType,
}: {
  socialType: SupportedSocialPlatform;
}) {
  switch (socialType) {
    case "TIKTOK":
      return <TikTokPreview />;
    case "INSTAGRAM":
      return <InstagramPreview />;
    case "TWITTER":
      return <TwitterPreview />;
    case "LINKEDIN":
      return <LinkedInPreview />;
    case "FACEBOOK":
      return <FacebookPreview />;
    case "YOUTUBE":
      return <YouTubePreview />;
    case "THREADS":
      return <ThreadsPreview />;
    default:
      return <GenericPreview socialType={socialType} />;
  }
}
