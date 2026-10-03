"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { Input } from "@delulu/design-system/components/ui/input";
import { RadioGroup } from "@delulu/design-system/components/ui/radio-group";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Copy01Icon,
  LinkSquare02Icon,
  Loading03Icon,
  Tick02Icon,
} from "@delulu/icons";
import { differenceInCalendarDays, format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChoiceRadio } from "@/shared/choice-radio";
import { useApiClient } from "@/shell/providers/api-client";
import {
  useWorkspace,
  useWorkspaceSelection,
} from "@/shell/providers/workspace";
import { useMutationAtom, useResourceAtom } from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";

type Access = "anyone" | "workspace";

const ACCESS_OPTIONS: { value: Access; label: string; description: string }[] =
  [
    {
      value: "anyone",
      label: "Anyone with the link",
      description: "No sign-in needed. Good for clients and reviewers.",
    },
    {
      value: "workspace",
      label: "Workspace members only",
      description: "Viewers must sign in to this workspace.",
    },
  ];

export const shareUrl = (token: string) =>
  `${window.location.origin}/share/${token}`;

function expiryLabel(expiresAt: string, expired: boolean) {
  const date = new Date(expiresAt);
  if (expired) {
    return `Expired ${format(date, "MMM d")}`;
  }
  const days = differenceInCalendarDays(date, new Date());
  if (days <= 0) {
    return `Expires today at ${format(date, "h:mm a")}`;
  }
  return `Expires in ${days} day${days === 1 ? "" : "s"} (${format(date, "MMM d")})`;
}

interface ShareDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create and manage the share link for one post. */
export function ShareDialog({ postId, open, onOpenChange }: ShareDialogProps) {
  const { workspaceId } = useWorkspace();
  const { workspace: membership } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const { isViewer } = usePermissions();
  const workspace = workspaceId ?? "";
  const settingsOptions = resources.admin.workspace(workspace);
  const settings = useResourceAtom({
    ...settingsOptions,
    queryKey: settingsOptions.queryKey!,
    enabled: open && Boolean(workspaceId),
  });
  // Team workspaces default to members-only; admins can forbid public links.
  const publicAllowed = settings.data?.publicShareLinks !== false;
  const defaultAccess: Access =
    membership?.isPersonal && publicAllowed ? "anyone" : "workspace";
  const link = useResourceAtom({
    ...resources.shares.forPost(workspace, postId),
    enabled: open && Boolean(workspaceId),
  });
  const create = useMutationAtom(resources.shares.create(workspace, postId));
  const update = useMutationAtom(resources.shares.update(workspace, postId));
  const revoke = useMutationAtom(resources.shares.revoke(workspace, postId));
  const [chosenAccess, setAccess] = useState<Access | null>(null);
  const access =
    chosenAccess === "anyone" && !publicAllowed
      ? "workspace"
      : (chosenAccess ?? defaultAccess);
  const [copied, setCopied] = useState(false);
  const busy = create.isPending || update.isPending || revoke.isPending;
  const current = link.data;

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
    } catch (error) {
      toast.error(failure, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  };

  const createLink = () =>
    run(async () => {
      const created = await create.mutateAsync({ access });
      await copy(created.token);
    }, "Couldn't create the link");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share preview</DialogTitle>
          <DialogDescription>
            People with the link see the latest version of this post and can
            leave feedback.
          </DialogDescription>
        </DialogHeader>

        {link.isPending ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
            <Icon className="animate-spin" icon={Loading03Icon} size={16} />
            Loading link…
          </div>
        ) : link.isError ? (
          <div className="space-y-3 py-2">
            <p className="text-muted-foreground text-sm" role="alert">
              The share link couldn't be loaded.
            </p>
            <Button onClick={() => link.refetch()} variant="outline">
              Try again
            </Button>
          </div>
        ) : current ? (
          <div className="space-y-5">
            <div className="flex gap-2">
              <Input
                aria-label="Share link"
                className="min-w-0 flex-1 font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={shareUrl(current.token)}
              />
              <Button
                className="shrink-0 [@media(pointer:coarse)]:h-11"
                disabled={current.expired}
                onClick={() => copy(current.token)}
              >
                <Icon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>

            <RadioGroup
              aria-label="Who can open the link"
              className="gap-1"
              disabled={busy || isViewer}
              onValueChange={(value) =>
                run(
                  () => update.mutateAsync({ access: value as Access }),
                  "Couldn't change who can open the link"
                )
              }
              value={current.access}
            >
              {ACCESS_OPTIONS.map((option) => (
                <ChoiceRadio
                  description={
                    option.value === "anyone" && !publicAllowed
                      ? "Turned off by a workspace admin"
                      : option.description
                  }
                  disabled={option.value === "anyone" && !publicAllowed}
                  id={`share-access-${option.value}`}
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </RadioGroup>

            <div className="flex flex-wrap items-center justify-between gap-2 border-zinc-950/10 border-t-[1.5px] border-dotted pt-4 dark:border-white/10">
              <p
                className={
                  current.expired
                    ? "font-medium text-destructive text-sm"
                    : "text-muted-foreground text-sm"
                }
              >
                {expiryLabel(current.expiresAt, current.expired)}
              </p>
              {!isViewer && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => update.mutateAsync({ renew: true }),
                      "Couldn't renew the link"
                    )
                  }
                  variant={current.expired ? "default" : "outline"}
                >
                  {current.expired ? "Renew for 7 days" : "Extend 7 days"}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button asChild variant="ghost">
                <a
                  href={shareUrl(current.token)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon icon={LinkSquare02Icon} size={16} />
                  Open preview
                </a>
              </Button>
              {!isViewer && (
                <Button
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await revoke.mutateAsync(undefined);
                      toast.success("Link turned off");
                    }, "Couldn't turn off the link")
                  }
                  variant="ghost"
                >
                  Turn off link
                </Button>
              )}
            </div>
          </div>
        ) : isViewer ? (
          <p className="py-2 text-muted-foreground text-sm">
            This post hasn't been shared yet. Ask an editor to create a link.
          </p>
        ) : (
          <div className="space-y-4">
            <RadioGroup
              aria-label="Who can open the link"
              className="gap-1"
              onValueChange={(value) => setAccess(value as Access)}
              value={access}
            >
              {ACCESS_OPTIONS.map((option) => (
                <ChoiceRadio
                  description={
                    option.value === "anyone" && !publicAllowed
                      ? "Turned off by a workspace admin"
                      : option.description
                  }
                  disabled={option.value === "anyone" && !publicAllowed}
                  id={`share-access-${option.value}`}
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </RadioGroup>
            <p className="text-muted-foreground text-xs">
              Links last 7 days and can be extended or turned off any time.
            </p>
            <Button className="w-full" disabled={busy} onClick={createLink}>
              {create.isPending ? (
                <Icon className="animate-spin" icon={Loading03Icon} size={16} />
              ) : (
                <Icon icon={LinkSquare02Icon} size={16} />
              )}
              Create and copy link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
