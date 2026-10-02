"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartDataTable,
  ChartDitherPattern,
  ChartTooltip,
  ChartTooltipContent,
  RechartsPrimitive,
} from "@delulu/design-system/components/ui/chart";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@delulu/design-system/components/ui/tabs";
import { useId, useState } from "react";
import type { InsightPoint } from "@/features/analytics/analytics-content";

const { CartesianGrid, Area, AreaChart, XAxis, YAxis } = RechartsPrimitive;

interface EngagementChartProps {
  insights: readonly InsightPoint[];
  isLoading: boolean;
}

const chartConfig = {
  impressions: {
    label: "Views",
    color: "hsl(142, 76%, 36%)",
  },
  reach: {
    label: "Reach",
    color: "hsl(262, 83%, 58%)",
  },
  profileViews: {
    label: "Profile Views",
    color: "hsl(24, 95%, 53%)",
  },
} satisfies ChartConfig;

function formatDate(timestamp: string, short = false): string {
  const date = new Date(timestamp);
  if (short) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function aggregateWeekly(daily: readonly InsightPoint[]): Array<{
  date: string;
  impressions: number;
  reach: number;
  profileViews: number;
}> {
  if (daily.length === 0) {
    return [];
  }

  const weeks: Array<{
    date: string;
    impressions: number;
    reach: number;
    profileViews: number;
  }> = [];

  let weekStart = daily[0].date;
  let weekData = { date: weekStart, impressions: 0, reach: 0, profileViews: 0 };
  let dayCount = 0;

  for (const day of daily) {
    if (dayCount >= 7) {
      weeks.push(weekData);
      weekStart = day.date;
      weekData = { date: weekStart, impressions: 0, reach: 0, profileViews: 0 };
      dayCount = 0;
    }
    weekData.impressions += day.impressions ?? 0;
    weekData.reach += day.reach ?? 0;
    weekData.profileViews += day.profileViews ?? 0;
    dayCount++;
  }

  // Push remaining partial week
  if (dayCount > 0) {
    weeks.push(weekData);
  }

  return weeks;
}

export function EngagementChart({ insights, isLoading }: EngagementChartProps) {
  const pattern = useId().replace(/:/g, "");
  const [granularity, setGranularity] = useState<"daily" | "weekly">("daily");

  const dailyData = insights.map((d) => ({
    date: d.date,
    impressions: d.impressions ?? 0,
    reach: d.reach ?? 0,
    profileViews: d.profileViews ?? 0,
  }));

  const chartData =
    granularity === "weekly" ? aggregateWeekly(insights) : dailyData;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Engagement Over Time</CardTitle>
        <Tabs
          onValueChange={(v) => setGranularity(v as "daily" | "weekly")}
          value={granularity}
        >
          <TabsList className="h-8">
            <TabsTrigger className="text-xs" value="daily">
              Daily
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="weekly">
              Weekly
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading || chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted-foreground text-sm">
              {isLoading ? "Loading chart data..." : "No data available yet"}
            </p>
          </div>
        ) : (
          <>
            <ChartContainer className="h-56 w-full" config={chartConfig}>
              <AreaChart accessibilityLayer data={chartData}>
                {Object.keys(chartConfig).map((key) => (
                  <ChartDitherPattern
                    color={`var(--color-${key})`}
                    id={`${pattern}-${key}`}
                    key={key}
                  />
                ))}
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  fontSize={11}
                  tickFormatter={(ts: string) => formatDate(ts, true)}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(n: number) =>
                    n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n)
                  }
                  tickLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const item = payload?.[0]?.payload;
                        return item ? formatDate(item.date) : "";
                      }}
                    />
                  }
                />
                <Area
                  activeDot={{ r: 4 }}
                  dataKey="impressions"
                  dot={false}
                  fill={`url(#${pattern}-impressions)`}
                  isAnimationActive={false}
                  stroke="var(--color-impressions)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Area
                  activeDot={{ r: 4 }}
                  dataKey="reach"
                  dot={false}
                  fill={`url(#${pattern}-reach)`}
                  isAnimationActive={false}
                  stroke="var(--color-reach)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Area
                  activeDot={{ r: 4 }}
                  dataKey="profileViews"
                  dot={false}
                  fill={`url(#${pattern}-profileViews)`}
                  isAnimationActive={false}
                  stroke="var(--color-profileViews)"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
            <ChartDataTable
              columns={[
                { key: "date", label: "Date" },
                { key: "impressions", label: "Views" },
                { key: "reach", label: "Reach" },
                { key: "profileViews", label: "Profile views" },
              ]}
              data={chartData}
              label="engagement"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
