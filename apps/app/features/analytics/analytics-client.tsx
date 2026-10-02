"use client";

import { useState } from "react";
import { AnalyticsContent } from "@/features/analytics/analytics-content";
import { OperationsError } from "@/features/workspace/query-state";
import { FeatureGate } from "@/shell/feature-gate";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export function AnalyticsClient() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const workspaceId = workspace.workspaceId ?? "";
  const accountOptions = resources.connections.list(workspaceId, {
    limit: 100,
  });
  const accounts = useResourceAtom({
    suspense: false,
    ...accountOptions,
    queryKey: accountOptions.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const instagramAccounts =
    accounts.data?.data.filter(
      (account) => account.platform.toLowerCase() === "instagram"
    ) ?? [];
  const [requestedProviderId, setSelectedProviderId] = useState("");
  const [days, setDays] = useState(30);

  const selectedProviderId = instagramAccounts.some(
    (account) => account.id === requestedProviderId
  )
    ? requestedProviderId
    : (instagramAccounts[0]?.id ?? "");

  const insightOptions = resources.analytics.insights(
    workspaceId,
    selectedProviderId,
    { windowDays: days }
  );
  const insights = useResourceAtom({
    suspense: false,
    ...insightOptions,
    queryKey: insightOptions.queryKey!,
    enabled: !!workspace.workspaceId && !!selectedProviderId,
  });

  if (workspace.error || (accounts.error && !accounts.data)) {
    const error = workspace.error ?? accounts.error;
    return (
      <OperationsError
        error={error!}
        onRetry={async () => {
          await (workspace.error ? workspace.retry() : accounts.refetch());
        }}
      />
    );
  }

  return (
    <FeatureGate
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground">Page not found</p>
        </div>
      }
      flag="analytics"
    >
      <AnalyticsContent
        accounts={instagramAccounts}
        days={days}
        error={insights.error}
        insights={insights.data ?? null}
        isLoading={
          workspace.isLoading ||
          accounts.isPending ||
          (!!selectedProviderId && insights.isPending)
        }
        isRefreshing={insights.isFetching}
        onChangeDays={setDays}
        onSelectProvider={setSelectedProviderId}
        onSync={async () => {
          await insights.refetch();
        }}
        selectedProviderId={selectedProviderId}
      />
    </FeatureGate>
  );
}
