"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Delete01Icon, Image01Icon, PencilEdit01Icon } from "@delulu/icons";
import type { SocialType } from "@delulu/validators/post";
import { SocialTypes } from "@delulu/validators/post";
import { useCallback, useState } from "react";
import { useMediaUrl } from "@/hooks/use-media-url";
import { MediaUploader } from "./media-uploader";
import { VideoThumbnailSelector } from "./video-thumbnail-selector";

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
}

function getPlatformConfig(socialType: SocialType) {
  switch (socialType) {
    case SocialTypes.TIKTOK:
      return {
        captionLabel: "Caption",
        captionPlaceholder: "Write a catchy caption for your TikTok...",
        maxLength: 2200,
        showTitle: false,
        showCharCount: true,
        requirements: "Max 2,200 characters, vertical 9:16 video",
        isVertical: true,
      };
    case SocialTypes.YOUTUBE:
      return {
        captionLabel: "Description",
        captionPlaceholder: "Describe your video...",
        maxLength: 5000,
        showTitle: true,
        titlePlaceholder: "YouTube Shorts title (max 100 characters)",
        titleMaxLength: 100,
        showCharCount: true,
        requirements: "YouTube Shorts: 9:16 vertical video, max 60 seconds",
        isVertical: true,
      };
    case SocialTypes.THREADS:
      return {
        captionLabel: "Post",
        captionPlaceholder: "What's on your mind?",
        maxLength: 500,
        showTitle: false,
        showCharCount: true,
        requirements: "Max 500 characters",
        isVertical: false,
      };
    case SocialTypes.INSTAGRAM:
      return {
        captionLabel: "Caption",
        captionPlaceholder: "Write a caption for your Reel...",
        maxLength: 2200,
        showTitle: false,
        showCharCount: true,
        requirements: "Instagram Reels: 9:16 vertical video, max 90 seconds",
        isVertical: true,
      };
    default:
      return {
        captionLabel: "Caption",
        captionPlaceholder: "Write a caption...",
        maxLength: undefined,
        showTitle: false,
        showCharCount: false,
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
}: VideoContentLayoutProps) {
  const config = getPlatformConfig(socialType);
  const [isThumbnailDialogOpen, setIsThumbnailDialogOpen] = useState(false);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      if (config.maxLength && newText.length > config.maxLength) {
        return;
      }
      onTextChange(newText);
    },
    [config.maxLength, onTextChange]
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

  const charsRemaining = config.maxLength ? config.maxLength - text.length : 0;
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

  return (
    <div className="mx-auto w-full max-w-[780px]">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8">
        {/* Left Column - Video Upload or Thumbnail Preview */}
        <div className="order-2 space-y-3">
          {videoUrl ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Thumbnail preview</Label>
                {hasCustomThumbnailImage && (
                  <Badge className="gap-1" variant="secondary">
                    <Icon icon={Image01Icon} size={12} />
                    Set
                  </Badge>
                )}
              </div>
              <button
                className={cn(
                  "group relative mx-auto block w-full max-w-sm overflow-hidden rounded-lg border border-border transition-colors hover:border-foreground/35",
                  videoAspectClass,
                  "border-border bg-black"
                )}
                onClick={() => setIsThumbnailDialogOpen(true)}
                type="button"
              >
                {hasCustomThumbnailImage ? (
                  <>
                    {/* Show custom thumbnail image */}
                    <img
                      alt="Video thumbnail"
                      className="h-full w-full object-cover"
                      src={thumbnailUrl!}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="rounded-lg bg-background px-4 py-2 text-foreground shadow-lg">
                        <div className="flex items-center gap-2">
                          <Icon icon={PencilEdit01Icon} size={16} />
                          <span className="font-medium text-sm">
                            Change thumbnail
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Show video when no thumbnail is set */}
                    <video
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      src={videoUrl}
                    >
                      <track kind="captions" />
                    </video>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="rounded-lg bg-background px-4 py-2 text-foreground shadow-lg">
                        <div className="flex items-center gap-2">
                          <Icon icon={Image01Icon} size={16} />
                          <span className="font-medium text-sm">
                            Select thumbnail
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </button>

              {/* Thumbnail button below preview */}
              <Button
                className="w-full"
                onClick={() => setIsThumbnailDialogOpen(true)}
                type="button"
                variant="outline"
              >
                <Icon className="mr-2" icon={Image01Icon} size={16} />
                {hasCustomThumbnailImage
                  ? "Change thumbnail"
                  : "Select thumbnail"}
              </Button>

              {/* Remove Video button */}
              <Button
                className="w-full"
                onClick={onRemoveVideo}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Icon className="mr-2" icon={Delete01Icon} size={14} />
                Remove video
              </Button>
            </div>
          ) : (
            <>
              {/* Show MediaUploader when no video */}
              <Label className="text-sm">Video</Label>
              <MediaUploader
                compact
                orderId={orderId}
                socialId={socialId}
                socialType={socialType}
              />
            </>
          )}
        </div>

        {/* Right Column - Text Content */}
        <div className="order-1 space-y-5">
          {/* Platform Requirements */}
          {config.requirements && (
            <div className="rounded-lg bg-muted/60 px-3 py-2.5 ring-1 ring-border/70">
              <p className="text-muted-foreground text-xs">
                {config.requirements}
              </p>
            </div>
          )}

          {/* Title Input (YouTube) */}
          {(config.showTitle || showYouTubeTitle) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm" htmlFor="video-title">
                  Title {config.titleMaxLength && "*"}
                </Label>
                {showYouTubeTitle && platformsInDefault.length > 1 && (
                  <Badge className="gap-1 text-xs" variant="outline">
                    <svg
                      className="h-3 w-3 text-red-600"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    YouTube only
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  className="h-11 rounded-lg bg-background pr-16 text-base shadow-none"
                  id="video-title"
                  onChange={handleTitleChange}
                  placeholder={config.titlePlaceholder}
                  required={config.titleMaxLength !== undefined}
                  value={title}
                />
                {config.titleMaxLength && (
                  <div
                    className={cn(
                      "absolute top-1/2 right-3 -translate-y-1/2 text-xs",
                      titleCharsRemaining < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {titleCharsRemaining}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Caption/Description Textarea */}
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="video-caption">
              {config.captionLabel}
            </Label>
            <div className="relative">
              <Textarea
                className="min-h-[clamp(240px,38vh,420px)] resize-none overflow-hidden rounded-lg border-border/80 bg-card px-4 py-3 pr-16 text-[17px] leading-7 shadow-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/25 focus-visible:ring-0 md:text-[17px]"
                id="video-caption"
                onChange={handleTextChange}
                placeholder={config.captionPlaceholder}
                value={text}
              />
              {config.showCharCount && config.maxLength && (
                <div
                  className={cn(
                    "absolute top-2 right-2 text-xs",
                    charsRemaining < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {charsRemaining}
                </div>
              )}
            </div>
          </div>

          {/* Character count info */}
          {config.showCharCount && config.maxLength && (
            <p className="text-muted-foreground text-xs">
              {text.length} / {config.maxLength} characters
            </p>
          )}
        </div>
      </div>

      {/* Thumbnail Selector Dialog */}
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
