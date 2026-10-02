"use client";

import {
  StatRow,
  StatTile,
} from "@delulu/design-system/components/ui/stat-row";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Calendar01Icon,
  DocumentAttachmentIcon,
  FireIcon,
  TickDouble01Icon,
} from "@delulu/icons";

interface OperationalStats {
  readonly counts: {
    readonly totalPosts: number;
    readonly published: number;
    readonly scheduled: number;
    readonly publishedLastThirtyDays: number;
    readonly scheduledNextSevenDays: number;
  };
  readonly streak: {
    readonly currentDays: number;
    readonly longestDays: number;
  };
}

export function DashboardStats({
  stats,
  isLoading,
}: {
  stats: OperationalStats | null;
  isLoading: boolean;
}) {
  const value = (n: number | undefined) =>
    isLoading || n === undefined ? undefined : n;
  const counts = stats?.counts;
  const streak = stats?.streak;
  const publishedLast30 = counts?.publishedLastThirtyDays ?? 0;

  return (
    <StatRow columns={4}>
      <StatTile
        icon={<Icon icon={DocumentAttachmentIcon} size={16} />}
        label="Total posts"
        value={value(counts?.totalPosts)}
      />
      <StatTile
        delta={
          publishedLast30 > 0
            ? { value: `+${publishedLast30}`, trend: "up" }
            : undefined
        }
        hint="Last 30 days"
        icon={<Icon icon={TickDouble01Icon} size={16} />}
        label="Published"
        value={value(counts?.published)}
      />
      <StatTile
        hint={`${counts?.scheduledNextSevenDays ?? 0} in next 7 days`}
        icon={<Icon icon={Calendar01Icon} size={16} />}
        label="Scheduled"
        value={value(counts?.scheduled)}
      />
      <StatTile
        hint={
          streak?.longestDays ? `Best ${streak.longestDays} days` : "Keep going"
        }
        icon={<Icon icon={FireIcon} size={16} />}
        label="Streak"
        value={value(streak?.currentDays)}
      />
    </StatRow>
  );
}
