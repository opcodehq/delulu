"use client";

import type { SocialType } from "@delulu/core/publishing/post";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { Input } from "@delulu/design-system/components/ui/input";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Image01Icon, Search01Icon, VideoIcon } from "@delulu/icons";
import { motion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  canAddMediaType,
  getDynamicMediaLimits,
  getMediaCountInstruction,
} from "@/features/publishing/platform-rules";
import { useMediaUrl } from "@/features/publishing/use-media-url";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

interface MediaItem {
  id: string;
  url: string;
  bucketKey: string;
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
  originalFilename?: string | null;
  size?: number | null;
  extension?: string | null;
  altText?: string | null;
  createdAt: string | Date;
}

interface MediaSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: MediaItem[]) => void;
  socialType: SocialType;
  currentMedia: MediaItem[];
}

function MediaGridItem({
  media,
  isSelected,
  canSelect,
  onMediaSelect,
}: {
  media: MediaItem;
  isSelected: boolean;
  canSelect: boolean;
  onMediaSelect: (media: MediaItem) => void;
}) {
  const mediaUrl = useMediaUrl(media.bucketKey, media.url);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg border-2 bg-muted",
        {
          "cursor-pointer border-primary": isSelected,
          "cursor-pointer border-border hover:border-input":
            canSelect && !isSelected,
          "cursor-not-allowed border-border opacity-50": !(
            canSelect || isSelected
          ),
        }
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      onClick={() => (isSelected || canSelect) && onMediaSelect(media)}
      onMouseEnter={(e) => {
        if (media.mediaType === "VIDEO") {
          const video = e.currentTarget.querySelector("video");
          if (video) {
            video.play().catch((error) => {
              console.error("Error playing video:", error);
            });
          }
        }
      }}
      onMouseLeave={(e) => {
        if (media.mediaType === "VIDEO") {
          const video = e.currentTarget.querySelector("video");
          if (video) {
            video.pause();
            video.currentTime = 0;
          }
        }
      }}
    >
      {media.mediaType === "IMAGE" ? (
        <Image
          alt={media.altText || "Media"}
          className="object-cover"
          fill
          sizes="(max-width: 768px) 25vw, 200px"
          src={mediaUrl}
        />
      ) : (
        <div className="relative h-full w-full">
          <video
            className="h-full w-full object-cover"
            loop
            muted
            playsInline
            preload="metadata"
            src={mediaUrl}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 transition-opacity group-hover:opacity-0">
            <div className="rounded-full bg-black bg-opacity-50 p-2">
              <Icon className="text-white" icon={VideoIcon} size={16} />
            </div>
          </div>
        </div>
      )}

      {isSelected && (
        <div className="absolute top-2 right-2 rounded-full bg-primary p-1">
          <svg
            aria-label="Selected"
            className="h-3 w-3 text-primary-foreground"
            fill="currentColor"
            role="img"
            viewBox="0 0 20 20"
          >
            <path
              clipRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              fillRule="evenodd"
            />
          </svg>
        </div>
      )}

      <div className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5">
        {media.mediaType === "IMAGE" ? (
          <Icon icon={Image01Icon} size={12} />
        ) : (
          <Icon icon={VideoIcon} size={12} />
        )}
      </div>
    </motion.div>
  );
}

interface MediaGridProps {
  filteredMedia: MediaItem[];
  selectedMedia: MediaItem[];
  canSelectImages: boolean;
  canSelectVideos: boolean;
  onMediaSelect: (media: MediaItem) => void;
  onScrollEnd: () => void;
}

