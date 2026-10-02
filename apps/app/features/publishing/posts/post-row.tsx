"use client";

import { SocialAvatarStack } from "@delulu/design-system/components/ui/social-avatar-stack";
import { Icon } from "@delulu/design-system/providers/icon";
import { DocumentAttachmentIcon } from "@delulu/icons";
import { PostActionsMenu } from "@/features/publishing/posts/post-actions-menu";
import {
  getPostAvatarItems,
  getPostExcerpt,
  getPostTimeLabel,
} from "@/features/publishing/posts/post-helpers";
import { PostStatusBadge } from "@/features/publishing/posts/post-status-badge";
import type { ConnectionView, PostView } from "@/shared/workspace-views";

interface PostRowProps {
  post: PostView;
  connections: Map<string, ConnectionView>;
  onPreview: () => void;
}

export function PostRow({ post, connections, onPreview }: PostRowProps) {
  const excerpt = getPostExcerpt(post);
  const avatarItems = getPostAvatarItems(post, connections);

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onPreview}
        type="button"
      >
        {avatarItems.length > 0 ? (
          <SocialAvatarStack items={avatarItems} size="md" />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon icon={DocumentAttachmentIcon} size={14} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{excerpt}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <PostStatusBadge size="sm" status={post.status} />
            <span className="truncate text-muted-foreground text-xs">
              {getPostTimeLabel(post)}
            </span>
          </div>
        </div>
      </button>
      <PostActionsMenu onPreview={onPreview} post={post} />
    </div>
  );
}
