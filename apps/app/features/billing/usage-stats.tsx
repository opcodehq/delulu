"use client";

/**
 * Usage Stats Component
 *
 * Displays current usage against plan limits with visual progress bars
 */

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Progress } from "@delulu/design-system/components/ui/progress";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AlertCircleIcon,
  BarChartIcon,
  FlashIcon,
  Image01Icon,
  UserMultipleIcon,
} from "@delulu/icons";
import { PLANS } from "@delulu/payments";
import { useSubscription } from "@/features/billing/use-subscription";
import { OperationsError } from "@/features/workspace/query-state";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

interface UsageStatItemProps {
  icon: React.ReactNode;
  label: string;
  current: number;
  limit: number;
  isUnlimited: boolean;
  percentageUsed: number;
}

const limitState = (limit: number, current: number) => ({
  limit,
  isUnlimited: limit === -1,
  percentageUsed:
    limit === -1
      ? -1
      : limit === 0
        ? 100
        : Math.min(100, Math.round((current / limit) * 100)),
});

function UsageStatItem({
  icon,
  label,
  current,
  limit,
  isUnlimited,
  percentageUsed,
}: UsageStatItemProps) {
  const isNearLimit = percentageUsed >= 80 && !isUnlimited;
  const isAtLimit = percentageUsed >= 100 && !isUnlimited;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAtLimit && (
            <Icon
              className="text-destructive"
              icon={AlertCircleIcon}
              size={16}
            />
          )}
          <span className="font-mono text-sm">
            {isUnlimited ? (
              <>
                {current}{" "}
                <span className="text-muted-foreground">/ Unlimited</span>
              </>
            ) : (
              <>
                {current}{" "}
                <span className="text-muted-foreground">/ {limit}</span>
              </>
            )}
          </span>
        </div>
      </div>
      {!isUnlimited && (
        <div className="space-y-1">
          <Progress
            className={`h-2 ${
              isAtLimit
                ? "[&>div]:bg-destructive"
                : isNearLimit
                  ? "[&>div]:bg-yellow-500"
                  : ""
            }`}
            value={percentageUsed}
          />
          {isNearLimit && (
            <p className="text-muted-foreground text-xs">
              {isAtLimit
                ? "Limit reached - Upgrade to continue"
                : "Approaching limit - Consider upgrading"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function UsageStats() {
  const subscription = useSubscription();
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const usageResource = resources.billing.usage(workspace.workspaceId ?? "");
  const memberResource = resources.admin.members(workspace.workspaceId ?? "", {
    limit: 1,
    offset: 0,
  });
  const usageQuery = useResourceAtom({
    ...usageResource,
    queryKey: usageResource.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const membersQuery = useResourceAtom({
    ...memberResource,
    queryKey: memberResource.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const usage = usageQuery.data?.usage;

  const socialAccountsCount = usage?.socialAccounts ?? 0;
  const monthlyPostsCount = usage?.monthlyPosts ?? 0;
  const mediaStorageMB = Math.round(
    (usage?.mediaStorageBytes ?? 0) / 1_000_000
  );
  const teamMemberCount = membersQuery.data?.total ?? 1;

  // Get limit checks
  const plan = PLANS[subscription.planType];
  const socialAccountsLimit = limitState(
    plan.limits.socialAccounts,
    socialAccountsCount
  );
  const monthlyPostsLimit = limitState(
    plan.limits.monthlyPosts,
    monthlyPostsCount
  );
  const mediaStorageLimit = limitState(
    plan.limits.mediaStorage,
    mediaStorageMB
  );
  const teamMembersLimit = limitState(plan.limits.teamMembers, teamMemberCount);

  if (
    subscription.isLoading ||
    usageQuery.isPending ||
    membersQuery.isPending
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage & Limits</CardTitle>
          <CardDescription>Loading usage statistics...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const queryError =
    subscription.error ?? usageQuery.error ?? membersQuery.error;
  if (queryError) {
    return (
      <OperationsError
        error={queryError}
        onRetry={async () => {
          subscription.retry();
          await Promise.all([usageQuery.refetch(), membersQuery.refetch()]);
        }}
      />
    );
  }

  const hasAnyLimitReached =
    (!socialAccountsLimit.isUnlimited &&
      socialAccountsLimit.percentageUsed >= 100) ||
    (!monthlyPostsLimit.isUnlimited && monthlyPostsLimit.percentageUsed >= 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Usage & Limits</CardTitle>
            <CardDescription>
              Track your usage against your {subscription.planType} plan limits
            </CardDescription>
          </div>
          {subscription.isPaid && (
            <Badge variant="secondary">
              <Icon className="mr-1" icon={BarChartIcon} size={12} />
              {subscription.planType}
              {subscription.isLifetime && " (Lifetime)"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Social Accounts */}
        <UsageStatItem
          current={socialAccountsCount}
          icon={
            <Icon
              className="text-muted-foreground"
              icon={FlashIcon}
              size={16}
            />
          }
          isUnlimited={socialAccountsLimit.isUnlimited}
          label="Social Accounts"
          limit={socialAccountsLimit.limit}
          percentageUsed={socialAccountsLimit.percentageUsed}
        />

        {/* Monthly Posts */}
        <UsageStatItem
          current={monthlyPostsCount}
          icon={
            <Icon
              className="text-muted-foreground"
              icon={BarChartIcon}
              size={16}
            />
          }
          isUnlimited={monthlyPostsLimit.isUnlimited}
          label="Posts This Month"
          limit={monthlyPostsLimit.limit}
          percentageUsed={monthlyPostsLimit.percentageUsed}
        />

        {/* Media Storage */}
        <UsageStatItem
          current={mediaStorageMB}
          icon={
            <Icon
              className="text-muted-foreground"
              icon={Image01Icon}
              size={16}
            />
          }
          isUnlimited={mediaStorageLimit.isUnlimited}
          label="Media Storage (MB)"
          limit={mediaStorageLimit.limit}
          percentageUsed={mediaStorageLimit.percentageUsed}
        />

        {/* Team Members */}
        <UsageStatItem
          current={teamMemberCount}
          icon={
            <Icon
              className="text-muted-foreground"
              icon={UserMultipleIcon}
              size={16}
            />
          }
          isUnlimited={teamMembersLimit.isUnlimited}
          label="Team Members"
          limit={teamMembersLimit.limit}
          percentageUsed={teamMembersLimit.percentageUsed}
        />

        {/* Upgrade prompt */}
        {hasAnyLimitReached && subscription.isFree && (
          <div className="space-y-3 rounded-lg bg-primary/10 p-4">
            <p className="font-medium text-sm">
              You've reached your plan limit
            </p>
            <p className="text-muted-foreground text-sm">
              Upgrade to continue adding accounts and creating posts without
              interruption.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                window.location.href = "/billing";
              }}
            >
              View Upgrade Options
            </Button>
          </div>
        )}

        {/* Plan upgrade suggestion for near-limits */}
        {!(hasAnyLimitReached || subscription.isVibe) &&
          (socialAccountsLimit.percentageUsed >= 80 ||
            monthlyPostsLimit.percentageUsed >= 80) && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <p className="font-medium text-sm text-yellow-700 dark:text-yellow-400">
                Approaching your plan limits
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Consider upgrading to avoid interruptions.
              </p>
              <Button
                className="mt-3"
                onClick={() => {
                  window.location.href = "/billing";
                }}
                size="sm"
                variant="outline"
              >
                View Plans
              </Button>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact usage stats for dashboards
 */
export function CompactUsageStats() {
  const subscription = useSubscription();
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const usageResource = resources.billing.usage(workspace.workspaceId ?? "");
  const usageQuery = useResourceAtom({
    ...usageResource,
    queryKey: usageResource.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const usage = usageQuery.data?.usage;

  const socialAccountsCount = usage?.socialAccounts ?? 0;
  const monthlyPostsCount = usage?.monthlyPosts ?? 0;

  const plan = PLANS[subscription.planType];
  const socialAccountsLimit = limitState(
    plan.limits.socialAccounts,
    socialAccountsCount
  );
  const monthlyPostsLimit = limitState(
    plan.limits.monthlyPosts,
    monthlyPostsCount
  );

  if (subscription.isLoading || usageQuery.isPending) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Social Accounts
            </span>
            <span className="font-mono text-sm">
              {socialAccountsCount}/{" "}
              {socialAccountsLimit.isUnlimited
                ? "∞"
                : socialAccountsLimit.limit}
            </span>
          </div>
          {!socialAccountsLimit.isUnlimited && (
            <Progress
              className="h-2"
              value={socialAccountsLimit.percentageUsed}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Posts This Month
            </span>
            <span className="font-mono text-sm">
              {monthlyPostsCount}/{" "}
              {monthlyPostsLimit.isUnlimited ? "∞" : monthlyPostsLimit.limit}
            </span>
          </div>
          {!monthlyPostsLimit.isUnlimited && (
            <Progress
              className="h-2"
              value={monthlyPostsLimit.percentageUsed}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
