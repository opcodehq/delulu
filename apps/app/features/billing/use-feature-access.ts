/**
 * useFeatureAccess Hook
 *
 * Checks if the current user has access to a specific feature based on their plan
 */

import { getPlan, type PlanType, resolvePlanType } from "@delulu/payments";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export type Feature = "postScheduling" | "prioritySupport";

export interface UseFeatureAccessReturn {
  hasAccess: boolean;
  needsUpgrade: boolean;
  planType: PlanType;
  isLoading: boolean;
  isChecking: boolean;
}

export function useFeatureAccess(feature: Feature): UseFeatureAccessReturn {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const subscription = useResourceAtom({
    ...resources.billing.subscription(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
  const planType = resolvePlanType(subscription.data?.plan);
  const hasAccess = getPlan(planType).features[feature];

  return {
    hasAccess,
    needsUpgrade: !hasAccess,
    planType,
    isLoading: subscription.isPending,
    isChecking: subscription.isFetching,
  };
}

/**
 * Helper hook to check multiple features at once
 */
export function useMultipleFeatureAccess(features: Feature[]) {
  const results = features.map((feature) => useFeatureAccess(feature));

  return {
    features: Object.fromEntries(
      features.map((feature, index) => [feature, results[index]])
    ),
    allGranted: results.every((r) => r.hasAccess),
    someGranted: results.some((r) => r.hasAccess),
    isLoading: results.some((r) => r.isLoading),
  };
}
