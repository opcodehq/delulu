/**
 * useUsageLimits Hook
 *
 * Checks usage limits for the current user's plan
 */

import { getPlan, type PlanType, resolvePlanType } from "@delulu/payments";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export type LimitType =
  | "socialAccounts"
  | "monthlyPosts"
  | "mediaStorage"
  | "teamMembers"
  | "organizations";

export interface UseUsageLimitReturn {
  allowed: boolean;
  limit: number; // -1 for unlimited
  remaining: number; // -1 for unlimited
  planType: PlanType;
  isLoading: boolean;
  isUnlimited: boolean;
  percentageUsed: number; // 0-100, or -1 for unlimited
}

export function useUsageLimit(
  limitType: LimitType,
  currentValue: number
): UseUsageLimitReturn {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const subscription = useResourceAtom({
    ...resources.billing.subscription(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
  const planType = resolvePlanType(subscription.data?.plan);
  const plan = getPlan(planType);
  const normalizedType =
    limitType === "mediaStorage" ? "mediaStorage" : limitType;
  const limit = plan.limits[normalizedType];
  const remaining = limit === -1 ? -1 : Math.max(0, limit - currentValue);
  const isUnlimited = limit === -1;

  // Calculate percentage used
  let percentageUsed = -1;
  if (!isUnlimited && limit > 0) {
    percentageUsed = Math.min(100, Math.round((currentValue / limit) * 100));
  }

  return {
    allowed: isUnlimited || currentValue < limit,
    limit,
    remaining,
    planType,
    isLoading: subscription.isPending,
    isUnlimited,
    percentageUsed,
  };
}

/**
 * Hook to check multiple limits at once
 */
export function useMultipleUsageLimits(
  limits: Array<{ type: LimitType; currentValue: number }>
) {
  const results = limits.map(({ type, currentValue }) =>
    useUsageLimit(type, currentValue)
  );

  return {
    limits: Object.fromEntries(
      limits.map(({ type }, index) => [type, results[index]])
    ),
    allAllowed: results.every((r) => r.allowed),
    someBlocked: results.some((r) => !r.allowed),
    isLoading: results.some((r) => r.isLoading),
  };
}

/**
 * Helper hook for social accounts limit
 */
export function useSocialAccountsLimit(currentCount: number) {
  return useUsageLimit("socialAccounts", currentCount);
}

/**
 * Helper hook for monthly posts limit
 */
export function useMonthlyPostsLimit(currentCount: number) {
  return useUsageLimit("monthlyPosts", currentCount);
}

/**
 * Helper hook for media storage limit
 */
export function useMediaStorageLimit(currentUsageMB: number) {
  return useUsageLimit("mediaStorage", currentUsageMB);
}

/**
 * Helper hook for team members limit
 */
export function useTeamMembersLimit(currentCount: number) {
  return useUsageLimit("teamMembers", currentCount);
}
