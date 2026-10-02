"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import { Input } from "@delulu/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Add01Icon,
  Calendar01Icon,
  CancelCircleIcon,
  DocumentAttachmentIcon,
  Loading03Icon,
  TaskDone01Icon,
  TickDouble01Icon,
} from "@delulu/icons";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { PostRow } from "@/features/publishing/posts/post-row";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { PageShell } from "@/shell/navigation/page-shell";

const PostViewPreviewDialog = lazy(() =>
  import("@/features/publishing/posts/post-view-preview-dialog").then(
    (module) => ({ default: module.PostViewPreviewDialog })
  )
);

import { ReviewQueue } from "@/features/publishing/posts/review-queue";
import type { ConnectionView, PostView } from "@/shared/workspace-views";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";

const statuses = [
  { value: "draft", label: "Draft", icon: DocumentAttachmentIcon },
  { value: "scheduled", label: "Scheduled", icon: Calendar01Icon },
  { value: "publishing", label: "Processing", icon: Loading03Icon },
  { value: "published", label: "Published", icon: TickDouble01Icon },
  { value: "failed", label: "Failed", icon: CancelCircleIcon },
  { value: "pending_review", label: "Awaiting review", icon: TaskDone01Icon },
  {
    value: "changes_requested",
    label: "Changes requested",
    icon: DocumentAttachmentIcon,
  },
  {
    value: "partially_failed",
    label: "Partially failed",
    icon: CancelCircleIcon,
  },
  { value: "review", label: "Review queue", icon: TaskDone01Icon },
] as const;

type StatusFilter = (typeof statuses)[number]["value"];

export default function PostsClient() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [previewPost, setPreviewPost] = useState<PostView | null>(null);
  const [statusFilter, setStatusFilter] = useQueryState(
    "status",
    parseAsStringLiteral(statuses.map(({ value }) => value)).withDefault(
      "draft"
    )
  );
  const { canApprove, isPersonal, canCreate } = usePermissions();
  const {
    workspaceId,
    isPending: isWorkspacePending,
    error: workspaceError,
  } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const showReviewTab = canApprove && !isPersonal;

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearchTerm(searchTerm.trim()),
      300
    );
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const posts = useResourceAtom({
    suspense: false,
    ...resources.posts.list(workspaceId ?? "", {
      limit: 100,
      status: statusFilter === "review" ? undefined : statusFilter,
    }),
    enabled: Boolean(workspaceId) && statusFilter !== "review",
    staleTime: 30_000,
    refetchInterval: statusFilter === "publishing" ? 5000 : false,
    retry: 2,
  });
  const reviewQueue = useResourceAtom({
    suspense: false,
    ...resources.reviews.queue(workspaceId ?? "", { limit: 1 }),
    enabled: Boolean(workspaceId) && showReviewTab,
    staleTime: 15_000,
    retry: 2,
  });
  const connectionsQuery = useResourceAtom({
    suspense: false,
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });

  const connectionsMap = useMemo(() => {
    const map = new Map<string, ConnectionView>();
    for (const connection of connectionsQuery.data?.data ?? []) {
      map.set(connection.id, connection);
    }
    return map;
  }, [connectionsQuery.data]);

  const filteredPosts = (posts.data?.data ?? []).filter((post) => {
    if (!debouncedSearchTerm) {
      return true;
    }
    const haystack = post.groups
      .flatMap((group) => group.segments.map((segment) => segment.text))
      .join(" ")
      .toLowerCase();
    return haystack.includes(debouncedSearchTerm.toLowerCase());
  });
  const error = workspaceError ?? (posts.data ? null : posts.error);
  const isLoading =
    isWorkspacePending || (statusFilter !== "review" && posts.isPending);

  const addPostAction = canCreate ? (
    <Button asChild size="sm">
      <Link href="/post">
        <Icon icon={Add01Icon} size={16} />
        Add Post
      </Link>
    </Button>
  ) : null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        value={statusFilter}
      >
        <SelectTrigger className="w-48" size="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statuses
            .filter(({ value }) => value !== "review" || showReviewTab)
            .map(({ value, label, icon }) => (
              <SelectItem key={value} value={value}>
                <Icon icon={icon} size={16} />
                <span>{label}</span>
                {value === "review" && (reviewQueue.data?.total ?? 0) > 0 && (
                  <Badge variant="secondary">{reviewQueue.data?.total}</Badge>
                )}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {statusFilter !== "review" && (
        <Input
          className="max-w-xs flex-1"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search posts..."
          value={searchTerm}
        />
      )}
      {posts.isFetching && !posts.isPending && (
        <span className="text-muted-foreground text-xs">Refreshing…</span>
      )}
    </div>
  );

  return (
    <PageShell
      actions={addPostAction}
      description="Manage drafts, scheduled, and published posts."
      page="Posts"
      pages={["Content"]}
    >
      {!workspaceId || error ? (
        <Card className="p-4">
          <h3 className="font-semibold">Unable to load this workspace</h3>
          <p className="text-muted-foreground text-sm">
            {error?.message ?? "Select a workspace and try again."}
          </p>
          <Button
            className="mt-3 w-fit"
            onClick={() => posts.refetch()}
            variant="outline"
          >
            Retry
          </Button>
        </Card>
      ) : (
        <>
          {toolbar}
          {statusFilter === "review" ? (
            <ReviewQueue />
          ) : isLoading ? (
            <Card className="divide-y divide-border/60 p-0">
              {[1, 2, 3, 4, 5].map((item) => (
                <div className="flex items-center gap-3 px-4 py-3" key={item}>
                  <div className="size-6 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </Card>
          ) : filteredPosts.length === 0 ? (
            <Card className="items-center justify-center gap-2 py-16 text-center">
              <p className="text-muted-foreground text-sm">No posts found.</p>
              {addPostAction}
            </Card>
          ) : (
            <Card className="divide-y divide-border/60 p-0">
              {filteredPosts.map((post) => (
                <PostRow
                  connections={connectionsMap}
                  key={post.id}
                  onPreview={() => setPreviewPost(post)}
                  post={post}
                />
              ))}
            </Card>
          )}
        </>
      )}

      {previewPost && (
        <Suspense fallback={null}>
          <PostViewPreviewDialog
            connections={connectionsMap}
            onOpenChange={(open) => !open && setPreviewPost(null)}
            open={previewPost !== null}
            post={previewPost}
          />
        </Suspense>
      )}
    </PageShell>
  );
}
