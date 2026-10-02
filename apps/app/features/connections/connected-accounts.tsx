"use client";

import { SOCIAL_ACCOUNT_DISCONNECTED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import { socialBackgroundColors } from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccountActionsMenu } from "@/features/connections/account-actions-menu";
import { AccountFilters } from "@/features/connections/account-filter";
import { AccountStats } from "@/features/connections/account-stats";
import { ConnectAccountDialog } from "@/features/connections/connect-account-header";
import { SocialNotifications } from "@/features/connections/social-notifications";
import { normalizePlatform } from "@/features/publishing/social-platform";
import type { ConnectionView } from "@/shared/workspace-views";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom, useResourceAtom } from "@/shell/state/resources";

type AccountStatus = "active" | "expiring" | "expired";

function accountStatus(expiresAt: string | null): {
  status: AccountStatus;
  label: string;
  variant: "green" | "amber" | "red";
  /** Null when healthy — a far-off or auto-renewing token needs no callout. */
  stateLine: string | null;
} {
  if (!expiresAt) {
    // Auto-renewing (refresh token / long-lived) — no manual action, no date.
    return {
      status: "active",
      label: "Active",
      variant: "green",
      stateLine: null,
    };
  }
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  if (expires <= now) {
    return {
      status: "expired",
      label: "Expired",
      variant: "red",
      stateLine: `Expired ${formatDistanceToNow(new Date(expiresAt), {
        addSuffix: true,
      })} — reconnect`,
    };
  }
  if (expires - now <= 7 * 86_400_000) {
    // Only inside the 7-day window do we surface the date, since these tokens
    // (e.g. LinkedIn) don't auto-refresh and need a manual reconnect.
    return {
      status: "expiring",
      label: "Expires soon",
      variant: "amber",
      stateLine: `Reconnect by ${new Date(expiresAt).toLocaleDateString()}`,
    };
  }
  // Expires, but far enough out that showing a date is just noise.
  return {
    status: "active",
    label: "Active",
    variant: "green",
    stateLine: null,
  };
}

export default function ConnectedAccounts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const analytics = useAnalytics();
  const { workspaceId, isPending: isWorkspacePending } =
    useWorkspaceSelection();
  const { resources } = useApiClient();
  const accounts = useResourceAtom({
    suspense: false,
    throwOnError: false,
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
    // Token health changes out-of-band: a connect/disconnect completes on the
    // provider (a full-page OAuth round-trip) and the background refresh worker
    // renews tokens. Treat the list as always stale so returning to this tab —
    // or the post-OAuth redirect landing here — refetches instead of showing a
    // cached snapshot. SocialNotifications also invalidates it on `?success`.
    staleTime: 0,
    retry: 2,
  });
  const removeConnection = useMutationAtom(
    resources.connections.remove(workspaceId ?? "")
  );

  const filteredAccounts = useMemo(
    () =>
      (accounts.data?.data ?? []).filter((account) => {
        const search = searchQuery.toLowerCase();
        const matchesSearch =
          (account.displayName ?? "").toLowerCase().includes(search) ||
          (account.username ?? "").toLowerCase().includes(search);
        const matchesPlatform =
          filterPlatform === "all" ||
          account.platform.toUpperCase() === filterPlatform;
        const status = accountStatus(account.expiresAt).status;
        const matchesStatus =
          filterStatus === "all" ||
          (filterStatus === "active" && status === "active") ||
          (filterStatus === "expired" && status === "expired") ||
          (filterStatus === "expiring" && status === "expiring");
        return matchesSearch && matchesPlatform && matchesStatus;
      }),
    [accounts.data, filterPlatform, filterStatus, searchQuery]
  );

  const stats = useMemo(() => {
    const values = accounts.data?.data ?? [];
    let expired = 0;
    let expiring = 0;
    for (const item of values) {
      const status = accountStatus(item.expiresAt).status;
      if (status === "expired") {
        expired += 1;
      }
      if (status === "expiring") {
        expiring += 1;
      }
    }
    return {
      total: values.length,
      active: values.length - expired,
      expired,
      expiring,
    };
  }, [accounts.data]);

  const handleDelete = async (account: ConnectionView) => {
    try {
      await removeConnection.mutateAsync(account.id);
      analytics.capture(SOCIAL_ACCOUNT_DISCONNECTED, {
        provider: account.platform.toLowerCase(),
      });
      toast.success("Account disconnected");
    } catch (error) {
      toast.error("Failed to disconnect account", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <PageShell
      actions={<ConnectAccountDialog />}
      description="Manage your social media connections and token health."
      page="Connected Accounts"
      pages={["Settings"]}
    >
      <SocialNotifications />
      {isWorkspacePending || accounts.isPending ? (
        <Card className="divide-y divide-border/60 p-0">
          {[1, 2, 3].map((item) => (
            <div className="flex items-center gap-3 px-4 py-3" key={item}>
              <div className="size-10 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </Card>
      ) : (accounts.isError && !accounts.data) || !workspaceId ? (
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">
            {accounts.error?.message ??
              "Select a workspace to manage connections."}
          </p>
          <Button
            className="mt-3 w-fit"
            onClick={() => accounts.refetch()}
            variant="outline"
          >
            Retry
          </Button>
        </Card>
      ) : (
        <>
          <AccountStats stats={stats} />

          <PageSection>
            <AccountFilters
              filterPlatform={filterPlatform}
              filterStatus={filterStatus}
              searchQuery={searchQuery}
              setFilterPlatform={setFilterPlatform}
              setFilterStatus={setFilterStatus}
              setSearchQuery={setSearchQuery}
            />
            {filteredAccounts.length === 0 ? (
              <Card className="items-center justify-center gap-2 py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  No accounts found.
                </p>
                <ConnectAccountDialog />
              </Card>
            ) : (
              <Card className="divide-y divide-border/60 p-0">
                {filteredAccounts.map((account) => {
                  const platform = normalizePlatform(account.platform);
                  const status = accountStatus(account.expiresAt);
                  const subtitle = [
                    account.accountType === "organization"
                      ? "LinkedIn Page"
                      : account.accountType === "member"
                        ? "Personal profile"
                        : null,
                    account.username ? `@${account.username}` : null,
                    status.stateLine,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      className="flex items-center gap-3 px-4 py-3"
                      key={account.id}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          platform
                            ? socialBackgroundColors[platform]
                            : "bg-muted"
                        )}
                      >
                        {platform && (
                          <SocialIcon
                            className="size-5 text-white"
                            type={platform}
                          />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-sm">
                            {account.displayName ??
                              account.username ??
                              account.profileId}
                          </p>
                          <Badge size="sm" variant={status.variant}>
                            {status.label}
                          </Badge>
                        </div>
                        {subtitle && (
                          <p className="truncate text-muted-foreground text-xs">
                            {subtitle}
                          </p>
                        )}
                      </div>
                      <AccountActionsMenu
                        account={account}
                        disconnecting={removeConnection.isPending}
                        onDisconnect={() => handleDelete(account)}
                      />
                    </div>
                  );
                })}
              </Card>
            )}
          </PageSection>
        </>
      )}
    </PageShell>
  );
}
