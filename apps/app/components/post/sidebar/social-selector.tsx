"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@delulu/design-system/components/ui/alert-dialog";
import { Button } from "@delulu/design-system/components/ui/button";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import { socialBackgroundColors } from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Settings01Icon, UserGroupIcon } from "@delulu/icons";
import {
  DEFAULT_INSTAGRAM_SETTINGS,
  DEFAULT_TIKTOK_SETTINGS,
} from "@delulu/validators/constants/settings";
import type { SocialType } from "@delulu/validators/post";
import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/components/providers/api-client";
import { useWorkspace } from "@/components/providers/workspace";
import { normalizePlatform } from "@/lib/social-platform";
import { useResourceAtom } from "@/state/resources";
import {
  postActions,
  useAutomationConfig,
  useSelectedSocialProviders,
  useStore,
} from "@/store/post";
import { PlatformSettingsDialog } from "./platform-settings-dialog";

interface AccountLike {
  id: string;
  platform: string;
  displayName: string | null;
  username: string | null;
  profileId: string;
}

const accountName = (account: AccountLike) =>
  account.displayName ?? account.username ?? account.profileId;

/** Add a provider to the post and seed platform defaults (mirrors item logic). */
function addProvider(account: AccountLike) {
  const socialType = account.platform as SocialType;
  postActions.addSocialProvider({
    socialId: account.id,
    name: accountName(account),
    socialType,
  });
  const state = useStore.getState();
  if (socialType === "TIKTOK" && !state.getProviderSettings(account.id)) {
    state.setProviderSettings(account.id, {
      socialProviderId: account.id,
      type: "TIKTOK",
      settings: DEFAULT_TIKTOK_SETTINGS,
    });
  }
  if (socialType === "INSTAGRAM" && !state.getProviderSettings(account.id)) {
    state.setProviderSettings(account.id, {
      socialProviderId: account.id,
      type: "INSTAGRAM",
      settings: DEFAULT_INSTAGRAM_SETTINGS,
    });
  }
}

interface SocialSelectorProps {
  surface?: "plain" | "composer";
  showPlatformSettings?: boolean;
}

export default function SocialSelector({
  surface = "plain",
  showPlatformSettings = true,
}: SocialSelectorProps = {}) {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const socialProviders = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
  });
  const accounts = socialProviders.data?.data ?? [];
  const selectedProviders = useSelectedSocialProviders();

  // Validate that selected providers still exist in the database
  const validatedSelectedProviders = useMemo(() => {
    if (!socialProviders.data) {
      return selectedProviders;
    }
    const validIds = new Set(accounts.map((p) => p.id));
    const valid = selectedProviders.filter((p) => validIds.has(p.socialId));
    if (valid.length !== selectedProviders.length) {
      useStore.getState().cleanupDeletedProviders(Array.from(validIds));
    }
    return valid;
  }, [accounts, socialProviders.data, selectedProviders]);

  useEffect(() => {
    if (!socialProviders.data) {
      return;
    }
    const removed =
      selectedProviders.length - validatedSelectedProviders.length;
    if (removed > 0) {
      toast.error(
        `${removed} social account${removed > 1 ? "s were" : " was"} disconnected and removed from this post.`
      );
    }
  }, [
    socialProviders,
    selectedProviders.length,
    validatedSelectedProviders.length,
  ]);

  const selectedIds = new Set(
    validatedSelectedProviders.map((p) => p.socialId)
  );
  const allSelected =
    accounts.length > 0 && selectedIds.size === accounts.length;

  const handleSelectAll = () => {
    for (const account of accounts) {
      if (!selectedIds.has(account.id)) {
        addProvider(account);
      }
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        surface === "composer" && "border-border/60 border-b px-1 pb-3"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">Publish to</h3>
          {surface === "composer" && (
            <p className="mt-0.5 text-muted-foreground text-xs">
              Choose one or more accounts
            </p>
          )}
        </div>
        {accounts.length > 1 && !allSelected && (
          <button
            className="flex min-h-11 items-center gap-1 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground sm:min-h-8 [@media(pointer:coarse)]:min-h-11"
            onClick={handleSelectAll}
            type="button"
          >
            <Icon icon={UserGroupIcon} size={13} />
            Select all
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-start gap-1 rounded-md border border-dashed p-2">
          <p className="text-muted-foreground text-xs">No accounts connected</p>
          <Button
            asChild
            className="h-11 rounded-md px-2 text-xs sm:h-8 [@media(pointer:coarse)]:h-11"
            size="sm"
            variant="link"
          >
            <Link href="/socials">Connect an account →</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <SocialSelectorChip
              account={account}
              key={account.id}
              selected={selectedIds.has(account.id)}
              showPlatformSettings={showPlatformSettings}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function hasSettings(platform: SocialType): boolean {
  return platform === "TIKTOK" || platform === "INSTAGRAM";
}

function SocialSelectorChip({
  account,
  selected,
  showPlatformSettings,
}: {
  account: AccountLike;
  selected: boolean;
  showPlatformSettings: boolean;
}) {
  const post = useStore((state) => state.post);
  const automationConfig = useAutomationConfig(account.id);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  const socialType = account.platform as SocialType;
  const displayPlatform = normalizePlatform(account.platform);
  const name = accountName(account);
  const showGear = showPlatformSettings && selected && hasSettings(socialType);

  const hasAlternativeContent = post.alternativeContent.some(
    (content) => content.socialProvider.socialId === account.id
  );

  const handleSelect = () => {
    if (selected) {
      if (hasAlternativeContent) {
        setShowDeleteDialog(true);
      } else {
        postActions.removeSocialProvider(account.id);
      }
    } else {
      addProvider(account);
    }
  };

  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setShowSettingsDialog(true);
  };

  return (
    <>
      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove social network</AlertDialogTitle>
            <AlertDialogDescription>
              This account has custom content. Removing it will delete all its
              custom content. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                postActions.removeSocialProvider(account.id);
                setShowDeleteDialog(false);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="relative inline-flex">
        <button
          aria-pressed={selected}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-md border py-1 pl-1 font-medium text-xs transition-[background-color,border-color,color,box-shadow] active:scale-[0.98] sm:min-h-8 [@media(pointer:coarse)]:min-h-11",
            showGear ? "pr-11 sm:pr-8" : "pr-2",
            selected
              ? "border-primary/30 bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          onClick={handleSelect}
          type="button"
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded",
              displayPlatform
                ? socialBackgroundColors[displayPlatform]
                : "bg-muted"
            )}
          >
            {displayPlatform && (
              <SocialIcon
                className="size-3 text-white"
                type={displayPlatform}
              />
            )}
          </span>
          <span className="max-w-[10rem] truncate">{name}</span>
        </button>
        {showGear && (
          <button
            aria-label="Platform settings"
            className="absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 place-items-center rounded-md text-primary/70 transition-colors after:absolute after:-inset-0.5 hover:bg-primary/15 hover:text-primary sm:size-7 sm:after:inset-0 [@media(pointer:coarse)]:size-11"
            onClick={handleSettingsClick}
            type="button"
          >
            <Icon icon={Settings01Icon} size={13} />
            {socialType === "INSTAGRAM" && automationConfig && (
              <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-green-500 ring-1 ring-card" />
            )}
          </button>
        )}
      </div>

      <PlatformSettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        platform={socialType}
        platformName={name}
        socialId={account.id}
      />
    </>
  );
}
