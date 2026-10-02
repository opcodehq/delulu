"use client";

import type {
  createAnalyticsEffects,
  ResourceEffectSuccess,
} from "@delulu/client";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { EmptyState } from "@delulu/design-system/components/ui/dither";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Analytics01Icon,
  ArrowDataTransferHorizontalIcon,
  Loading03Icon,
} from "@delulu/icons";
import { lazy, Suspense } from "react";
import { AnalyticsStatCards } from "@/features/analytics/analytics-stat-cards";
import { OperationsError } from "@/features/workspace/query-state";
import { PageLoading } from "@/shell/loading";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";

const EngagementChart = lazy(() =>
  import("@/features/analytics/engagement-chart").then((module) => ({
    default: module.EngagementChart,
  }))
);

import { TopPostsList } from "@/features/analytics/top-posts-list";

type AnalyticsEffects = ReturnType<typeof createAnalyticsEffects>;
type InsightResource = ReturnType<AnalyticsEffects["insights"]>;
type Insights = ResourceEffectSuccess<InsightResource>;
export type InsightPoint = Insights["current"]["points"][number];
export type InsightPost = Insights["topPosts"][number];

interface AnalyticsContentProps {
  accounts: readonly {
    id: string;
    username: string | null;
    displayName: string | null;
  }[];
  selectedProviderId: string;
  onSelectProvider: (id: string) => void;
  days: number;
  onChangeDays: (days: number) => void;
  insights: Insights | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  onSync: () => void;
}

function formatSyncTime(timestamp: string | undefined): string {
  if (!timestamp) {
    return "Never synced";
  }
  return `Synced ${new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
}

export function AnalyticsContent({
  accounts,
  selectedProviderId,
  onSelectProvider,
  days,
  onChangeDays,
  insights,
  isLoading,
  isRefreshing,
  error,
  onSync,
}: AnalyticsContentProps) {
  if (isLoading && accounts.length === 0) {
    return <PageLoading label="Loading analytics" />;
  }

  // No accounts connected
  if (accounts.length === 0) {
    return (
      <PageShell
        description="Track reach, engagement, and your top-performing posts."
        page="Analytics"
        pages={[]}
      >
        <EmptyState
          description="Connect an Instagram account to start tracking analytics."
          title="No accounts connected"
        />
      </PageShell>
    );
  }

  if (error && !insights) {
    return <OperationsError error={error} onRetry={onSync} />;
  }

  return (
    <PageShell
      actions={
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground text-xs sm:inline">
            {formatSyncTime(insights?.cachedAt)}
          </span>
          {(insights?.stale || error) && (
            <Badge className="text-xs" variant="secondary">
              Cached data
            </Badge>
          )}
          <Button
            disabled={isRefreshing || !selectedProviderId}
            onClick={onSync}
            size="sm"
            variant="outline"
          >
            <Icon
              className={isRefreshing ? "animate-spin" : ""}
              icon={
                isRefreshing ? Loading03Icon : ArrowDataTransferHorizontalIcon
              }
              size={14}
            />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      }
      description="Track reach, engagement, and your top-performing posts."
      page="Analytics"
      pages={[]}
    >
      {/* Account + period controls */}
      <div className="flex items-center gap-2">
        {/* Account selector */}
        <Select onValueChange={onSelectProvider} value={selectedProviderId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                @{account.username || account.displayName || "account"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Period selector */}
        <Select
          onValueChange={(v) => onChangeDays(Number(v))}
          value={String(days)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat cards */}
      <AnalyticsStatCards
        currentTotals={insights?.current.totals}
        isLoading={isLoading}
        percentageChange={insights?.percentageChange}
        postsTracked={insights?.topPosts.length ?? 0}
      />

      {/* Engagement chart */}
      <PageSection>
        <Suspense fallback={<PageLoading label="Loading chart" />}>
          <EngagementChart
            insights={insights?.current.points ?? []}
            isLoading={isLoading}
          />
        </Suspense>
      </PageSection>

      {/* Top posts */}
      <PageSection>
        <TopPostsList isLoading={isLoading} posts={insights?.topPosts ?? []} />
      </PageSection>
    </PageShell>
  );
}
