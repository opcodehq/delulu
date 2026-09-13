"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@delulu/design-system/components/ui/tooltip";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Remove01Icon } from "@delulu/icons";
import { type SocialType, SocialTypes } from "@delulu/validators/post";
import { useCallback, useMemo, useRef } from "react";
import {
  getDefaultCharacterLimit,
  getDefaultPlaceholder,
  getPlatformsInDefault,
  PLATFORM_CHARACTER_LIMITS,
  shouldDefaultUseVideoLayout,
  shouldShowYouTubeTitle,
  shouldUseMultiPostLayout,
} from "@/lib/platform-rules";
import {
  useIsMediaUploading,
  useSelectedSocialProviders,
  useStore,
} from "@/store/post";
import { MediaUploader } from "./media-uploader";
import { VideoContentLayout } from "./video-content-layout";

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

interface ContentModuleProps {
  socialId: string;
  socialType: SocialType;
}

// This function is no longer used, replaced by dynamic placeholder from default-platform-rules

export function ContentModule({ socialId, socialType }: ContentModuleProps) {
  const { post, setPost } = useStore((state) => ({
    post: state.post,
    setPost: state.setPost,
  }));
  const selectedSocialProviders = useSelectedSocialProviders();
  const isMediaUploading = useIsMediaUploading();

  const isGlobal = socialType === SocialTypes.DEFAULT;

  // Determine which platforms are in default (for intelligent defaults) - memoized
  const platformsInDefault = useMemo(
    () =>
      isGlobal
        ? getPlatformsInDefault(
            selectedSocialProviders,
            post.alternativeContent
          )
        : [],
    [isGlobal, selectedSocialProviders, post.alternativeContent]
  );

  // Determine effective social type for default tab - memoized
  const effectiveSocialType = useMemo(
    () =>
      isGlobal && platformsInDefault.length > 0
        ? platformsInDefault[0] // Use first platform as representative
        : socialType,
    [isGlobal, platformsInDefault, socialType]
  );
  const usesMultiPostLayout = shouldUseMultiPostLayout(
    socialType,
    platformsInDefault
  );
  const characterLimit = isGlobal
    ? getDefaultCharacterLimit(platformsInDefault)
    : usesMultiPostLayout
      ? PLATFORM_CHARACTER_LIMITS[socialType]
      : undefined;
  const content = isGlobal
    ? post.content
    : post.alternativeContent.find(
        (item) => item.socialProvider.socialId === socialId
      )?.content || [];

  const handleTextChange = useCallback(
    (text: string, order: number) => {
      if (isGlobal) {
        setPost((currentPost) => ({
          ...currentPost,
          content: currentPost.content.map((item) =>
            item.order === order ? { ...item, text } : item
          ),
        }));
      } else if (socialId) {
        setPost((currentPost) => ({
          ...currentPost,
          alternativeContent: currentPost.alternativeContent.map((item) =>
            item.socialProvider.socialId === socialId
              ? {
                  ...item,
                  content: item.content.map((contentItem) =>
                    contentItem.order === order
                      ? { ...contentItem, text }
                      : contentItem
                  ),
                }
              : item
          ),
        }));
      }
    },
    [isGlobal, setPost, socialId]
  );

  const addThreadPost = useCallback(
    (afterOrder: number) => {
      const newOrder = afterOrder + 1;

      const newPost = {
        id: "",
        order: newOrder,
        name: isGlobal ? "DEFAULT" : socialId,
        media: [],
        text: "",
        tags: [],
        socialId,
      };

      if (isGlobal) {
        setPost((currentPost) => {
          const currentContent = currentPost.content;
          const updatedContent = [
            ...currentContent
              .filter((item) => item.order <= afterOrder)
              .map((item) => ({ ...item })),
            newPost,
            ...currentContent
              .filter((item) => item.order > afterOrder)
              .map((item) => ({ ...item, order: item.order + 1 })),
          ].sort((a, b) => a.order - b.order);
          return { ...currentPost, content: updatedContent };
        });
      } else {
        setPost((currentPost) => ({
          ...currentPost,
          alternativeContent: currentPost.alternativeContent.map((item) => {
            if (item.socialProvider.socialId !== socialId) {
              return item;
            }
            const currentContent = item.content;
            const updatedContent = [
              ...currentContent
                .filter((c) => c.order <= afterOrder)
                .map((c) => ({ ...c })),
              newPost,
              ...currentContent
                .filter((c) => c.order > afterOrder)
                .map((c) => ({ ...c, order: c.order + 1 })),
            ].sort((a, b) => a.order - b.order);
            return { ...item, content: updatedContent };
          }),
        }));
      }
    },
    [isGlobal, setPost, socialId]
  );

  const removeThreadPost = useCallback(
    (order: number) => {
      const reorder = (items: typeof content) => {
        if (items.length <= 1) {
          return items; // Keep at least one post in the thread
        }
        return items
          .filter((item) => item.order !== order)
          .map((item, index) => ({ ...item, order: index }))
          .sort((a, b) => a.order - b.order);
      };

      if (isGlobal) {
        setPost((currentPost) => {
          const updatedContent = reorder(currentPost.content);
          if (updatedContent.length === currentPost.content.length) {
            return currentPost;
          }
          return { ...currentPost, content: updatedContent };
        });
      } else {
        setPost((currentPost) => ({
          ...currentPost,
          alternativeContent: currentPost.alternativeContent.map((item) => {
            if (item.socialProvider.socialId !== socialId) {
              return item;
            }
            const updatedContent = reorder(item.content);
            if (updatedContent.length === item.content.length) {
              return item;
            }
            return { ...item, content: updatedContent };
          }),
        }));
      }
    },
    [isGlobal, setPost, socialId]
  );

  const handleThumbnailUpdate = useCallback(
    (
      order: number,
      thumbnail: {
        thumbnailBucketUrl?: string;
        thumbnailBucketKey?: string;
        thumbnailMediaId?: string;
        thumbnailTimestamp?: number;
      }
    ) => {
      const isCustomImage = !!thumbnail.thumbnailMediaId;
      const thumbnailFields = isCustomImage
        ? {
            thumbnailBucketUrl: thumbnail.thumbnailBucketUrl,
            thumbnailBucketKey: thumbnail.thumbnailBucketKey,
            thumbnailMediaId: thumbnail.thumbnailMediaId,
            thumbnailTimestamp: undefined,
          }
        : {
            thumbnailBucketUrl: undefined,
            thumbnailBucketKey: undefined,
            thumbnailMediaId: undefined,
            thumbnailTimestamp: thumbnail.thumbnailTimestamp,
          };

      const applyThumbnail = <T extends { mediaType: string }>(media: T[]) =>
        media.map((m) =>
          m.mediaType === "VIDEO" ? { ...m, ...thumbnailFields } : m
        );

      if (isGlobal) {
        setPost((currentPost) => ({
          ...currentPost,
          content: currentPost.content.map((item) =>
            item.order === order
              ? { ...item, media: applyThumbnail(item.media) }
              : item
          ),
        }));
      } else {
        setPost((currentPost) => ({
          ...currentPost,
          alternativeContent: currentPost.alternativeContent.map((item) =>
            item.socialProvider.socialId === socialId
              ? {
                  ...item,
                  content: item.content.map((contentItem) =>
                    contentItem.order === order
                      ? {
                          ...contentItem,
                          media: applyThumbnail(contentItem.media),
                        }
                      : contentItem
                  ),
                }
              : item
          ),
        }));
      }
    },
    [isGlobal, setPost, socialId]
  );

  const handleRemoveVideo = useCallback(
    (order: number) => {
      if (isGlobal) {
        setPost((currentPost) => ({
          ...currentPost,
          content: currentPost.content.map((item) =>
            item.order === order ? { ...item, media: [] } : item
          ),
        }));
      } else {
        setPost((currentPost) => ({
          ...currentPost,
          alternativeContent: currentPost.alternativeContent.map((item) =>
            item.socialProvider.socialId === socialId
              ? {
                  ...item,
                  content: item.content.map((contentItem) =>
                    contentItem.order === order
                      ? { ...contentItem, media: [] }
                      : contentItem
                  ),
                }
              : item
          ),
        }));
      }
    },
    [isGlobal, setPost, socialId]
  );

  // Freeze layout during upload to prevent destroying MediaUploader state
  const frozenLayoutRef = useRef<boolean | null>(null);

  const shouldShowVideoLayout = (() => {
    const firstMedia = content[0]?.media[0];
    const hasVideoInContent = firstMedia?.mediaType === "VIDEO";
    const hasReadyVideoInContent =
      hasVideoInContent && !!(firstMedia.bucketKey || firstMedia.url);

    // Compute what the layout WOULD be based on platform type or uploaded video
    const computedLayout = (() => {
      if (hasReadyVideoInContent) {
        return true;
      }
      if (isGlobal) {
        return shouldDefaultUseVideoLayout(platformsInDefault);
      }
      if (
        socialType === SocialTypes.TIKTOK ||
        socialType === SocialTypes.YOUTUBE
      ) {
        return true;
      }
      return false;
    })();

    // While uploading, freeze layout to whatever it was when upload started
    if (isMediaUploading) {
      if (frozenLayoutRef.current === null) {
        frozenLayoutRef.current = computedLayout;
      }
      logVideoUploadLayout("layout decision", {
        socialId,
        socialType,
        platformsInDefault,
        isMediaUploading,
        hasVideoInContent,
        hasReadyVideoInContent,
        detectedVideo: firstMedia,
        computedLayout,
        frozenLayout: frozenLayoutRef.current,
        finalLayout: frozenLayoutRef.current,
      });
      return frozenLayoutRef.current;
    }

    // Not uploading — clear freeze and use computed value
    frozenLayoutRef.current = null;
    logVideoUploadLayout("layout decision", {
      socialId,
      socialType,
      platformsInDefault,
      isMediaUploading,
      hasVideoInContent,
      hasReadyVideoInContent,
      detectedVideo: firstMedia,
      computedLayout,
      frozenLayout: frozenLayoutRef.current,
      finalLayout: computedLayout,
    });
    return computedLayout;
  })();

  if (shouldShowVideoLayout) {
    // Get video media if it exists, or undefined if not uploaded yet
    const videoMedia =
      content.length > 0 &&
      content[0].media.length > 0 &&
      content[0].media[0].mediaType === "VIDEO" &&
      (content[0].media[0].bucketKey || content[0].media[0].url)
        ? content[0].media[0]
        : undefined;

    logVideoUploadLayout("video layout render", {
      socialId,
      socialType,
      effectiveSocialType,
      platformsInDefault,
      videoMedia,
    });

    // Check if we should show YouTube title field
    const showYouTubeTitle = isGlobal
      ? shouldShowYouTubeTitle(platformsInDefault)
      : socialType === SocialTypes.YOUTUBE;

    return (
      <VideoContentLayout
        onRemoveVideo={() => handleRemoveVideo(0)}
        onTextChange={(text) => handleTextChange(text, 0)}
        onThumbnailUpdate={(thumbnail) => handleThumbnailUpdate(0, thumbnail)}
        onTitleChange={
          showYouTubeTitle
            ? (title) => {
                if (isGlobal) {
                  setPost((currentPost) => ({
                    ...currentPost,
                    content: currentPost.content.map((item) =>
                      item.order === 0 ? { ...item, title } : item
                    ),
                  }));
                } else {
                  setPost((currentPost) => ({
                    ...currentPost,
                    alternativeContent: currentPost.alternativeContent.map(
                      (item) =>
                        item.socialProvider.socialId === socialId
                          ? {
                              ...item,
                              content: item.content.map((contentItem) =>
                                contentItem.order === 0
                                  ? { ...contentItem, title }
                                  : contentItem
                              ),
                            }
                          : item
                    ),
                  }));
                }
              }
            : undefined
        }
        orderId={0}
        platformsInDefault={platformsInDefault}
        showYouTubeTitle={showYouTubeTitle}
        socialId={socialId}
        socialType={effectiveSocialType}
        text={content[0]?.text || ""}
        title={content[0]?.title}
        videoMedia={
          videoMedia as
            | {
                mediaType: "VIDEO";
                url?: string;
                bucketUrl?: string;
                bucketKey?: string;
                altText?: string;
                thumbnailBucketUrl?: string;
                thumbnailBucketKey?: string;
                thumbnailMediaId?: string;
                thumbnailTimestamp?: number;
              }
            | undefined
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[780px]">
      <div>
        {content.map((item, index) => (
          <div
            className={cn(
              "min-w-0",
              index > 0 && "pt-4",
              index < content.length - 1 && "border-border/60 border-b pb-3"
            )}
            key={item.order}
          >
            <div className="px-1 pt-2 sm:px-2">
              <div className="relative">
                <label
                  className="sr-only"
                  htmlFor={`post-content-${socialId}-${item.order}`}
                >
                  {content.length > 1
                    ? `Post ${item.order + 1}`
                    : "Post content"}
                </label>
                <Textarea
                  className={cn(
                    "resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 pt-0 pb-6 text-[17px] leading-7 shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 md:text-[17px]",
                    content.length === 1
                      ? "min-h-[clamp(190px,30vh,300px)]"
                      : "min-h-28"
                  )}
                  id={`post-content-${socialId}-${item.order}`}
                  onChange={(e) => handleTextChange(e.target.value, item.order)}
                  placeholder={
                    isGlobal
                      ? getDefaultPlaceholder(platformsInDefault)
                      : socialType === SocialTypes.TWITTER
                        ? "What's happening?"
                        : socialType === SocialTypes.THREADS
                          ? "What's on your mind?"
                          : "Write your post…"
                  }
                  value={item.text}
                />

                {characterLimit && (
                  <div
                    className={cn(
                      "absolute right-0 bottom-3 font-medium text-xs tabular-nums",
                      characterLimit - item.text.length < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {characterLimit - item.text.length}
                  </div>
                )}
              </div>
            </div>
            <MediaUploader
              compact
              leadingActions={
                usesMultiPostLayout || content.length > 1 ? (
                  <>
                    {usesMultiPostLayout && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label="Add another post to thread"
                            className="size-9 rounded-md text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:size-11"
                            onClick={() => addThreadPost(item.order)}
                            size="icon"
                            variant="ghost"
                          >
                            <Icon icon={Add01Icon} size={15} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>
                          Add to thread
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {content.length > 1 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={`Remove post ${item.order + 1}`}
                            className="size-9 rounded-md text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:size-11"
                            onClick={() => removeThreadPost(item.order)}
                            size="icon"
                            variant="ghost"
                          >
                            <Icon icon={Remove01Icon} size={15} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>
                          Remove this post
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </>
                ) : undefined
              }
              orderId={item.order}
              socialId={socialId}
              socialType={effectiveSocialType}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
