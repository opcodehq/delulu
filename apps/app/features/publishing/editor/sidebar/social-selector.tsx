"use client";

import {
  DEFAULT_INSTAGRAM_SETTINGS,
  DEFAULT_TIKTOK_SETTINGS,
  DEFAULT_YOUTUBE_SETTINGS,
} from "@delulu/core/publishing/constants/settings";
import type { SocialType } from "@delulu/core/publishing/post";
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
import {
  Frame,
  FrameHeader,
  FrameTitle,
} from "@delulu/design-system/components/ui/frame";
import { cn } from "@delulu/design-system/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChannelMark } from "@/features/publishing/editor/sidebar/social-icon";
import {
  normalizePlatform,
  platformLabel,
} from "@/features/publishing/social-platform";
import {
  postActions,
  useSelectedSocialProviders,
  useStore,
} from "@/features/publishing/store";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

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
  if (socialType === "YOUTUBE" && !state.getProviderSettings(account.id)) {
    state.setProviderSettings(account.id, {
      socialProviderId: account.id,
      type: "YOUTUBE",
      settings: DEFAULT_YOUTUBE_SETTINGS,
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

export default function SocialSelector() {
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
    <Frame aria-labelledby="composer-channels" role="region">
      <FrameHeader className="justify-between">
        <FrameTitle id="composer-channels">
          Channels
          {accounts.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {selectedIds.size} of {accounts.length}
            </span>
          )}
        </FrameTitle>
        {accounts.length > 1 && !allSelected && (
          <Button
            className="-mr-2 text-muted-foreground [@media(pointer:coarse)]:h-11"
            onClick={handleSelectAll}
            variant="ghost"
          >
            Select all
          </Button>
        )}
      </FrameHeader>

      <div className="p-2 sm:p-3">
        {accounts.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1">
            <p className="text-muted-foreground text-sm">
              Connect a social account to start posting.
            </p>
            <Button asChild variant="outline">
              <Link href="/socials">Connect account</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {accounts.map((account) => (
              <SocialSelectorChip
                account={account}
                key={account.id}
                selected={selectedIds.has(account.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}

function SocialSelectorChip({
  account,
  selected,
}: {
  account: AccountLike;
  selected: boolean;
}) {
  const post = useStore((state) => state.post);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const name = accountName(account);

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

  return (
    <>
      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This account has its own customized content. Removing it deletes
              that version.
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

      <button
        aria-pressed={selected}
        className={cn(
          "group flex min-h-10 items-center gap-2 rounded-lg py-1.5 pr-3 pl-1.5 text-sm outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 [@media(pointer:coarse)]:min-h-11",
          selected
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={handleSelect}
        title={platformLabel(
          normalizePlatform(account.platform),
          account.username
        )}
        type="button"
      >
        <ChannelMark
          className={cn(
            "size-7 transition-[filter,opacity]",
            !selected &&
              "opacity-40 grayscale group-hover:opacity-70 group-hover:grayscale-0"
          )}
          platform={account.platform}
        />
        <span className="max-w-[11rem] truncate">{name}</span>
      </button>
    </>
  );
}
