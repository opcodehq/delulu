"use client";

import { ReferralPrompt } from "@/features/onboarding/referral-prompt";
import { OperationsError } from "@/features/workspace/query-state";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";
import { DashboardContent } from "./dashboard-content";

export function DashboardClient() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const options = resources.analytics.operational(workspace.workspaceId ?? "");
  const stats = useResourceAtom({
    suspense: false,
    ...options,
    queryKey: options.queryKey!,
    enabled: !!workspace.workspaceId,
  });

  const error = workspace.error ?? (stats.data ? null : stats.error);
  if (error) {
    return (
      <OperationsError
        error={error}
        onRetry={async () => {
          await (workspace.error ? workspace.retry() : stats.refetch());
        }}
      />
    );
  }

  return (
    <>
      <ReferralPrompt />
      <DashboardContent
        dashboardStats={stats.data ?? null}
        isLoading={workspace.isLoading || stats.isPending}
      />
    </>
  );
}
