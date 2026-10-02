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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import { Icon } from "@delulu/design-system/providers/icon";
import { Delete02Icon, MoreVerticalIcon, RefreshIcon } from "@delulu/icons";
import { useState } from "react";
import { toast } from "sonner";
import { normalizePlatform } from "@/features/publishing/social-platform";
import type { ConnectionView } from "@/shared/workspace-views";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom } from "@/shell/state/resources";

export function AccountActionsMenu({
  account,
  onDisconnect,
  disconnecting,
}: {
  account: ConnectionView;
  onDisconnect: () => Promise<void>;
  disconnecting: boolean;
}) {
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const platform = normalizePlatform(account.platform);
  const reconnect = useMutationAtom(
    resources.connections.mint(workspaceId ?? "", platform ?? account.platform)
  );

  const handleReconnect = async () => {
    try {
      const result = await reconnect.mutateAsync({ includeInsights: true });
      window.location.assign(result.url);
    } catch (error) {
      toast.error("Couldn't start reconnect", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Account actions"
            className="text-muted-foreground"
            size="icon"
            variant="ghost"
          >
            <Icon icon={MoreVerticalIcon} size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            disabled={reconnect.isPending}
            onSelect={(event) => {
              event.preventDefault();
              handleReconnect();
            }}
          >
            <Icon icon={RefreshIcon} size={16} />
            Reconnect
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            variant="destructive"
          >
            <Icon icon={Delete02Icon} size={16} />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this account?</AlertDialogTitle>
            <AlertDialogDescription>
              Scheduled posts targeting this account may fail to publish until
              you reconnect it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={disconnecting}
              onClick={(event) => {
                event.preventDefault();
                onDisconnect().then(() => setDeleteOpen(false));
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
