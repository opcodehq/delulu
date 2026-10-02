"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { Alert01Icon, PencilEdit02Icon, RefreshIcon } from "@delulu/icons";
import { toast } from "sonner";
import { OperationsError } from "@/features/workspace/query-state";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";

export function FailedPostsAlert() {
  const router = useRouter();
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const registry = useResourceRegistry();
  const workspaceId = workspace.workspaceId ?? "";
  // "Needs attention" = every post that failed to publish on at least one
  // target: fully failed and partially failed alike. The count and the rows
  // below both come from this one filtered query, so the headline number always
  // matches the posts shown (and never reflects the workspace's total posts).
  const options = resources.posts.list(workspaceId, {
    limit: 4,
    offset: 0,
    status: "failed,partially_failed",
  });
  const query = useResourceAtom({
    suspense: false,
    ...options,
    queryKey: options.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const failedPosts = query.data?.data ?? [];

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

  if (!failedPosts.length) {
    return null;
  }

  const total = query.data?.total ?? failedPosts.length;

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Icon className="text-destructive/80" icon={Alert01Icon} size={16} />
        <p className="font-medium text-sm">
          {total} post{total === 1 ? "" : "s"} failed to publish
        </p>
        <Button
          asChild
          className="ml-auto text-muted-foreground"
          size="sm"
          variant="ghost"
        >
          <Link href="/posts?status=failed">View all</Link>
        </Button>
      </div>
      <div className="divide-y divide-border/60 border-t">
        {failedPosts.slice(0, 3).map((post) => (
          <FailedPostRow
            key={post.id}
            onEdit={() => router.push(`/post/${post.id}`)}
            onRetried={() =>
              registry.invalidateResources({ queryKey: options.queryKey! })
            }
            post={post}
            resources={resources}
            workspaceId={workspaceId}
          />
        ))}
      </div>
    </Card>
  );
}

function FailedPostRow({
  post,
  resources,
  workspaceId,
  onEdit,
  onRetried,
}: {
  post: {
    readonly id: string;
    readonly groups: readonly {
      readonly segments: readonly { readonly text: string }[];
    }[];
    readonly targets: readonly {
      readonly id: string;
      readonly status: "pending" | "publishing" | "published" | "failed";
      readonly error: string | null;
    }[];
  };
  resources: ReturnType<typeof useApiClient>["resources"];
  workspaceId: string;
  onEdit: () => void;
  onRetried: () => Promise<unknown>;
}) {
  const failedTarget = post.targets.find(
    (target) => target.status === "failed"
  );
  const retry = useMutationAtom(
    resources.posts.retryTarget(workspaceId, post.id)
  );
  const excerpt = post.groups[0]?.segments[0]?.text || "Untitled post";
  const error = failedTarget?.error || "Publishing failed";
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight">{excerpt}</p>
        <p
          className="truncate text-muted-foreground text-xs leading-tight"
          title={error}
        >
          {error}
        </p>
      </div>
      <Button
        aria-label="Edit post"
        className="text-muted-foreground"
        onClick={onEdit}
        size="icon-sm"
        style={{ minHeight: 44, minWidth: 44 }}
        variant="ghost"
      >
        <Icon icon={PencilEdit02Icon} size={15} />
      </Button>
      <Button
        aria-busy={retry.isPending}
        className="text-muted-foreground"
        disabled={!failedTarget || retry.isPending}
        onClick={async () => {
          if (!failedTarget) {
            return;
          }
          try {
            await retry.mutateAsync(failedTarget.id);
            await onRetried();
            toast.success("Publish retry queued");
          } catch (error_) {
            toast.error(
              error_ instanceof Error ? error_.message : "Retry failed"
            );
          }
        }}
        size="sm"
        variant="ghost"
      >
        <Icon
          className={
            retry.isPending
              ? "animate-spin motion-reduce:animate-none"
              : undefined
          }
          icon={RefreshIcon}
          size={14}
        />
        {retry.isPending ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
