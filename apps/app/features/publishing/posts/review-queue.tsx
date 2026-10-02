"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { ReviewActions } from "@/features/publishing/posts/review-actions";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export function ReviewQueue() {
  const { workspaceId, isPending: isWorkspacePending } =
    useWorkspaceSelection();
  const { resources } = useApiClient();
  const reviews = useResourceAtom({
    suspense: false,
    ...resources.reviews.queue(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
    retry: 2,
  });

  if (isWorkspacePending || reviews.isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((item) => (
          <div
            className="h-20 animate-pulse rounded-lg border bg-muted/30"
            key={item}
          />
        ))}
      </div>
    );
  }
  if (reviews.isError || !workspaceId) {
    return (
      <div className="rounded-lg border border-destructive/40 p-4 text-destructive text-sm">
        {reviews.error?.message ?? "Select a workspace to review posts."}
        <Button
          className="ml-3"
          onClick={() => reviews.refetch()}
          size="sm"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!reviews.data || reviews.data.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <p className="font-medium text-sm">All caught up</p>
        <p className="text-muted-foreground text-xs">No posts pending review</p>
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {reviews.data.data.map((review) => (
        <div className="flex items-center gap-4 px-4 py-3" key={review.id}>
          <Link className="min-w-0 flex-1" href={`/post/${review.postId}`}>
            <p className="truncate font-medium text-sm">
              Post {review.postId.slice(0, 8)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary">{review.status}</Badge>
              <span className="text-muted-foreground text-xs">
                Submitted by {review.submittedByMemberId.slice(0, 8)}
              </span>
            </div>
          </Link>
          <ReviewActions compact postId={review.postId} />
        </div>
      ))}
    </div>
  );
}
