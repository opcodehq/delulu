"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  DocumentAttachmentIcon,
  UserMultipleIcon,
  ViewIcon,
  WifiConnected01Icon,
} from "@delulu/icons";

interface Totals {
  impressions: number;
  reach: number;
  followersGained: number;
  profileViews: number;
  engagements: number;
}

interface AnalyticsStatCardsProps {
  currentTotals: Totals | undefined;
  percentageChange: Totals | undefined;
  postsTracked: number;
  isLoading: boolean;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return String(n);
}

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) {
    return null;
  }
  const isPositive = change >= 0;
  return (
    <span
      className={`font-medium text-xs ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
    >
      {isPositive ? "+" : ""}
      {change}%
    </span>
  );
}

export function AnalyticsStatCards({
  currentTotals,
  percentageChange,
  postsTracked,
  isLoading,
}: AnalyticsStatCardsProps) {
  const v = (n: number | undefined) =>
    isLoading || n === undefined ? "..." : formatNumber(n);

  const stats = [
    {
      label: "Views",
      value: v(currentTotals?.impressions),
      change: percentageChange?.impressions ?? null,
      icon: ViewIcon,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Reach",
      value: v(currentTotals?.reach),
      change: percentageChange?.reach ?? null,
      icon: WifiConnected01Icon,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "Profile Views",
      value: v(currentTotals?.profileViews),
      change: percentageChange?.profileViews ?? null,
      icon: UserMultipleIcon,
      color: "text-orange-600 dark:text-orange-400",
    },
    {
      label: "Posts Tracked",
      value: isLoading ? "..." : String(postsTracked),
      change: null,
      icon: DocumentAttachmentIcon,
      color: "text-muted-foreground",
    },
  ];

  return (
    <>
      {/* Mobile: compact grid */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {stats.map((item) => (
          <div
            className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
            key={item.label}
          >
            <Icon className={item.color} icon={item.icon} size={14} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold text-sm">{item.value}</span>
                <ChangeIndicator change={item.change} />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {item.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: full cards */}
      <div className="hidden grid-cols-4 gap-2 md:grid">
        {stats.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {item.label}
              </CardTitle>
              <Icon className={item.color} icon={item.icon} size={16} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-2xl">{item.value}</span>
                <ChangeIndicator change={item.change} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
