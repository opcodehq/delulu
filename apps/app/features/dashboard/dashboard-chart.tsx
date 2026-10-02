"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartDataTable,
  ChartDitherPattern,
  ChartTooltip,
  ChartTooltipContent,
  RechartsPrimitive,
} from "@delulu/design-system/components/ui/chart";
import { EmptyState } from "@delulu/design-system/components/ui/dither";
import { useId, useMemo } from "react";
import type { PostView } from "@/shared/workspace-views";

const { Bar, BarChart, CartesianGrid, XAxis } = RechartsPrimitive;

const chartConfig = {
  published: { label: "Published", color: "var(--chart-1)" },
  scheduled: { label: "Scheduled", color: "var(--chart-2)" },
} satisfies ChartConfig;

const DAYS = 30;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildBuckets(posts: readonly PostView[]) {
  const buckets = new Map<string, { published: number; scheduled: number }>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    buckets.set(dayKey(date), { published: 0, scheduled: 0 });
  }

  for (const post of posts) {
    for (const target of post.targets) {
      if (target.postedAt) {
        const key = dayKey(new Date(target.postedAt));
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.published += 1;
        }
      }
      if (target.scheduledAt && target.status === "pending") {
        const key = dayKey(new Date(target.scheduledAt));
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.scheduled += 1;
        }
      }
    }
  }

  return Array.from(buckets.entries()).map(([date, value]) => ({
    date,
    ...value,
  }));
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function DashboardChart({
  posts,
  isLoading,
}: {
  posts: readonly PostView[];
  isLoading: boolean;
}) {
  const pattern = useId().replace(/:/g, "");
  const data = useMemo(() => buildBuckets(posts), [posts]);
  const hasActivity = data.some(
    (point) => point.published > 0 || point.scheduled > 0
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm tracking-tight">Activity</h3>
          <p className="text-muted-foreground text-xs">Last 30 days</p>
        </div>
      </div>
      {isLoading ? (
        <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />
      ) : hasActivity ? (
        <>
          <ChartContainer className="h-48 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={data}>
              <ChartDitherPattern
                color="var(--color-published)"
                id={`${pattern}-published`}
              />
              <ChartDitherPattern
                color="var(--color-scheduled)"
                id={`${pattern}-scheduled`}
              />
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                fontSize={11}
                interval="preserveStartEnd"
                minTickGap={24}
                tickFormatter={formatDay}
                tickLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const point = payload?.[0]?.payload as
                        | { date: string }
                        | undefined;
                      return point ? formatDay(point.date) : "";
                    }}
                  />
                }
              />
              <Bar
                dataKey="published"
                fill={`url(#${pattern}-published)`}
                isAnimationActive={false}
                radius={[3, 3, 0, 0]}
                stackId="a"
              />
              <Bar
                dataKey="scheduled"
                fill={`url(#${pattern}-scheduled)`}
                isAnimationActive={false}
                radius={[3, 3, 0, 0]}
                stackId="a"
              />
            </BarChart>
          </ChartContainer>
          <ChartDataTable
            columns={[
              { key: "date", label: "Date" },
              { key: "published", label: "Published" },
              { key: "scheduled", label: "Scheduled" },
            ]}
            data={data}
            label="activity"
          />
        </>
      ) : (
        <EmptyState
          className="h-48"
          description="Publish or schedule a post to see it here."
          title="No activity yet"
        />
      )}
    </div>
  );
}
