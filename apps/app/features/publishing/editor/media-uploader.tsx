"use client";

import { MEDIA_UPLOADED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import type { MediaType, SocialType } from "@delulu/core/publishing/post";
import { SocialTypes } from "@delulu/core/publishing/post";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@delulu/design-system/components/ui/tooltip";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Cancel01Icon,
  File02Icon,
  FolderLibraryIcon,
  Image01Icon,
  Upload01Icon,
  VideoIcon,
} from "@delulu/icons";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type ExistingMediaSelection,
  existingMediaFiles,
} from "@/features/publishing/editor/existing-media";
import { MediaSelectionDialog } from "@/features/publishing/editor/media-selection-dialog";
import {
  canAddMediaType,
  canUploadMore as canUploadMoreUtil,
  getDynamicMediaLimits,
  validateTikTokVideo,
} from "@/features/publishing/platform-rules";
import { useStore } from "@/features/publishing/store";
import { useMediaStorage } from "@/features/publishing/use-media-storage";
import { useMediaUrl } from "@/features/publishing/use-media-url";

interface MediaFile {
  id: string;
  file?: File;
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
  previewUrl: string;
  bucketKey?: string;
  url?: string;
  size?: number;
  extension?: string;
  originalFilename?: string;
  isUploading?: boolean;
  altText?: string;
  bucketUrl?: string; // for backward compatibility
  thumbnailBucketUrl?: string;
  thumbnailBucketKey?: string;
  thumbnailMediaId?: string;
  thumbnailTimestamp?: number;
}

const VIDEO_UPLOAD_LOG_PREFIX = "[video-upload-layout]";
const shouldLogVideoUploadLayout = process.env.NODE_ENV !== "production";

function logVideoUploadLayout(
  message: string,
  details?: Record<string, unknown>
) {
  if (!shouldLogVideoUploadLayout) {
    return;
  }
  console.log(VIDEO_UPLOAD_LOG_PREFIX, message, details);
}

function getMediaTypeFromFile(file: File): "IMAGE" | "VIDEO" | "DOCUMENT" {
  if (file.type.startsWith("image/")) {
    return "IMAGE";
  }
  if (file.type.startsWith("video/")) {
    return "VIDEO";
  }
  return "DOCUMENT";
}

interface MediaUploaderProps {
  socialType: SocialType;
  socialId: string;
  orderId?: number;
  /**
   * `toolbar`: action row under a text editor, media grid above it.
   * `tile`: a single tall drop zone for video-first layouts.
   */
  variant?: "toolbar" | "tile";
  /** Overrides the tile's call to action, e.g. when a shared platform needs video. */
  tileLabel?: string;
  extraActions?: React.ReactNode;
}

interface MediaPreviewProps {
  media: MediaFile;
  onRemove: (id: string) => void;
  getPreviewAspectRatio: (mediaType: "IMAGE" | "VIDEO" | "DOCUMENT") => string;
}

export function MediaPreview({
  media,
  onRemove,
  getPreviewAspectRatio,
}: MediaPreviewProps) {
  // Use presigned URL for saved media, fallback to previewUrl for local uploads
  const presignedUrl = useMediaUrl(media.bucketKey, media.url);
  const mediaUrl =
    media.bucketKey || media.url ? presignedUrl : media.previewUrl;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "group relative overflow-hidden rounded-lg bg-muted",
        getPreviewAspectRatio(media.mediaType)
      )}
      exit={{ opacity: 0, scale: 0.8 }}
      initial={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
    >
      {media.mediaType === "IMAGE" ? (
        <img
          alt="Preview"
          className="h-full w-full object-cover"
          src={mediaUrl}
        />
      ) : media.mediaType === "VIDEO" ? (
        <div className="relative h-full w-full">
          <video
            className="h-full w-full object-cover"
            controls
            muted
            playsInline
            src={mediaUrl}
          >
            <track kind="captions" />
          </video>
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 group-hover:hidden">
            <Icon className="text-white" icon={VideoIcon} size={24} />
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4">
          <Icon className="text-muted-foreground" icon={File02Icon} size={32} />
          <span className="max-w-full truncate text-center text-muted-foreground text-xs">
            {media.originalFilename ||
              media.extension?.toUpperCase() ||
              "Document"}
          </span>
        </div>
      )}

      {media.isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="flex items-center space-x-2 text-white">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="text-sm">Uploading...</span>
          </div>
        </div>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            animate={{ opacity: 1, scale: 1 }}
            aria-label="Remove media"
            className="absolute top-1 right-1 z-10 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-destructive hover:text-destructive-foreground [@media(pointer:coarse)]:size-11"
            initial={{ opacity: 0, scale: 0.8 }}
            onClick={() => onRemove(media.id)}
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Icon icon={Cancel01Icon} size={12} />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          Remove media
        </TooltipContent>
      </Tooltip>
      <div className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-foreground">
        {media.mediaType === "IMAGE" ? (
          <Icon icon={Image01Icon} size={12} />
        ) : media.mediaType === "VIDEO" ? (
          <Icon icon={VideoIcon} size={12} />
        ) : (
          <Icon icon={File02Icon} size={12} />
        )}
      </div>
    </motion.div>
  );
}

