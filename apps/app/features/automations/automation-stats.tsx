"use client";

import {
  StatRow,
  StatTile,
} from "@delulu/design-system/components/ui/stat-row";

interface AutomationStatsProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    totalDMsSent: number;
  };
}

export function AutomationStats({ stats }: AutomationStatsProps) {
  return (
    <div>
      <StatRow columns={4}>
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Active" value={stats.active} />
        <StatTile label="Inactive" value={stats.inactive} />
        <StatTile label="DMs sent" value={stats.totalDMsSent} />
      </StatRow>
    </div>
  );
}
