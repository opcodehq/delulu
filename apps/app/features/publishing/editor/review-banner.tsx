"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Card, CardContent } from "@delulu/design-system/components/ui/card";
import { cn } from "@delulu/design-system/lib/utils";
import { ReviewActions } from "@/features/publishing/posts/review-actions";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";

interface ReviewBannerProps {
  postId: string;
  reviewStatus: string;
  organizationId?: string;
}

export function ReviewBanner({
  postId,
  reviewStatus,
  organizationId,
}: ReviewBannerProps) {
  const { canApprove } = usePermissions();
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const review = useResourceAtom({
    ...resources.reviews.forPost(workspaceId ?? "", postId),
    enabled: Boolean(organizationId && workspaceId),
    staleTime: 15_000,
    retry: 2,
  });

  if (!organizationId) {
    return null;
  }

  const status = review.data?.status ?? reviewStatus.toLowerCase();
  const isPending = status === "pending";
  const isRejected = status === "rejected";
  const isApproved = status === "approved";

  if (!(isPending || isRejected || isApproved)) {
    return null;
  }

  return (
    <Card
      className={cn(
        "p-2 transition-colors",
        isPending && "border-amber-300 dark:border-amber-700",
        isRejected && "border-red-300 dark:border-red-700",
        isApproved && "border-green-300 dark:border-green-700"
      )}
    >
      <CardContent className="p-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isPending && <Badge variant="amber">Pending Review</Badge>}
              {isRejected && <Badge variant="destructive">Declined</Badge>}
              {isApproved && <Badge variant="green">Approved</Badge>}

              {review.data?.resolvedByMemberId &&
                (isApproved || isRejected) && (
                  <span className="text-muted-foreground text-xs">
                    by {review.data.resolvedByMemberId.slice(0, 8)}
                    {review.data.resolvedAt &&
                      ` on ${new Date(review.data.resolvedAt).toLocaleDateString()}`}
                  </span>
                )}
            </div>

            {isRejected && (
              <p className="text-sm">
                <span className="font-medium text-red-600 dark:text-red-400">
                  Reason:
                </span>{" "}
                Open the activity timeline to see the reviewer&apos;s feedback.
              </p>
            )}

            {isApproved && (
              <p className="text-muted-foreground text-xs">
                This post is approved. You can now publish or schedule it.
              </p>
            )}
          </div>

          {isPending && canApprove && <ReviewActions postId={postId} />}
        </div>
      </CardContent>
    </Card>
  );
}
