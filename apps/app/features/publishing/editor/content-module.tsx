"use client";

import { type SocialType, SocialTypes } from "@delulu/core/publishing/post";
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
import { useCallback, useMemo, useRef, useState } from "react";
import {
  customContentFor,
  foldThread,
} from "@/features/publishing/custom-content";
import { MediaUploader } from "@/features/publishing/editor/media-uploader";
import {
  TwitterArticleTitle,
  TwitterComposerBar,
  TwitterQuoteButton,
  TwitterQuoteCard,
  useTwitterComposer,
} from "@/features/publishing/editor/twitter-composer";
import { VideoContentLayout } from "@/features/publishing/editor/video-content-layout";
import {
  getDefaultCharacterLimit,
  getDefaultPlaceholder,
  getPlatformsInDefault,
  PLATFORM_CHARACTER_LIMITS,
  shouldDefaultUseVideoLayout,
  shouldShowYouTubeTitle,
  shouldUseMultiPostLayout,
} from "@/features/publishing/platform-rules";
import {
  useIsMediaUploading,
  useSelectedSocialProviders,
  useStore,
} from "@/features/publishing/store";

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
  /** Opens a channel's own editor, e.g. after X moves to its own Article. */
  onOpenChannel?: (socialId: string) => void;
}

export function ContentModule({
  socialId,
  socialType,
  onOpenChannel,
}: ContentModuleProps) {
  const { post, setPost } = useStore((state) => ({
    post: state.post,
    setPost: state.setPost,
  }));
  const selectedSocialProviders = useSelectedSocialProviders();
  const isMediaUploading = useIsMediaUploading();

  const isGlobal = socialType === SocialTypes.DEFAULT;
  const twitter = useTwitterComposer(socialId, isGlobal);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const showQuote =
    !twitter.isArticle &&
    twitter.providerIds.length > 0 &&
    (quoteOpen || Boolean(twitter.settings.quoteTweetId));

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
  const usesMultiPostLayout =
    !twitter.isArticle &&
    shouldUseMultiPostLayout(socialType, platformsInDefault);
  const characterLimit = isGlobal
    ? getDefaultCharacterLimit(
        twitter.isArticle
          ? getPlatformsInDefault(
              selectedSocialProviders.filter(
                (provider) => !twitter.providerIds.includes(provider.socialId)
              ),
              post.alternativeContent
            )
          : platformsInDefault
      )
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

  const changeTwitterFormat = (format: "post" | "article") => {
    if (format === "post") {
      twitter.update({ format: "post" });
      return;
    }
    twitter.update({
      format: "article",
      quoteTweetId: "",
      replyRestriction: "everyone",
    });
    setQuoteOpen(false);
    // An Article has one body, so fold an existing thread into it.
    if (!isGlobal) {
      setPost((currentPost) => ({
        ...currentPost,
        alternativeContent: currentPost.alternativeContent.map((item) =>
          item.socialProvider.socialId === socialId
            ? { ...item, content: foldThread(item.content) }
            : item
        ),
      }));
      return;
    }
    const sharedWithOthers = platformsInDefault.some(
      (platform) => platform !== SocialTypes.TWITTER
    );
    if (!(sharedWithOthers && content.length > 1)) {
      setPost((currentPost) => ({
        ...currentPost,
        content: foldThread(currentPost.content),
      }));
      return;
    }
    // Other channels still publish the shared thread, so each X account gets
    // its own copy to fold, and the editor opens the first one.
    const xProviders = selectedSocialProviders.filter((provider) =>
      twitter.providerIds.includes(provider.socialId)
    );
    setPost((currentPost) => ({
      ...currentPost,
      alternativeContent: [
        ...currentPost.alternativeContent,
        ...xProviders.map((provider) => {
          const custom = customContentFor(provider, currentPost.content);
          return { ...custom, content: foldThread(custom.content) };
        }),
      ],
    }));
    if (xProviders[0]) {
      onOpenChannel?.(xProviders[0].socialId);
    }
  };
  const hasTwitter = twitter.providerIds.length > 0;
  const quoteButton =
    hasTwitter && !twitter.isArticle && !showQuote ? (
      <TwitterQuoteButton onClick={() => setQuoteOpen(true)} />
    ) : null;
  const quoteCard = showQuote ? (
    <TwitterQuoteCard
      inputId={`twitter-quote-${socialId}`}
      onRemove={() => {
        twitter.update({ quoteTweetId: "" });
        setQuoteOpen(false);
      }}
      twitter={twitter}
    />
  ) : null;
  const articleTitle = twitter.isArticle ? (
    <TwitterArticleTitle
      inputId={`twitter-article-title-${socialId}`}
      twitter={twitter}
    />
  ) : null;
  // When only X accounts publish this content, an Article owns the layout and
  // shows media as its cover. Shared content keeps the other platforms' layout.
  const articleOwnsLayout =
    twitter.isArticle &&
    (!isGlobal ||
      platformsInDefault.every((platform) => platform === SocialTypes.TWITTER));

  // Freeze layout during upload to prevent destroying MediaUploader state
  const frozenLayoutRef = useRef<boolean | null>(null);

  const shouldShowVideoLayout = (() => {
    const firstMedia = content[0]?.media[0];
    const hasVideoInContent = firstMedia?.mediaType === "VIDEO";
    const hasReadyVideoInContent =
      hasVideoInContent && !!(firstMedia.bucketKey || firstMedia.url);

    // Compute what the layout WOULD be based on platform type or uploaded video
    const computedLayout = (() => {
      if (articleOwnsLayout) {
        return false;
      }
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

    const videoLayout = (
      <VideoContentLayout
        characterLimit={characterLimit}
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
    return hasTwitter ? (
      <>
        <div className="mx-auto w-full max-w-[780px]">
          <TwitterComposerBar
            actions={quoteButton}
            onFormatChange={changeTwitterFormat}
            twitter={twitter}
          />
          {articleTitle && <div className="px-1 sm:px-2">{articleTitle}</div>}
          {quoteCard}
        </div>
        {videoLayout}
      </>
    ) : (
      videoLayout
    );
  }

  return (
    <div className="mx-auto w-full max-w-[780px]">
      {hasTwitter && (
        <TwitterComposerBar
          onFormatChange={changeTwitterFormat}
          twitter={twitter}
        />
      )}
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
              {twitter.isArticle && index === 0 && (
                <>
                  <div className="mb-4">
                    <MediaUploader
                      orderId={item.order}
                      socialId={socialId}
                      socialType={effectiveSocialType}
                      variant="cover"
                    />
                  </div>
                  {articleTitle}
                </>
              )}
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
                    "resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 pt-0 pb-6 text-[17px] leading-7 shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 md:text-[17px] dark:bg-transparent",
                    content.length === 1
                      ? "min-h-[clamp(190px,30vh,300px)]"
                      : "min-h-28"
                  )}
                  id={`post-content-${socialId}-${item.order}`}
                  onChange={(e) => handleTextChange(e.target.value, item.order)}
                  placeholder={
                    twitter.isArticle
                      ? "Start writing…"
                      : isGlobal
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
                  <output
                    aria-label="Characters used"
                    className={cn(
                      "absolute right-0 bottom-3 font-medium text-xs tabular-nums",
                      characterLimit - item.text.length < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {item.text.length.toLocaleString()} /{" "}
                    {characterLimit.toLocaleString()}
                  </output>
                )}
              </div>
            </div>
            {index === 0 && quoteCard}
            {!twitter.isArticle && (
              <MediaUploader
                extraActions={
                  usesMultiPostLayout ||
                  content.length > 1 ||
                  (index === 0 && quoteButton) ? (
                    <>
                      {index === 0 && quoteButton}
                      {usesMultiPostLayout && (
                        <Button
                          aria-label="Add another post to thread"
                          className="text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11"
                          onClick={() => addThreadPost(item.order)}
                          variant="ghost"
                        >
                          <Icon icon={Add01Icon} size={15} />
                          <span className="hidden sm:inline">
                            Add to thread
                          </span>
                        </Button>
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
