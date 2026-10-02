"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@delulu/design-system/components/ui/avatar";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import { Icon } from "@delulu/design-system/providers/icon";
import { CheckmarkCircle01Icon } from "@delulu/icons";
import type { ConnectionView } from "@/shared/workspace-views";
import type { OnboardingGoal } from "./goal-step";

export function ReadyStep({
  goal,
  accounts,
}: {
  goal: OnboardingGoal;
  accounts: readonly ConnectionView[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="inline-flex items-center gap-1.5 font-medium text-emerald-700 text-xs uppercase tracking-wide dark:text-emerald-400">
          <Icon icon={CheckmarkCircle01Icon} size={16} />
          Accounts synced
        </p>
        <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
          {goal === "auto_dm"
            ? "Your Instagram workspace is ready"
            : "You’re ready to start publishing"}
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          Everything below is connected and ready. Next, choose the plan that
          fits your workflow.
        </p>
      </div>

      <div className="-mx-4 border-zinc-950/10 border-t-[1.5px] border-dotted sm:-mx-5 dark:border-white/10" />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-sm">Connected accounts</p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs">
            {accounts.length} total
          </span>
        </div>
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
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {handle}
                  </span>
                </span>
                <Icon
                  className="shrink-0 text-emerald-600"
                  icon={CheckmarkCircle01Icon}
                  size={18}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