function MediaGrid({
  filteredMedia,
  selectedMedia,
  canSelectImages,
  canSelectVideos,
  onMediaSelect,
  onScrollEnd,
}: MediaGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll detection for infinite scroll
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    // Trigger load more when scrolled to 80%
    if (scrollPercentage > 0.8) {
      onScrollEnd();
    }
  }, [onScrollEnd]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div className="h-full overflow-y-auto" ref={containerRef}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filteredMedia.map((media) => {
          const isSelected = selectedMedia.some((m) => m.id === media.id);
          const canSelect =
            !isSelected &&
            ((media.mediaType === "IMAGE" && canSelectImages) ||
              (media.mediaType === "VIDEO" && canSelectVideos));

          return (
            <MediaGridItem
              canSelect={canSelect}
              isSelected={isSelected}
              key={media.id}
              media={media}
              onMediaSelect={onMediaSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

export function MediaSelectionDialog({
  isOpen,
  onClose,
  onSelect,
  socialType,
  currentMedia,
}: MediaSelectionDialogProps) {
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();

  // Get dynamic media limits based on current state
  const limits = getDynamicMediaLimits(socialType, currentMedia);
  const { canAddImages, canAddVideos, remainingImages, remainingVideos } =
    limits;

  const mediaQuery = useResourceAtom({
    ...resources.media.list(workspaceId ?? "", { limit: 100 }),
    enabled: isOpen && Boolean(workspaceId),
    staleTime: 30_000,
    retry: 2,
  });
  const isLoading = mediaQuery.isPending;
  const allMedia: MediaItem[] = (mediaQuery.data?.data ?? []).map((item) => ({
    id: item.id,
    url: item.url,
    bucketKey: item.bucketKey,
    mediaType: item.mediaType.toUpperCase() as MediaItem["mediaType"],
    size: Number(item.sizeBytes),
    altText: item.altText,
    createdAt: item.createdAt,
  }));

  // Reset when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedMedia([]);
    }
  }, [isOpen]);

  // Filter media based on platform constraints
  const filteredMedia = allMedia.filter((media) => {
    // Filter by what can still be added
    if (media.mediaType === "IMAGE" && !canAddImages) {
      return false;
    }
    if (media.mediaType === "VIDEO" && !canAddVideos) {
      return false;
    }

    return true;
  });

  // Validate if a specific media item can be selected
  const canSelectMedia = (media: MediaItem): boolean => {
    // If already selected, allow deselection
    if (selectedMedia.some((m) => m.id === media.id)) {
      return true;
    }

    // Use centralized validation with current + selected media
    const allCurrentMedia = [...currentMedia, ...selectedMedia];
    const validation = canAddMediaType(
      socialType,
      media.mediaType,
      allCurrentMedia
    );
    return validation.canAdd;
  };

  const handleMediaSelect = (media: MediaItem) => {
    setSelectedMedia((prev) => {
      const isSelected = prev.some((m) => m.id === media.id);

      // Allow deselection
      if (isSelected) {
        return prev.filter((m) => m.id !== media.id);
      }

      // Check if we can select this media
      if (!canSelectMedia(media)) {
        return prev;
      }

      return [...prev, media];
    });
  };

  const handleConfirm = () => {
    onSelect(selectedMedia);
    onClose();
  };

  // Calculate max selection info
  const maxSelectable = remainingImages + remainingVideos;

  // Get constraint message using centralized utility
  const getConstraintMessage = () => {
    const instruction = getMediaCountInstruction(socialType, currentMedia);

    if (selectedMedia.length > 0) {
      // Show what will be available after current selection
      const futureMedia = [...currentMedia, ...selectedMedia];
      const futureLimits = getDynamicMediaLimits(socialType, futureMedia);
      return `${instruction} → After selection: ${futureLimits.remainingImages} image(s), ${futureLimits.remainingVideos} video(s) remaining`;
    }

    return instruction;
  };

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="max-h-[85vh] max-w-6xl">
        <DialogHeader>
          <DialogTitle>Select from Your Media Library</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Icon
              className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
              size={16}
            />
            <Input
              className="pl-10"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search media..."
              value={searchQuery}
            />
          </div>

          {/* Constraint message */}
          <div className="rounded bg-muted/50 p-2 text-muted-foreground text-sm">
            {getConstraintMessage()}
          </div>

          {/* Media Grid with Virtual Scrolling */}
          <div className="h-96 overflow-y-auto">
            {isLoading && allMedia.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-muted-foreground">Loading media...</p>
                </div>
              </div>
            )}
            {!isLoading && filteredMedia.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Icon
                    className="mx-auto mb-4 text-muted-foreground"
                    icon={Image01Icon}
                    size={48}
                  />
                  <p className="text-muted-foreground">No media found</p>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {searchQuery
                      ? "Try a different search term"
                      : "Upload some media first"}
                  </p>
                </div>
              </div>
            )}
            {filteredMedia.length > 0 && (
              <MediaGrid
                canSelectImages={canAddImages}
                canSelectVideos={canAddVideos}
                filteredMedia={filteredMedia}
                onMediaSelect={handleMediaSelect}
                onScrollEnd={() => undefined}
                selectedMedia={selectedMedia}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-muted-foreground text-sm">
            {selectedMedia.length} of {maxSelectable} selected
          </div>
          <div className="flex space-x-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={selectedMedia.length === 0}
              onClick={handleConfirm}
            >
              Select ({selectedMedia.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
