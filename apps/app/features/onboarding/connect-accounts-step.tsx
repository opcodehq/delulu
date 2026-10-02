"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@delulu/design-system/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@delulu/design-system/components/ui/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@delulu/design-system/components/ui/avatar";
import { Button } from "@delulu/design-system/components/ui/button";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
  RefreshIcon,
} from "@delulu/icons";
import { useState } from "react";
import { toast } from "sonner";
import type { OnboardingGoal } from "@/features/onboarding/goal-step";
import type { ConnectionView } from "@/shared/workspace-views";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useMutationAtom } from "@/shell/state/resources";
import { useFeatureFlag } from "@/shell/use-feature-flag";

const supportedPlatforms: SupportedSocialPlatform[] = [
  "INSTAGRAM",
  "TIKTOK",
  "LINKEDIN",
  "YOUTUBE",
  "THREADS",
  "FACEBOOK",
  "TWITTER",
];

export interface ConnectionCallbackState {
  readonly kind: "success" | "error" | "transfer_required";
  readonly provider: string | null;
  readonly username: string | null;
  readonly message?: string;
  readonly connectionId?: string;
  readonly sourceWorkspaceId?: string;
  readonly transferToken?: string;
}

function ConnectPlatformButton({
  platform,
  hasConnectedAccount,
}: {
  platform: SupportedSocialPlatform;
  hasConnectedAccount: boolean;
}) {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const connect = useMutationAtom(
    resources.connections.mint(workspaceId ?? "", platform)
  );

  return (
    <Button
      className="group w-full justify-start gap-2.5 rounded-lg border-border/70 bg-background px-3 text-left shadow-none transition-colors hover:border-foreground/20 hover:bg-muted/35"
      disabled={connect.isPending || !workspaceId}
      onClick={async () => {
        try {
          const result = await connect.mutateAsync({
            includeInsights: true,
            returnTarget: "onboarding-connect",
          });
          window.location.assign(result.url);
        } catch (error) {
          toast.error("Could not start the connection", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }}
      variant="outline"
    >
      <span className="flex size-7 shrink-0 items-center justify-center">
        {connect.isPending ? (
          <Icon
            className="animate-spin motion-reduce:animate-none"
            icon={Loading03Icon}
            size={17}
          />
        ) : (
          <SocialIcon size="sm" type={platform} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {platform.charAt(0) + platform.slice(1).toLowerCase()}
      </span>
      <span className="shrink-0 text-muted-foreground text-xs">
        {connect.isPending
          ? "Opening…"
          : hasConnectedAccount
            ? "Add another"
            : "Connect"}
      </span>
      <Icon
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        icon={ArrowRight01Icon}
        size={14}
      />
    </Button>
  );
}

function ConnectedAccountRow({
  account,
  onRemoved,
}: {
  account: ConnectionView;
  onRemoved: () => Promise<unknown>;
}) {
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const remove = useMutationAtom(
    resources.connections.remove(workspaceId ?? "")
  );
  const reconnect = useMutationAtom(
    resources.connections.mint(workspaceId ?? "", account.platform)
  );
  const name = account.displayName ?? account.username ?? account.platform;
  const accountHandle = account.username
    ? account.username.startsWith("@")
      ? account.username
      : `@${account.username}`
    : account.profileId;
  const platformName =
    account.platform.charAt(0) + account.platform.slice(1).toLowerCase();

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-background p-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
          <span className="block truncate font-medium text-sm">{name}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {accountHandle}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-[11px] text-emerald-700 dark:text-emerald-400">
          <Icon icon={CheckmarkCircle01Icon} size={13} />
          {platformName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          className="flex-1 px-3 sm:min-h-9 sm:flex-none"
          disabled={reconnect.isPending || !workspaceId}
          onClick={async () => {
            try {
              const result = await reconnect.mutateAsync({
                includeInsights: true,
                returnTarget: "onboarding-connect",
              });
              window.location.assign(result.url);
            } catch (error) {
              toast.error("Could not start the connection", {
                description: error instanceof Error ? error.message : undefined,
              });
            }
          }}
          size="sm"
          variant="ghost"
        >
          {reconnect.isPending ? "Opening…" : "Reconnect"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="flex-1 px-3 text-muted-foreground sm:min-h-9 sm:flex-none"
              disabled={remove.isPending}
              size="sm"
              variant="ghost"
            >
              {remove.isPending ? "Removing…" : "Disconnect"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{`Disconnect ${name}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                This disconnects the account from this workspace. You can
                connect its replacement immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">
                Keep account
              </AlertDialogCancel>
              <AlertDialogAction
                className="min-h-11"
                disabled={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(account.id);
                    await onRemoved();
                    toast.success("Account disconnected");
                  } catch (error) {
                    toast.error("Could not disconnect the account", {
                      description:
                        error instanceof Error ? error.message : undefined,
                    });
                  }
                }}
              >
                Disconnect account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function ConnectAccountsStep({
  goal,
  accounts,
  callback,
  isRefreshing,
  onRefresh,
  refreshError,
  requirementMet,
}: {
  goal: OnboardingGoal;
  accounts: readonly ConnectionView[];
  callback: ConnectionCallbackState | null;
  isRefreshing: boolean;
  onRefresh: () => Promise<unknown>;
  refreshError: string | null;
  requirementMet: boolean;
}) {
  const [transferCompleted, setTransferCompleted] = useState(false);
  const twitterEnabled = useFeatureFlag("twitter");
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const transfer = useMutationAtom(
    resources.connections.confirmTransfer(
      workspaceId ?? "",
      callback?.connectionId ?? ""
    )
  );
  const connectedPlatforms = new Set(
    accounts.map((account) => account.platform.toUpperCase())
  );
  const eligiblePlatforms =
    goal === "auto_dm"
      ? (["INSTAGRAM"] as const)
      : supportedPlatforms.filter(
          (platform) => platform !== "TWITTER" || twitterEnabled
        );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="font-medium text-primary text-xs uppercase tracking-wide">
          {goal === "auto_dm" ? "Instagram automation" : "Publishing channels"}
        </p>
        <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
          {goal === "auto_dm"
            ? "Connect the Instagram account you’ll automate"
            : "Connect your social accounts"}
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          {goal === "auto_dm"
            ? "Connect one or more Instagram accounts. We use official permissions and never receive your password."
            : "Add every channel you publish from now, or come back and connect more later."}
        </p>
      </div>

      <div className="-mx-4 border-zinc-950/10 border-t-[1.5px] border-dotted sm:-mx-5 dark:border-white/10" />

      {callback?.kind === "success" ? (
        <Alert className="border-emerald-500/25 bg-emerald-500/5" role="status">
          <Icon className="text-emerald-600" icon={CheckmarkCircle01Icon} />
          <AlertTitle className="whitespace-normal">
            {requirementMet ? "Account connected" : "Connected, syncing…"}
          </AlertTitle>
          <AlertDescription>
            {callback.username
              ? `${callback.username} was authenticated successfully.`
              : "The connection was authenticated successfully."}
          </AlertDescription>
        </Alert>
      ) : null}

      {callback?.kind === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Connection didn&apos;t finish</AlertTitle>
          <AlertDescription>
            <p>
              {callback.message ??
                "Nothing was changed. Try again when you’re ready."}
            </p>
            <Button
              className="mt-2"
              disabled={isRefreshing}
              onClick={onRefresh}
              variant="outline"
            >
              <Icon
                className={
                  isRefreshing
                    ? "animate-spin motion-reduce:animate-none"
                    : undefined
                }
                icon={RefreshIcon}
                size={16}
              />
              Refresh accounts
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {refreshError ? (
        <Alert variant="destructive">
          <AlertTitle>
            We couldn&apos;t confirm the latest account state
          </AlertTitle>
          <AlertDescription>
            <p>{refreshError}</p>
            <Button
              className="mt-2"
              disabled={isRefreshing}
              onClick={onRefresh}
              variant="outline"
            >
              <Icon
                className={
                  isRefreshing
                    ? "animate-spin motion-reduce:animate-none"
                    : undefined
                }
                icon={RefreshIcon}
                size={16}
              />
              Try refresh again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {callback?.kind === "transfer_required" && !transferCompleted ? (
        <Alert>
          <AlertTitle>Move this account to this workspace?</AlertTitle>
          <AlertDescription>
            <p>
              You just verified this account, but it is connected to another
              workspace. Moving it will disconnect it there.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                className=""
                disabled={
                  transfer.isPending ||
                  !(
                    callback.connectionId &&
                    (callback.transferToken || callback.sourceWorkspaceId)
                  )
                }
                onClick={async () => {
                  if (
                    !(
                      callback.connectionId &&
                      (callback.transferToken || callback.sourceWorkspaceId)
                    )
                  ) {
                    return;
                  }
                  try {
                    await transfer.mutateAsync({
                      sourceWorkspaceId: callback.sourceWorkspaceId,
                      transferToken: callback.transferToken,
                    });
                    await onRefresh();
                    setTransferCompleted(true);
                    toast.success("Account moved to this workspace");
                  } catch (error) {
                    toast.error("Could not move the account", {
                      description:
                        error instanceof Error ? error.message : undefined,
                    });
                  }
                }}
              >
                {transfer.isPending ? "Moving…" : "Move account"}
              </Button>
              <Button asChild className="" variant="outline">
                <Link href="/socials">Review connected accounts</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {accounts.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-sm">Connected accounts</p>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-400">
              {accounts.length} connected
            </span>
          </div>
          <div className="grid gap-2">
            {accounts.map((account) => (
              <ConnectedAccountRow
                account={account}
                key={account.id}
                onRemoved={onRefresh}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-medium text-sm">
              {accounts.length > 0 ? "Add another account" : "Choose a network"}
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Each connection opens securely in the same tab.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {eligiblePlatforms.map((platform) => (
            <ConnectPlatformButton
              hasConnectedAccount={connectedPlatforms.has(platform)}
              key={platform}
              platform={platform}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
