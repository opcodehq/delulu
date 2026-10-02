"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowRight01Icon, TaskDone01Icon } from "@delulu/icons";
import { toast } from "sonner";
import { OperationsError } from "@/features/workspace/query-state";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";

export function PendingReviews() {
  const { canApprove, isPersonal } = usePermissions();
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const registry = useResourceRegistry();
  const workspaceId = workspace.workspaceId ?? "";
  const options = resources.reviews.queue(workspaceId, { limit: 4, offset: 0 });
  const query = useResourceAtom({
    suspense: false,
    ...options,
    queryKey: options.queryKey!,
    enabled: !!workspace.workspaceId && !isPersonal,
  });
  const bulkAction = useMutationAtom(resources.reviews.bulkAct(workspaceId));

  if (workspace.error || query.error) {
    return (
      <OperationsError
        error={(workspace.error ?? query.error)!}
        onRetry={async () => {
          await (workspace.error ? workspace.retry() : query.refetch());
        }}
      />
    );
  }

  if (isPersonal || query.isPending || !query.data?.data.length) {
    return null;
  }

  const review = async (postId: string, action: "approve" | "reject") => {
    try {
      await bulkAction.mutateAsync({
        postIds: [postId],
        action:
          action === "approve"
            ? { action: "approve" }
            : { action: "reject", reason: "Changes requested from dashboard" },
      });
      await registry.invalidateResources({ queryKey: options.queryKey! });
      toast.success(
        action === "approve" ? "Post approved" : "Changes requested"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="text-amber-500" icon={TaskDone01Icon} size={16} />
          <h3 className="font-medium text-sm">
            {canApprove ? "Pending Reviews" : "Your Submissions"}
          </h3>
          <Badge variant="amber">{query.data.total}</Badge>
        </div>
        <Link
          className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          href="/posts?status=REVIEW"
        >
          View all <Icon icon={ArrowRight01Icon} size={12} />
        </Link>
      </div>
      <div className="divide-y rounded-lg border">
        {query.data.data.slice(0, 3).map((item) => (
          <div className="flex items-center gap-3 px-3 py-2.5" key={item.id}>
            <Link className="min-w-0 flex-1" href={`/post/${item.postId}`}>
              <p className="truncate text-sm">Post {item.postId}</p>
              <p className="text-muted-foreground text-xs">Awaiting review</p>
            </Link>
            {canApprove && (
              <div className="flex gap-2">
                <Button
                  disabled={bulkAction.isPending}
                  onClick={async () => {
                    await review(item.postId, "approve");
                  }}
                  size="sm"
                >
                  Approve
                </Button>
                <Button
                  disabled={bulkAction.isPending}
                  onClick={async () => {
                    await review(item.postId, "reject");
                  }}
                  size="sm"
                  variant="outline"
                >
                  Request changes
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