export function MediaUploader({
  socialType,
  socialId,
  orderId,
  variant = "toolbar",
  tileLabel: tileLabelOverride,
  extraActions,
}: MediaUploaderProps) {
  const { post, setPost, setIsMediaUploading } = useStore((state) => ({
    post: state.post,
    setPost: state.setPost,
    setIsMediaUploading: state.setIsMediaUploading,
  }));

  const { uploadAndSaveMedia } = useMediaStorage();
  const analytics = useAnalytics();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isUserAction = useRef(false);
  // Check if we're on the global/default tab by socialId, not socialType
  // socialType can be TIKTOK when on default tab if TikTok is the only platform
  const isGlobal = socialId === "global";

  const writeMediaToStore = useCallback(
    (storeMedia: MediaType[]) => {
      if (orderId === undefined) {
        return;
      }

      logVideoUploadLayout("writing media to post store", {
        target: isGlobal ? "global" : "alternative",
        socialId,
        socialType,
        orderId,
        media: storeMedia,
      });

      if (isGlobal) {
        setPost((currentPost) => ({
          ...currentPost,
          content: currentPost.content.map((item) =>
            item.order === orderId ? { ...item, media: storeMedia } : item
          ),
        }));
        return;
      }

      setPost((currentPost) => ({
        ...currentPost,
        alternativeContent: currentPost.alternativeContent.map((item) =>
          item.socialProvider.socialId === socialId
            ? {
                ...item,
                content: item.content.map((contentItem) =>
                  contentItem.order === orderId
                    ? { ...contentItem, media: storeMedia }
                    : contentItem
                ),
              }
            : item
        ),
      }));
    },
    [isGlobal, orderId, setPost, socialId, socialType]
  );

  const appendPersistedMediaToStore = useCallback(
    (uploadedMedia: MediaType) => {
      if (orderId === undefined) {
        return;
      }

      logVideoUploadLayout("direct upload success store write", {
        target: isGlobal ? "global" : "alternative",
        socialId,
        socialType,
        orderId,
        media: uploadedMedia,
      });

      const appendMedia = <
        T extends {
          media: MediaType[];
        },
      >(
        item: T
      ): T => ({
        ...item,
        media: [
          ...item.media.filter((media) => media.bucketKey || media.url),
          uploadedMedia,
        ],
      });

      if (isGlobal) {
        setPost((currentPost) => ({
          ...currentPost,
          content: currentPost.content.map((item) =>
            item.order === orderId ? appendMedia(item) : item
          ),
        }));
        return;
      }

      setPost((currentPost) => ({
        ...currentPost,
        alternativeContent: currentPost.alternativeContent.map((item) =>
          item.socialProvider.socialId === socialId
            ? {
                ...item,
                content: item.content.map((contentItem) =>
                  contentItem.order === orderId
                    ? appendMedia(contentItem)
                    : contentItem
                ),
              }
            : item
        ),
      }));
    },
    [isGlobal, orderId, setPost, socialId, socialType]
  );

  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>(() => {
    const content = isGlobal
      ? post.content.find((item) => item.order === orderId)
      : post.alternativeContent
          .find((item) => item.socialProvider.socialId === socialId)
          ?.content.find((item) => item.order === orderId);

    return (content?.media || [])
      .map((media) => ({
        id: media.id ?? crypto.randomUUID(),
        mediaType: media.mediaType,
        previewUrl: media.url || "",
        bucketKey: media.bucketKey,
        url: media.url,
        altText: media.altText,
        bucketUrl: media.bucketUrl,
        thumbnailBucketUrl: media.thumbnailBucketUrl,
        thumbnailBucketKey: media.thumbnailBucketKey,
        thumbnailMediaId: media.thumbnailMediaId,
        thumbnailTimestamp: media.thumbnailTimestamp,
        isUploading: false,
      }))
      .filter((m) => m.url || m.bucketKey);
  });

  // Update store only when mediaFiles change due to user actions
  useEffect(() => {
    if (isUserAction.current && orderId !== undefined) {
      const storeMedia = mediaFiles
        .filter((media) => media.bucketKey || media.url)
        .map(
          ({
            id,
            mediaType,
            url,
            bucketKey,
            altText,
            bucketUrl,
            thumbnailBucketUrl,
            thumbnailBucketKey,
            thumbnailMediaId,
            thumbnailTimestamp,
          }) => ({
            id,
            mediaType,
            url,
            bucketKey,
            altText,
            bucketUrl,
            thumbnailBucketUrl,
            thumbnailBucketKey,
            thumbnailMediaId,
            thumbnailTimestamp,
          })
        );

      writeMediaToStore(storeMedia);
      isUserAction.current = false;
    }
  }, [mediaFiles, orderId, writeMediaToStore]);

  // Get dynamic media limits based on current state
  const limits = getDynamicMediaLimits(socialType, mediaFiles);
  const { acceptedMimeTypes, instruction, platformHint } = limits;

  const handleFileProcessing = useCallback(
    async (incomingFiles: File[]) => {
      let newMediaFiles: MediaFile[] = [];
      const validatedFiles: File[] = [];

      logVideoUploadLayout("upload start", {
        socialId,
        socialType,
        orderId,
        isGlobal,
        files: incomingFiles.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
      });

      // Validate each file using centralized validation
      for (const file of incomingFiles) {
        const mediaType = getMediaTypeFromFile(file);
        const validation = canAddMediaType(socialType, mediaType, [
          ...mediaFiles,
          ...validatedFiles.map((f) => ({
            mediaType: getMediaTypeFromFile(f),
          })),
        ]);

        if (!validation.canAdd) {
          if (incomingFiles.length === 1) {
            // Only show error for single file uploads
            toast.error(validation.reason);
          }
          continue;
        }

        // TikTok video validation
        if (
          mediaType === "VIDEO" &&
          socialType === "TIKTOK" &&
          !mediaFiles.some((f) => f.mediaType === "VIDEO")
        ) {
          try {
            const videoValidation = await validateTikTokVideo(file);
            if (!videoValidation.isValid) {
              toast.error(
                `Video validation failed: ${videoValidation.errors.join(", ")}`
              );
              continue;
            }
            if (videoValidation.metadata) {
              const { duration, width, height } = videoValidation.metadata;
              toast.success(
                `Video validated: ${Math.floor(duration)}s, ${width}x${height}`
              );
            }
          } catch (error) {
            toast.error(
              `Video validation error: ${error instanceof Error ? error.message : "Unknown error"}`
            );
            continue;
          }
        }

        validatedFiles.push(file);
      }

      // Create initial media files with uploading state
      newMediaFiles = validatedFiles.map((file) => {
        const extension = file.name.split(".").pop() || "";
        return {
          id: crypto.randomUUID(),
          file,
          mediaType: getMediaTypeFromFile(file),
          previewUrl: URL.createObjectURL(file),
          size: file.size,
          extension,
          originalFilename: file.name,
          isUploading: true,
        };
      });

      const updatedMediaFiles = [...mediaFiles, ...newMediaFiles];
      isUserAction.current = true;
      setMediaFiles(updatedMediaFiles);

      logVideoUploadLayout("optimistic local media inserted", {
        socialId,
        socialType,
        orderId,
        media: newMediaFiles.map((media) => ({
          id: media.id,
          mediaType: media.mediaType,
          originalFilename: media.originalFilename,
        })),
        mediaCount: updatedMediaFiles.length,
      });

      // Set upload state to true when starting uploads
      if (newMediaFiles.length > 0) {
        setIsMediaUploading(true);
      }

      // Upload files immediately
      try {
        const uploadPromises = newMediaFiles.map(async (mediaFile) => {
          if (!mediaFile.file) {
            return mediaFile;
          }

          try {
            const uploadResult = await uploadAndSaveMedia(mediaFile.file);

            logVideoUploadLayout("upload success", {
              socialId,
              socialType,
              orderId,
              id: mediaFile.id,
              mediaId: uploadResult.mediaId,
              bucketKey: uploadResult.bucketKey,
              url: uploadResult.url,
            });

            appendPersistedMediaToStore({
              id: uploadResult.mediaId,
              mediaType: mediaFile.mediaType,
              bucketKey: uploadResult.bucketKey,
              url: uploadResult.url,
            });

            // Update the media file with upload results
            setMediaFiles((prev) => {
              isUserAction.current = true; // Ensure store update happens
              return prev.map((item) =>
                item.id === mediaFile.id
                  ? {
                      ...item,
                      id: uploadResult.mediaId ?? item.id,
                      bucketKey: uploadResult.bucketKey,
                      url: uploadResult.url,
                      originalFilename: mediaFile.file?.name,
                      isUploading: false,
                      file: undefined, // Remove file after upload
                    }
                  : item
              );
            });

            return {
              ...mediaFile,
              id: uploadResult.mediaId ?? mediaFile.id,
              bucketKey: uploadResult.bucketKey,
              url: uploadResult.url,
              originalFilename: mediaFile.file?.name,
              isUploading: false,
              file: undefined,
            };
          } catch (error) {
            // Upload failed - error will be handled by removal from list
            logVideoUploadLayout("upload failed, removing local media", {
              socialId,
              socialType,
              orderId,
              id: mediaFile.id,
              error,
            });

            // Remove failed upload from list
            setMediaFiles((prev) => {
              isUserAction.current = true; // Ensure store update happens
              return prev.filter((item) => item.id !== mediaFile.id);
            });

            return null;
          }
        });

        const results = await Promise.all(uploadPromises);
        const successCount = results.filter(Boolean).length;
        if (successCount > 0) {
          analytics.capture(MEDIA_UPLOADED, {
            count: successCount,
            media_types: validatedFiles.map((f) => getMediaTypeFromFile(f)),
            platform: socialType,
          });
        }
      } catch (_error) {
        // Upload process failed - individual errors already handled
      } finally {
        // Clear upload state when all uploads are done
        setIsMediaUploading(false);
      }
    },
    [
      mediaFiles,
      socialId,
      socialType,
      orderId,
      isGlobal,
      uploadAndSaveMedia,
      appendPersistedMediaToStore,
      setIsMediaUploading,
      analytics,
    ]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      handleFileProcessing(files);
    },
    [handleFileProcessing]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      handleFileProcessing(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFileProcessing]
  );

  const removeFile = useCallback((id: string) => {
    isUserAction.current = true;
    setMediaFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter((file) => file.id !== id);
    });
  }, []);

  const handleSelectExistingMedia = useCallback(
    (selectedMedia: ExistingMediaSelection[]) => {
      const newMediaFiles = existingMediaFiles(selectedMedia);

      isUserAction.current = true;
      setMediaFiles((prev) => [...prev, ...newMediaFiles]);
    },
    []
  );

  const getPreviewAspectRatio = (mediaType: "IMAGE" | "VIDEO" | "DOCUMENT") => {
    if (socialType === "TIKTOK" || socialType === "YOUTUBE") {
      return mediaType === "VIDEO" ? "aspect-[9/16]" : "aspect-square";
    }
    if (socialType === "INSTAGRAM") {
      return mediaType === "VIDEO" ? "aspect-[9/16]" : "aspect-[4/5]";
    }
    return "aspect-square";
  };

  // Check if more media can be uploaded using centralized utility
  const canUploadMore = canUploadMoreUtil(socialType, mediaFiles);

  const allowMultiple = !(
    socialType === "TIKTOK" ||
    socialType === "YOUTUBE" ||
    mediaFiles.some((f) => f.mediaType === "VIDEO")
  );

  const dragHandlers = {
    onDragLeave: () => setIsDragOver(false),
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    },
    onDrop: handleDrop,
  };

  const mediaGrid = mediaFiles.length > 0 && (
    <motion.div
      animate={{ opacity: 1, height: "auto" }}
      className={cn(
        "grid gap-3",
        variant === "tile"
          ? "mx-auto w-full max-w-[240px] grid-cols-1"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
      )}
      initial={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <AnimatePresence>
        {mediaFiles.map((media) => (
          <MediaPreview
            getPreviewAspectRatio={getPreviewAspectRatio}
            key={media.id}
            media={media}
            onRemove={removeFile}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );

  const openFilePicker = () => fileInputRef.current?.click();
  const openLibrary = () => setIsDialogOpen(true);
  // Labels collapse to icons on narrow toolbars; tiles always show them.
  const addActions = (
    <>
      <Button
        aria-label={`Add media. ${instruction}`}
        className="text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11"
        onClick={openFilePicker}
        title={platformHint}
        type="button"
        variant="ghost"
      >
        <Icon icon={Image01Icon} size={16} />
        <span className={cn(variant === "toolbar" && "hidden sm:inline")}>
          Add media
        </span>
      </Button>
      <Button
        aria-label="Choose existing media from library"
        className="text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11"
        onClick={openLibrary}
        type="button"
        variant="ghost"
      >
        <Icon icon={FolderLibraryIcon} size={16} />
        <span className={cn(variant === "toolbar" && "hidden sm:inline")}>
          Library
        </span>
      </Button>
    </>
  );
  const tileLabel =
    tileLabelOverride ??
    (limits.canAddVideos && !limits.canAddImages
      ? "Add a video"
      : limits.canAddImages && !limits.canAddVideos
        ? "Add images"
        : "Add video or images");

  return (
    <div className="space-y-3">
      <input
        accept={acceptedMimeTypes.join(",")}
        className="hidden"
        multiple={allowMultiple}
        onChange={handleFileInput}
        ref={fileInputRef}
        type="file"
      />

      {variant === "tile" ? (
        mediaFiles.length > 0 ? (
          <>
            {mediaGrid}
            {canUploadMore && (
              <div
                className={cn(
                  "mx-auto flex min-h-11 w-full max-w-[240px] items-center justify-center gap-1 rounded-md",
                  isDragOver && "bg-primary/5"
                )}
                {...dragHandlers}
              >
                {addActions}
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto w-full @xl:max-w-[240px] space-y-2">
            <button
              aria-label={`${tileLabel}. ${instruction}`}
              className={cn(
                "flex @xl:aspect-[9/16] @xl:h-auto h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-border border-dashed bg-muted/30 px-4 text-center outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50",
                isDragOver && "border-primary bg-primary/10"
              )}
              onClick={openFilePicker}
              title={platformHint}
              type="button"
              {...dragHandlers}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-background text-foreground shadow-xs ring-1 ring-border">
                <Icon icon={Upload01Icon} size={20} />
              </span>
              <span className="font-medium text-sm">{tileLabel}</span>
              <span className="text-muted-foreground text-xs leading-5">
                Drag and drop, or click to browse
              </span>
            </button>
            <Button
              className="w-full [@media(pointer:coarse)]:h-11"
              onClick={openLibrary}
              type="button"
              variant="outline"
            >
              <Icon icon={FolderLibraryIcon} size={16} />
              Choose from library
            </Button>
          </div>
        )
      ) : (
        <>
          {mediaGrid}
          <div
            className={cn(
              "flex min-h-11 items-center gap-1 border-border/60 border-t pt-2",
              isDragOver && "bg-primary/5"
            )}
            {...dragHandlers}
          >
            {canUploadMore && addActions}
            {extraActions && (
              <div className="ml-auto flex items-center gap-0.5">
                {extraActions}
              </div>
            )}
          </div>
        </>
      )}

      <MediaSelectionDialog
        currentMedia={mediaFiles.map((m) => ({
          id: m.id,
          url: m.url || m.previewUrl,
          bucketKey: m.bucketKey || "",
          mediaType: m.mediaType,
          originalFilename: m.originalFilename,
          size: m.size,
          extension: m.extension,
          altText: m.altText,
          createdAt: new Date().toISOString(),
        }))}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSelect={handleSelectExistingMedia}
        socialType={socialType}
      />
    </div>
  );
}
