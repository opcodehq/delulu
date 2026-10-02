"use client";

import { POST_DELETED, POST_PUBLISH_RETRIED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Card, CardContent } from "@delulu/design-system/components/ui/card";
import { toast } from "sonner";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useMutationAtom } from "@/shell/state/resources";
import type { Post, PostLayout } from "./types";

interface PostCardProps {
  post: Post;
  layout?: PostLayout;
}

export function PostCard({ post, layout = "grid" }: PostCardProps) {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const analytics = useAnalytics();
  const remove = useMutationAtom(resources.posts.remove(workspaceId ?? ""));
  const retry = useMutationAtom(
    resources.posts.retryTarget(workspaceId ?? "", post.id)
  );
  const text =
    post.content?.[0]?.text ??
    post.groups[0]?.segments[0]?.text ??
    "Untitled post";
  const scheduledAt = post.targets.find(
    (target) => target.scheduledAt
  )?.scheduledAt;

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(post.id);
      analytics.capture(POST_DELETED, {
        post_id: post.id,
        post_status: post.status,
      });
      toast.success("Post deleted");
    } catch (error) {
      toast.error("Failed to delete post", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  const handleRetry = async () => {
    try {
      const failed = post.targets.filter(
        (target) => target.status === "failed"
      );
      await Promise.all(failed.map((target) => retry.mutateAsync(target.id)));
      analytics.capture(POST_PUBLISH_RETRIED, { post_id: post.id });
      toast.success("Failed targets queued for retry");
    } catch (error) {
      toast.error("Retry failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  return (
    <Card className={layout === "list" ? "rounded-none" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">{post.status.replaceAll("_", " ")}</Badge>
          <span className="text-muted-foreground text-xs">
            {new Date(post.updatedAt).toLocaleString()}
          </span>
        </div>
        <p className="line-clamp-3 text-sm">{text}</p>
        {scheduledAt && (
          <p className="text-muted-foreground text-xs">
            Scheduled {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/post/${post.id}`}>Open</Link>
          </Button>
          {post.targets.some((target) => target.status === "failed") && (
            <Button
              disabled={retry.isPending}
              onClick={handleRetry}
              size="sm"
              variant="outline"
            >
              Retry
            </Button>
          )}
          <Button
            disabled={remove.isPending}
            onClick={handleDelete}
            size="sm"
            variant="destructive"
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
