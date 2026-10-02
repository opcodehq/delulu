"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add, ArrowRight01Icon, MailSend01Icon } from "@delulu/icons";
import { lazy, Suspense, useMemo, useState } from "react";
import { AppLink as Link } from "@/shell/navigation/app-link";

const DashboardChart = lazy(() =>
  import("./dashboard-chart").then((module) => ({
    default: module.DashboardChart,
  }))
);

import { DashboardStats } from "@/features/dashboard/dashboard-stats";
import { DmSummaryCard } from "@/features/dashboard/dm-summary-card";
import { FailedPostsAlert } from "@/features/dashboard/failed-posts-alert";
import { PendingReviews } from "@/features/dashboard/pending-reviews";
import { PlatformHealthAlert } from "@/features/dashboard/platform-health-alert";
import { getPostScheduledAt } from "@/features/publishing/posts/post-helpers";
import { PostRow } from "@/features/publishing/posts/post-row";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";

const PostViewPreviewDialog = lazy(() =>
  import("@/features/publishing/posts/post-view-preview-dialog").then(
    (module) => ({ default: module.PostViewPreviewDialog })
  )
);

import type { ConnectionView, PostView } from "@/shared/workspace-views";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

interface OperationalStats {
  readonly counts: {
    readonly totalPosts: number;
    readonly published: number;
    readonly scheduled: number;
    readonly failed: number;
    readonly partiallyFailed: number;
    readonly scheduledNextSevenDays: number;
    readonly publishedLastThirtyDays: number;
  };
  readonly streak: {
    readonly currentDays: number;
    readonly longestDays: number;
  };
}

export function DashboardContent({
  dashboardStats,
  isLoading,
}: {
  dashboardStats: OperationalStats | null;
  isLoading: boolean;
}) {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const workspaceId = workspace.workspaceId ?? "";
  const [previewPost, setPreviewPost] = useState<PostView | null>(null);

  const automationScope = {
    workspaceId,
    platform: "instagram" as const,
    category: "dm",
  };
  const automationOptions = resources.automations.list(automationScope, {
    limit: 100,
    offset: 0,
  });
  const automations = useResourceAtom({
    suspense: false,
    ...automationOptions,
    queryKey: automationOptions.queryKey!,
    enabled: Boolean(workspaceId),
  });
  const postsQuery = useResourceAtom({
    suspense: false,
    ...resources.posts.list(workspaceId, { limit: 100 }),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
  const connectionsQuery = useResourceAtom({
    suspense: false,
    ...resources.connections.list(workspaceId, { limit: 100 }),
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

  const posts = useMemo(() => postsQuery.data?.data ?? [], [postsQuery.data]);
  const upcoming = useMemo(
    () =>
      posts
        .filter((post) => post.status === "scheduled")
        .sort((a, b) =>
          (getPostScheduledAt(a) ?? "").localeCompare(
            getPostScheduledAt(b) ?? ""
          )
        )
        .slice(0, 5),
    [posts]
  );
  const recent = useMemo(
    () =>
      [...posts]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
    [posts]
  );

  const automationItems = automations.data?.data ?? [];
  const hasAutomations = automationItems.length > 0;
  const postsLoading = isLoading || postsQuery.isPending;

  return (
    <PageShell
      actions={
        <Button asChild>
          <Link href="/post">
            <Icon icon={Add} size={16} />
            Create Post
          </Link>
        </Button>
      }
      description="An overview of your content, schedule, and account health."
      page="Overview"
      pages={["Dashboard"]}
    >
      <DmSummaryCard />
      <PendingReviews />
      <FailedPostsAlert />
      <PlatformHealthAlert />

      <div data-tour="dashboard-stats">
        <DashboardStats isLoading={isLoading} stats={dashboardStats} />
      </div>

      <PageSection>
        <div className="grid items-start gap-x-8 gap-y-4 lg:grid-cols-[2fr_auto_1fr]">
          <Card className="p-4">
            <Suspense
              fallback={<output aria-label="Loading chart" className="h-48" />}
            >
              <DashboardChart isLoading={postsLoading} posts={posts} />
            </Suspense>
          </Card>
          {/* Dedicated divider column: self-stretches to the row height and the
              line bleeds into the section gaps so it meets the rules above/below. */}
          <div aria-hidden className="relative hidden self-stretch lg:block">
            <span className="pointer-events-none absolute -top-5 -bottom-5 left-0 border-zinc-950/10 border-l-[1.5px] border-dotted dark:border-white/10" />
          </div>
          <div className="space-y-4">
            <PostList
              connections={connectionsMap}
              emptyLabel="Nothing scheduled."
              isLoading={postsLoading}
              onPreview={setPreviewPost}
              posts={upcoming}
              title="Upcoming"
            />
            <PostList
              connections={connectionsMap}
              emptyLabel="No posts yet."
              isLoading={postsLoading}
              onPreview={setPreviewPost}
              posts={recent}
              title="Recent"
            />
          </div>
        </div>
      </PageSection>

      <PageSection title="Automations">
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickLink
            href="/automations/new"
            icon={MailSend01Icon}
            label={
              hasAutomations ? "New DM automation" : "Set up DM automation"
            }
          />
          {hasAutomations && (
            <QuickLink
              href="/automations"
              icon={MailSend01Icon}
              label="Manage automations"
              meta={`${
                automationItems.filter((automation) => automation.enabled)
                  .length
              }/${automationItems.length} active`}
            />
          )}
        </div>
      </PageSection>

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

function PostList({
  title,
  posts,
  connections,
  onPreview,
  isLoading,
  emptyLabel,
}: {
  title: string;
  posts: readonly PostView[];
  connections: Map<string, ConnectionView>;
  onPreview: (post: PostView) => void;
  isLoading: boolean;
  emptyLabel: string;
}) {
  return (
    <Card className="gap-0 p-0">
      <div className="px-4 py-3">
        <h3 className="font-medium text-sm tracking-tight">{title}</h3>
      </div>
      <div className="divide-y divide-border/60 border-border/60 border-t">
        {isLoading ? (
          [1, 2, 3].map((item) => (
            <div className="flex items-center gap-3 px-4 py-3" key={item}>
              <div className="size-6 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))
        ) : posts.length === 0 ? (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm">
            {emptyLabel}
          </p>
        ) : (
          posts.map((post) => (
            <PostRow
              connections={connections}
              key={post.id}
              onPreview={() => onPreview(post)}
              post={post}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function QuickLink({
  href,
  icon,
  label,
  meta,
}: {
  href: string;
  icon: typeof MailSend01Icon;
  label: string;
  meta?: string;
}) {
  return (
    <Button
      asChild
      className="surface-raised w-full justify-start gap-2 rounded-lg"
      variant="outline"
    >
      <Link href={href}>
        <Icon className="text-primary" icon={icon} size={16} />
        <span className="flex-1">{label}</span>
        {meta && <span className="text-muted-foreground text-xs">{meta}</span>}
        <Icon
          className="text-muted-foreground"
          icon={ArrowRight01Icon}
          size={14}
        />
      </Link>
    </Button>
  );
}
