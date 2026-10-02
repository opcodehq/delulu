"use client";

import type { PlanType } from "@delulu/payments";
import { useApiClient } from "@/shell/providers/api-client";
import { useResourceAtom } from "@/shell/state/resources";
import { useWorkspaceSelection } from "../../shell/providers/workspace";

export interface SubscriptionView {
  id: string;
  billingOwnerUserId: string;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingInterval: string | null;
  currency: string | null;
  recurringAmountMinor: number | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
  addons: Readonly<Record<string, unknown>>;
}

export interface UseSubscriptionReturn {
  subscription: SubscriptionView | null | undefined;
  planType: PlanType;
  billingPeriod: "MONTHLY" | "YEARLY" | "LIFETIME" | null;
  isActive: boolean;
  isPastDue: boolean;
  isCancelled: boolean;
  isTrialing: boolean;
  isFree: boolean;
  isVibe: boolean;
  isEcho: boolean;
  isPaid: boolean;
  isLifetime: boolean;
  isLoading: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
  currency: string | null;
  recurringAmountMinor: number | null;
  error: Error | null;
  retry: () => void;
}

const toPlanType = (value: string | undefined): PlanType => {
  const normalized = value?.toUpperCase();
  return normalized === "VIBE" || normalized === "ECHO" ? normalized : "FREE";
};

export function useSubscription(): UseSubscriptionReturn {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const options = resources.billing.subscription(workspace.workspaceId ?? "");
  const query = useResourceAtom({
    ...options,
    queryKey: options.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const subscription = query.data;
  const planType = toPlanType(subscription?.plan);
  const status = subscription?.status.toUpperCase();
  const billingPeriod =
    subscription?.billingInterval === "MONTHLY" ||
    subscription?.billingInterval === "YEARLY" ||
    subscription?.billingInterval === "LIFETIME"
      ? subscription.billingInterval
      : null;

  return {
    subscription,
    planType,
    billingPeriod,
    isActive: status === "ACTIVE",
    isPastDue: status === "PAST_DUE",
    isCancelled:
      status === "CANCELLED" || status === "EXPIRED" || status === "FAILED",
    isTrialing: status === "TRIALING",
    isFree: planType === "FREE",
    isVibe: planType === "VIBE",
    isEcho: planType === "ECHO",
    isPaid:
      planType !== "FREE" && (status === "ACTIVE" || status === "TRIALING"),
    isLifetime: billingPeriod === "LIFETIME",
    isLoading: workspace.isLoading || query.isPending,
    currentPeriodEnd: subscription?.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd === true,
    canManageBilling: subscription?.canManageBilling === true,
    currency: subscription?.currency ?? null,
    recurringAmountMinor: subscription?.recurringAmountMinor ?? null,
    error: workspace.error ?? query.error,
    retry: async () => {
      await (workspace.error ? workspace.retry() : query.refetch());
    },
  };
}
