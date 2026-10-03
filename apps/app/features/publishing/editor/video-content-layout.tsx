"use client";

import type { SocialType } from "@delulu/core/publishing/post";
import { SocialTypes } from "@delulu/core/publishing/post";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Delete01Icon, Image01Icon } from "@delulu/icons";
import { useCallback, useState } from "react";
import { MediaUploader } from "@/features/publishing/editor/media-uploader";
import { SocialIcon } from "@/features/publishing/editor/sidebar/social-icon";
import { VideoThumbnailSelector } from "@/features/publishing/editor/video-thumbnail-selector";
import { PLATFORM_MEDIA_RULES } from "@/features/publishing/platform-rules";
import { useMediaUrl } from "@/features/publishing/use-media-url";

interface VideoMedia {
  mediaType: "VIDEO";
  url?: string;
  bucketKey?: string;
  bucketUrl?: string;
  thumbnailBucketUrl?: string;
  thumbnailBucketKey?: string;
  thumbnailMediaId?: string;
  thumbnailTimestamp?: number; // Timestamp in seconds when video frame was extracted
}

interface VideoContentLayoutProps {
  socialType: SocialType;
  videoMedia?: VideoMedia; // Optional for TikTok/YouTube when no video uploaded yet
  text: string;
  title?: string;
  onTextChange: (text: string) => void;
  onTitleChange?: (title: string) => void;
  onThumbnailUpdate: (thumbnail: {
    // For video frame selection: only thumbnailTimestamp (platforms extract the frame)
    // For custom image upload: thumbnailBucketUrl + thumbnailBucketKey
    thumbnailBucketUrl?: string;
    thumbnailBucketKey?: string;
    thumbnailMediaId?: string;
    thumbnailTimestamp?: number; // Timestamp in seconds when video frame was extracted
  }) => void;
  onRemoveVideo: () => void;
  socialId: string;
  orderId?: number;
  showYouTubeTitle?: boolean; // Show YouTube title field (for default with YT)
  platformsInDefault?: SocialType[]; // For default tab context
  /** Most restrictive caption limit across the platforms sharing this text. */
  characterLimit?: number;
}

function getPlatformConfig(socialType: SocialType) {
  switch (socialType) {
    case SocialTypes.TIKTOK:
      return {
        captionLabel: "Caption",
        captionPlaceholder: "Write a catchy caption for your TikTok...",
        maxLength: 2200,
        showTitle: false,
        requirements: "Vertical 9:16 video or a photo carousel",
        isVertical: true,
      };
    case SocialTypes.YOUTUBE:
      return {
        captionLabel: "Description",
        captionPlaceholder: "Describe your video...",
        maxLength: 5000,
        showTitle: true,
        titleMaxLength: 100,
        requirements: "Shorts: vertical 9:16 video, max 60 seconds",
        isVertical: true,
      };
    case SocialTypes.THREADS:
      return {
        captionLabel: "Post",
        captionPlaceholder: "What's on your mind?",
        maxLength: 500,
        showTitle: false,
        requirements: "",
        isVertical: false,
      };
    case SocialTypes.INSTAGRAM:
      return {
        captionLabel: "Caption",
        captionPlaceholder: "Write a caption for your Reel...",
        maxLength: 2200,
        showTitle: false,
        requirements: "Reels: vertical 9:16 video, max 90 seconds",
        isVertical: true,
      };
    default:
      return {
        captionLabel: "Caption",
        captionPlaceholder: "Write a caption...",
        maxLength: undefined,
        showTitle: false,
        requirements: "",
        isVertical: false,
      };
  }
}

