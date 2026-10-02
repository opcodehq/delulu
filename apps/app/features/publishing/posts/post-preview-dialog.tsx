"use client";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import {
  type SupportedSocialPlatform,
  socialBackgroundColors,
  socialDisplayNames,
} from "@delulu/design-system/lib/social-config";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AlertCircleIcon,
  Calendar01Icon,
  File02Icon,
  Link01Icon,
} from "@delulu/icons";
import Image from "next/image";
import React from "react";
import { ReviewActions } from "@/features/publishing/posts/review-actions";
import { type Post, statusColors } from "@/features/publishing/posts/types";
import { useMediaUrl } from "@/features/publishing/use-media-url";

interface PostPreviewDialogProps {
  post: Post;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showReviewActions?: boolean;
}

export function PostPreviewDialog({
  post,
  open,
  onOpenChange,
  showReviewActions = false,
}: PostPreviewDialogProps) {
  const [imageError, setImageError] = React.useState(false);
  const [imageLoading, setImageLoading] = React.useState(true);

  const firstContent = post.content[0];
  const firstMedia = firstContent?.media?.[0];
  const firstMediaUrl = useMediaUrl(firstMedia?.bucketKey, firstMedia?.url);

  // Reset states when dialog opens/closes or post changes
  React.useEffect(() => {
    if (open) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [open]);

  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Post Preview</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto">
          {/* Status and Schedule */}
          <div className="flex items-center justify-between">
            <Badge variant={statusColors[post.status]}>{post.status}</Badge>
            {post.scheduledAt && (
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Icon className="" icon={Calendar01Icon} size={16} />
                {new Date(post.scheduledAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Media */}
          {firstMedia && (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
              {imageLoading && firstMedia.mediaType === "IMAGE" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
              {firstMedia.mediaType === "IMAGE" ? (
                imageError ? (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <div className="text-center text-muted-foreground">
                      <div className="mx-auto mb-2 h-12 w-12 rounded bg-muted-foreground/20" />
                      <p className="text-sm">Image failed to load</p>
                      <p className="text-xs opacity-70">
                        Check console for details
                      </p>
                    </div>
                  </div>
                ) : (
                  <Image
                    alt={firstMedia.altText || "Post media"}
                    className={`object-cover transition-opacity duration-300 ${
                      imageLoading ? "opacity-0" : "opacity-100"
                    }`}
                    fill
                    onError={() => {
                      setImageError(true);
                      setImageLoading(false);
                      if (process.env.NODE_ENV === "development") {
                        console.error(
                          `[DEBUG] Failed to load image in preview: ${firstMediaUrl}`
                        );
                      }
                    }}
                    onLoad={() => setImageLoading(false)}
                    src={firstMediaUrl}
                  />
                )
              ) : firstMedia.mediaType === "DOCUMENT" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted">
                  <Icon
                    className="text-muted-foreground"
                    icon={File02Icon}
                    size={32}
                  />
                  <span className="text-muted-foreground text-sm">
                    Document
                  </span>
                </div>
              ) : (
                <video
                  aria-label="Post video content"
                  className="h-full w-full object-cover"
                  controls
                  onError={() => {
                    if (process.env.NODE_ENV === "development") {
                      console.error(
                        `[DEBUG] Failed to load video in preview: ${firstMediaUrl}`
                      );
                    }
                  }}
                  playsInline
                  src={firstMediaUrl}
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
          )}

          {/* Content */}
          <p className="whitespace-pre-wrap text-base">{firstContent?.text}</p>

          {/* Social Providers */}
          <div className="space-y-3">
            <h3 className="font-medium">Publishing to:</h3>
            <div className="grid gap-3">
              {post.socialProviders?.map((provider) => {
                const socialType = provider.socialType;
                // Skip unsupported platforms
                if (!Object.keys(socialDisplayNames).includes(socialType)) {
                  return null;
                }

                const platformPost = post.platformPosts?.find(
                  (pp) => pp.socialProviderId === provider._id
                );
                const platformPostUrl = platformPost?.platformPostUrl;
                const failureReason = platformPost?.failureReason;

                return (
                  <div
                    className="flex items-center justify-between rounded-lg border p-3"
                    key={provider._id}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            socialBackgroundColors[
                              socialType as SupportedSocialPlatform
                            ]
                          } shadow-sm`}
                        >
                          <SocialIcon
                            className="text-white"
                            size="md"
                            type={socialType as SupportedSocialPlatform}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {provider.username ||
                              socialDisplayNames[
                                socialType as SupportedSocialPlatform
                              ]}
                          </span>
                          {!provider.isActive && (
                            <Badge className="text-xs" variant="secondary">
                              Disconnected
                            </Badge>
                          )}
                          {failureReason && (
                            <Badge className="text-xs" variant="destructive">
                              Failed
                            </Badge>
                          )}
                        </div>
                        {failureReason && (
                          <div className="flex items-start gap-2 text-destructive text-sm">
                            <Icon
                              className="mt-0.5 flex-shrink-0"
                              icon={AlertCircleIcon}
                              size={12}
                            />
                            <span className="text-xs">{failureReason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {provider.isActive && platformPostUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a
                            className="flex items-center gap-1"
                            href={platformPostUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Icon className="" icon={Link01Icon} size={12} />
                            View Post
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* General Post Failure Reason */}
            {post.postFailureReason && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <Icon
                    className="mt-0.5 flex-shrink-0 text-destructive"
                    icon={AlertCircleIcon}
                    size={16}
                  />
                  <div>
                    <p className="font-medium text-destructive text-sm">
                      Post Failed
                    </p>
                    <p className="text-destructive/80 text-sm">
                      {post.postFailureReason}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Review Actions */}
            {showReviewActions &&
              post.reviewStatus === "PENDING" &&
              post.organizationId && (
                <div className="flex justify-end border-t pt-4">
                  <ReviewActions
                    onReviewed={() => onOpenChange(false)}
                    postId={post._id}
                  />
                </div>
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
