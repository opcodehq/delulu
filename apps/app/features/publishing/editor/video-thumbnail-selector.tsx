"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Loading03Icon, Upload01Icon, VideoIcon } from "@delulu/icons";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMediaStorage } from "@/features/publishing/use-media-storage";
import { useMediaUrl } from "@/features/publishing/use-media-url";
import {
  blobToFile,
  extractVideoFrame,
  formatTimestamp,
} from "@/features/publishing/video-frames";

interface VideoThumbnailSelectorProps {
  videoUrl: string;
  videoFile?: File;
  currentThumbnail?: {
    url?: string;
    bucketKey?: string;
    bucketUrl?: string;
    thumbnailTimestamp?: number; // Existing timestamp if set
  };
  onThumbnailUpdate: (thumbnail: {
    // For video frame selection: only thumbnailTimestamp (platforms extract the frame)
    // For custom image upload: thumbnailBucketUrl + thumbnailBucketKey
    thumbnailBucketUrl?: string;
    thumbnailBucketKey?: string;
    thumbnailMediaId?: string;
    thumbnailTimestamp?: number; // Timestamp in seconds when video frame was extracted
  }) => void;
  isOpen: boolean;
  onClose: () => void;
  isVertical?: boolean; // Whether video is vertical (9:16) or horizontal (16:9)
}

export function VideoThumbnailSelector({
  videoUrl,
  videoFile,
  currentThumbnail,
  onThumbnailUpdate,
  isOpen,
  onClose,
  isVertical = true, // Default to vertical for shorts/reels/tiktok
}: VideoThumbnailSelectorProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customThumbnail, setCustomThumbnail] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAndSaveMedia } = useMediaStorage();
  const resolvedVideoUrl = useMediaUrl(undefined, videoUrl);
  const resolvedThumbnailUrl = useMediaUrl(
    currentThumbnail?.bucketKey,
    currentThumbnail?.url
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setCustomThumbnail(null);
      setIsCapturing(false);
    }
  }, [isOpen]);

  // Get the video source (prefer videoFile for local files)
  const videoSource = videoFile || videoUrl;

  // Extract frame, upload to R2, and save — all in one action
  const handleExtractCurrentFrame = useCallback(async () => {
    if (!(videoRef.current && videoSource)) {
      return;
    }

    setIsCapturing(true);
    try {
      const currentTime = videoRef.current.currentTime;
      const frame = await extractVideoFrame(videoSource, currentTime);
      const thumbnailToUpload = blobToFile(
        frame.blob,
        `thumbnail-${Date.now()}.jpg`
      );
      const result = await uploadAndSaveMedia(thumbnailToUpload);
      if (!result.mediaId) {
        throw new Error("Thumbnail upload did not return a media ID");
      }
      onThumbnailUpdate({
        thumbnailBucketUrl: result.url,
        thumbnailBucketKey: result.bucketKey,
        thumbnailMediaId: result.mediaId,
      });
      toast.success(`Thumbnail set to ${formatTimestamp(currentTime)}`);
      onClose();
    } catch (error) {
      console.error("Failed to capture frame:", error);
      toast.error("Failed to capture frame");
    } finally {
      setIsCapturing(false);
    }
  }, [videoSource, uploadAndSaveMedia, onThumbnailUpdate, onClose]);

  // Handle custom thumbnail upload
  const handleCustomThumbnail = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setCustomThumbnail(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  // Save custom uploaded image
  const handleSaveThumbnail = useCallback(async () => {
    if (!customThumbnail) {
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch(customThumbnail);
      const blob = await response.blob();
      const thumbnailToUpload = blobToFile(blob, `thumbnail-${Date.now()}.jpg`);
      const result = await uploadAndSaveMedia(thumbnailToUpload);
      if (!result.mediaId) {
        throw new Error("Thumbnail upload did not return a media ID");
      }

      onThumbnailUpdate({
        thumbnailBucketUrl: result.url,
        thumbnailBucketKey: result.bucketKey,
        thumbnailMediaId: result.mediaId,
      });

      toast.success("Thumbnail saved");
      onClose();
    } catch (error) {
      console.error("Failed to upload thumbnail:", error);
      toast.error("Failed to upload thumbnail");
    } finally {
      setIsUploading(false);
    }
  }, [customThumbnail, uploadAndSaveMedia, onThumbnailUpdate, onClose]);

  const hasCustomImage = currentThumbnail?.url || currentThumbnail?.bucketKey;
  const videoAspectClass = isVertical ? "aspect-[9/16]" : "aspect-video";

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          isVertical ? "sm:max-w-sm" : "sm:max-w-md"
        )}
      >
        <DialogHeader>
          <DialogTitle>Select Thumbnail</DialogTitle>
          <DialogDescription>
            Scrub to a frame and capture it, or upload an image
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Player */}
          <div
            className={cn(
              "relative mx-auto w-full overflow-hidden rounded-lg bg-black",
              videoAspectClass
            )}
          >
            <video
              className="h-full w-full object-contain"
              controls
              playsInline
              ref={videoRef}
              src={resolvedVideoUrl}
            >
              <track kind="captions" />
            </video>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!videoSource || isCapturing}
              onClick={handleExtractCurrentFrame}
              type="button"
              variant="outline"
            >
              {isCapturing ? (
                <>
                  <Icon
                    className="mr-2 animate-spin"
                    icon={Loading03Icon}
                    size={16}
                  />
                  Capturing...
                </>
              ) : (
                <>
                  <Icon className="mr-2" icon={VideoIcon} size={16} />
                  Capture Frame
                </>
              )}
            </Button>

            <input
              accept="image/*"
              className="hidden"
              onChange={handleCustomThumbnail}
              ref={fileInputRef}
              type="file"
            />

            <Button
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <Icon className="mr-2" icon={Upload01Icon} size={16} />
              Upload Image
            </Button>
          </div>

          {/* Custom Image Preview + Save */}
          {customThumbnail && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-3">
              <p className="font-medium text-sm">Preview</p>
              <div
                className={cn(
                  "relative mx-auto max-w-[160px] overflow-hidden rounded-md border-2 border-primary",
                  videoAspectClass
                )}
              >
                <img
                  alt="Custom thumbnail preview"
                  className="h-full w-full object-cover"
                  src={customThumbnail}
                />
              </div>

              <Button
                className="w-full"
                disabled={isUploading}
                onClick={handleSaveThumbnail}
                type="button"
              >
                {isUploading ? (
                  <>
                    <Icon
                      className="mr-2 animate-spin"
                      icon={Loading03Icon}
                      size={16}
                    />
                    Saving...
                  </>
                ) : (
                  "Save Thumbnail"
                )}
              </Button>
            </div>
          )}

          {/* Current Thumbnail Display */}
          {hasCustomImage && !customThumbnail && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <div
                className={cn(
                  "w-12 shrink-0 overflow-hidden rounded border border-border",
                  videoAspectClass
                )}
              >
                <img
                  alt="Current thumbnail"
                  className="h-full w-full object-cover"
                  src={resolvedThumbnailUrl}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Current thumbnail set. Capture a new frame or upload to replace.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
