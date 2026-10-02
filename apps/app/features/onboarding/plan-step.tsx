"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@delulu/design-system/components/ui/avatar";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import { Icon } from "@delulu/design-system/providers/icon";
import { CheckmarkCircle01Icon, RefreshIcon } from "@delulu/icons";
import { PricingCards } from "@/features/billing/pricing-cards";
import type { ConnectionView } from "@/shared/workspace-views";

export function PlanStep({
  accounts,
  isRefreshing,
  onRefresh,
  paid,
  plan,
  refreshError,
  onDashboard,
}: {
  accounts: readonly ConnectionView[];
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  paid: boolean;
  plan: string;
  refreshError: string | null;
  onDashboard: () => Promise<void>;
}) {
  const community = plan.toUpperCase() === "COMMUNITY";
  const checkoutReturnUrl = "/onboarding?step=plan";
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Badge variant={paid ? "default" : "secondary"}>
          {paid ? "Plan active" : "Required final step"}
        </Badge>
        <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
          {paid ? "Your plan is active" : "Choose the plan that fits your work"}
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          {paid
            ? `${plan} is active for this workspace. You can now finish onboarding.`
            : "Review the accounts you added, then select a plan. Checkout returns you here automatically."}
        </p>
      </div>

      <div className="-mx-4 border-zinc-950/10 border-t-[1.5px] border-dotted sm:-mx-5 dark:border-white/10" />

      <section
        aria-labelledby="connected-account-summary"
        className="space-y-2"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-sm" id="connected-account-summary">
            Connected accounts
          </h2>
          <span className="text-muted-foreground text-xs">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </span>
        </div>
        {accounts.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => {
              const name =
                account.displayName ?? account.username ?? account.platform;
              const handle = account.username
                ? account.username.startsWith("@")
                  ? account.username
                  : `@${account.username}`
                : account.profileId;
              return (
                <div
                  className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-background p-2.5"
                  key={account.id}
                >
                  <Avatar className="size-9 ring-1 ring-border/70">
                    {account.profileImage ? (
                      <AvatarImage
                        alt={`${name} profile picture`}
                        src={account.profileImage}
                      />
                    ) : null}
                    <AvatarFallback className="bg-background">
                      <SocialIcon
                        size="sm"
                        type={account.platform as SupportedSocialPlatform}
                      />
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {name}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {handle}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-border/70 border-dashed bg-muted/20 px-3 py-2.5 text-muted-foreground text-sm">
            No account connected yet. You can still choose a plan and connect
            accounts from the workspace.
          </p>
        )}
      </section>

      {paid ? (
        <div className="space-y-3">
          <output
            aria-live="polite"
            className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
          >
            <Icon
              className="shrink-0 text-emerald-600"
              icon={CheckmarkCircle01Icon}
              size={24}
            />
            <div>
              <p className="font-medium">
                {community ? "Community access confirmed" : "Payment confirmed"}
              </p>
              <p className="text-muted-foreground text-sm">
                {community
                  ? "This deployment does not require external checkout."
                  : "Continue to enter your workspace."}
              </p>
            </div>
          </output>
          <Button className="" onClick={onDashboard} variant="ghost">
            Go to dashboard
          </Button>
        </div>
      ) : isRefreshing ? (
        <output
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4"
        >
          <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          <div>
            <p className="font-medium">Payment confirmed, syncing…</p>
            <p className="text-muted-foreground text-sm">
              We’re activating your plan. Keep this page open.
            </p>
          </div>
        </output>
      ) : (
        <PricingCards checkoutReturnUrl={checkoutReturnUrl} compact />
      )}

      {refreshError ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm">{refreshError}</p>
          <Button
            className=""
            disabled={isRefreshing}
            onClick={onRefresh}
            variant="outline"
          >
            <Icon icon={RefreshIcon} size={16} />
            Refresh plan status
          </Button>
        </div>
      ) : null}
    </div>
  );
}