export function VideoContentLayout({
  socialType,
  videoMedia,
  text,
  title = "",
  onTextChange,
  onTitleChange,
  onThumbnailUpdate,
  onRemoveVideo,
  socialId,
  orderId = 0,
  showYouTubeTitle = false,
  platformsInDefault = [],
  characterLimit,
}: VideoContentLayoutProps) {
  const config = getPlatformConfig(socialType);
  const maxLength = characterLimit ?? config.maxLength;
  const [isThumbnailDialogOpen, setIsThumbnailDialogOpen] = useState(false);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      if (maxLength && newText.length > maxLength) {
        return;
      }
      onTextChange(newText);
    },
    [maxLength, onTextChange]
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      if (config.titleMaxLength && newTitle.length > config.titleMaxLength) {
        return;
      }
      onTitleChange?.(newTitle);
    },
    [config.titleMaxLength, onTitleChange]
  );

  const titleCharsRemaining = config.titleMaxLength
    ? config.titleMaxLength - title.length
    : 0;

  const videoUrl = useMediaUrl(videoMedia?.bucketKey, videoMedia?.url);
  const hasCustomThumbnailImage = !!(
    videoMedia?.thumbnailBucketUrl || videoMedia?.thumbnailBucketKey
  );
  const thumbnailUrl = useMediaUrl(
    videoMedia?.thumbnailBucketKey,
    videoMedia?.thumbnailBucketUrl
  );

  const videoAspectClass = config.isVertical ? "aspect-[9/16]" : "aspect-video";
  const platforms =
    platformsInDefault.length > 0 ? platformsInDefault : [socialType];
  const requirements = platforms.flatMap((platform) => {
    const text = getPlatformConfig(platform).requirements;
    return text ? [{ platform, text }] : [];
  });
  const showTitle = config.showTitle || showYouTubeTitle;
  const captionPlaceholder =
    platforms.length > 1 ? "Write a caption…" : config.captionPlaceholder;

  return (
    <div className="@container mx-auto w-full max-w-[780px]">
      <div className="grid @xl:grid-cols-[220px_minmax(0,1fr)] @xl:gap-8 gap-6">
        <div className="space-y-3">
          {videoUrl ? (
            <div className="mx-auto w-full max-w-[240px] space-y-2">
              <button
                aria-label={
                  hasCustomThumbnailImage
                    ? "Change thumbnail"
                    : "Select thumbnail"
                }
                className={cn(
                  "group relative block w-full overflow-hidden rounded-xl bg-black outline-none ring-1 ring-border transition-shadow hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring",
                  videoAspectClass
                )}
                onClick={() => setIsThumbnailDialogOpen(true)}
                type="button"
              >
                {hasCustomThumbnailImage ? (
                  <img
                    alt="Video thumbnail"
                    className="h-full w-full object-cover"
                    src={thumbnailUrl!}
                  />
                ) : (
                  <video
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    src={videoUrl}
                  >
                    <track kind="captions" />
                  </video>
                )}
                <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-md bg-black/60 px-2 py-1.5 font-medium text-white text-xs backdrop-blur-sm transition-opacity group-hover:opacity-100 sm:opacity-0">
                  <Icon icon={Image01Icon} size={14} />
                  {hasCustomThumbnailImage
                    ? "Change thumbnail"
                    : "Pick thumbnail"}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="[@media(pointer:coarse)]:h-11"
                  onClick={() => setIsThumbnailDialogOpen(true)}
                  type="button"
                  variant="outline"
                >
                  <Icon icon={Image01Icon} size={16} />
                  Thumbnail
                </Button>
                <Button
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive [@media(pointer:coarse)]:h-11"
                  onClick={onRemoveVideo}
                  type="button"
                  variant="ghost"
                >
                  <Icon icon={Delete01Icon} size={16} />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <MediaUploader
              orderId={orderId}
              socialId={socialId}
              socialType={socialType}
              tileLabel={
                platforms.some(
                  (platform) => PLATFORM_MEDIA_RULES[platform].requiresVideo
                )
                  ? "Add a video"
                  : undefined
              }
              variant="tile"
            />
          )}

          {requirements.length > 0 && (
            <ul className="mx-auto @xl:max-w-[240px] space-y-1.5">
              {requirements.map(({ platform, text }) => (
                <li
                  className="flex items-start gap-2 text-muted-foreground text-xs leading-5"
                  key={platform}
                >
                  <SocialIcon
                    className="mt-0.5 size-3.5 shrink-0"
                    type={platform}
                  />
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {showTitle && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor={`video-title-${socialId}`}>
                  Title
                </Label>
                {showYouTubeTitle && platformsInDefault.length > 1 && (
                  <Badge className="gap-1 font-normal" variant="outline">
                    <SocialIcon className="size-3" type={SocialTypes.YOUTUBE} />
                    YouTube only
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  className="h-11 pr-14 text-base"
                  id={`video-title-${socialId}`}
                  onChange={handleTitleChange}
                  placeholder="Defaults to the start of your caption"
                  value={title}
                />
                {config.titleMaxLength && (
                  <span
                    className={cn(
                      "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs tabular-nums",
                      titleCharsRemaining < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {titleCharsRemaining}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm" htmlFor={`video-caption-${socialId}`}>
                {platforms.length > 1 ? "Caption" : config.captionLabel}
              </Label>
              {maxLength && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    text.length > maxLength
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {text.length.toLocaleString()} / {maxLength.toLocaleString()}
                </span>
              )}
            </div>
            <Textarea
              className="min-h-[clamp(220px,36vh,400px)] resize-none px-3.5 py-3 text-base leading-7 md:text-base"
              id={`video-caption-${socialId}`}
              onChange={handleTextChange}
              placeholder={captionPlaceholder}
              value={text}
            />
          </div>
        </div>
      </div>

      {videoUrl && (
        <VideoThumbnailSelector
          currentThumbnail={{
            url: videoMedia?.thumbnailBucketUrl,
            bucketKey: videoMedia?.thumbnailBucketKey,
            thumbnailTimestamp: videoMedia?.thumbnailTimestamp,
          }}
          isOpen={isThumbnailDialogOpen}
          isVertical={config.isVertical}
          onClose={() => setIsThumbnailDialogOpen(false)}
          onThumbnailUpdate={onThumbnailUpdate}
          videoUrl={videoUrl}
        />
      )}
    </div>
  );
}
