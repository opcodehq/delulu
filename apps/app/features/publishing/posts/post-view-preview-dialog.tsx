"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import { socialBackgroundColors } from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { LinkSquare02Icon } from "@delulu/icons";
import {
  normalizePlatform,
  platformLabel,
} from "@/features/publishing/social-platform";
import { useMediaUrl } from "@/features/publishing/use-media-url";
import type {
  ConnectionView,
  PostView,
  TargetView,
} from "@/shared/workspace-views";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";
import { PostActionsMenu } from "./post-actions-menu";
import {
  getPostExcerpt,
  getPostFirstMediaId,
  getPostScheduledAt,
  relativeTime,
} from "./post-helpers";
import { PostStatusBadge } from "./post-status-badge";

const targetStatusVariant = {
  pending: "zinc",
  publishing: "amber",
  published: "green",
  failed: "red",
} as const;

function MediaPreview({ mediaId }: { mediaId: string }) {
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const media = useResourceAtom({
    suspense: false,
    ...resources.media.get(workspaceId ?? "", mediaId),
    enabled: Boolean(workspaceId),
  });
  const url = useMediaUrl(media.data?.bucketKey, media.data?.url);

  if (media.isPending) {
    return <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />;
  }
  if (media.isError || !url) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg bg-muted">
      {media.data?.mediaType === "video" ? (
        // biome-ignore lint/a11y/useMediaCaption: user-generated social media
        <video className="max-h-72 w-full object-contain" controls src={url} />
      ) : (
        <img
          alt={media.data?.altText ?? "Post media"}
          className="max-h-72 w-full object-contain"
          src={url}
        />
      )}
    </div>
  );
}

function TargetRow({
  target,
  connection,
}: {
  target: TargetView;
  connection?: ConnectionView;
}) {
  const platform = normalizePlatform(connection?.platform);
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          platform ? socialBackgroundColors[platform] : "bg-muted"
        )}
      >
        {platform && (
          <SocialIcon className="size-4 text-white" type={platform} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">
          {platformLabel(platform, connection?.username)}
        </p>
        {target.error && (
          <p className="truncate text-red-600 text-xs dark:text-red-400">
            {target.error}
          </p>
        )}
      </div>
      {target.platformPostUrl && (
        <Button asChild size="sm" variant="ghost">
          <Link href={target.platformPostUrl} target="_blank">
            <Icon icon={LinkSquare02Icon} size={14} />
            View
          </Link>
        </Button>
      )}
      <Badge variant={targetStatusVariant[target.status]}>
        {target.status}
      </Badge>
    </div>
  );
}

interface PostViewPreviewDialogProps {
  post: PostView | null;
  connections: Map<string, ConnectionView>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostViewPreviewDialog({
  post,
  connections,
  open,
  onOpenChange,
}: PostViewPreviewDialogProps) {
  if (!post) {
    return null;
  }

  const excerpt = getPostExcerpt(post);
  const mediaId = getPostFirstMediaId(post);
  const scheduledAt = getPostScheduledAt(post);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] gap-3 overflow-y-auto p-5 sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <PostStatusBadge status={post.status} />
            <span className="text-muted-foreground text-xs">
              {scheduledAt
                ? `Scheduled ${new Date(scheduledAt).toLocaleString()}`
                : `Updated ${relativeTime(post.updatedAt)}`}
            </span>
          </div>
          <DialogTitle className="sr-only">Post preview</DialogTitle>
        </DialogHeader>

        <p className="whitespace-pre-wrap text-sm">{excerpt}</p>

        {mediaId && <MediaPreview mediaId={mediaId} />}

        {post.targets.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-muted-foreground text-xs">
              Publishing to
            </p>
            <div className="divide-y divide-border/60">
              {post.targets.map((target) => (
                <TargetRow
                  connection={connections.get(target.connectionId)}
                  key={target.id}
                  target={target}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <PostActionsMenu align="start" post={post} />
          <Button asChild>
            <Link href={`/post/${post.id}`}>Edit post</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
