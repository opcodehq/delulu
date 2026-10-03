"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { toast } from "sonner";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom, useResourceAtom } from "@/shell/state/resources";

/**
 * Team workspaces only: admins decide whether post previews may be shared
 * with anyone holding the link, or only with signed-in members.
 */
export function SharingPolicy() {
  const { resources } = useApiClient();
  const selected = useWorkspaceSelection();
  const workspaceId = selected.workspaceId ?? "";
  const options = resources.admin.workspace(workspaceId);
  const query = useResourceAtom({
    ...options,
    queryKey: options.queryKey!,
    enabled: !!selected.workspaceId,
  });
  const update = useMutationAtom(resources.admin.updateWorkspace(workspaceId));
  const role = selected.workspace?.role;
  const canManage = role === "owner" || role === "admin";

  if (!query.data || query.data.isPersonal) {
    return null;
  }

  const setAllowed = async (publicShareLinks: boolean) => {
    try {
      // The mutation refreshes the workspace query itself.
      await update.mutateAsync({ publicShareLinks });
      toast.success(
        publicShareLinks
          ? "Public share links allowed"
          : "Share links are now members-only"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't update sharing"
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sharing</CardTitle>
        <CardDescription>
          Control who can open post preview links from this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <label
          className="flex items-center justify-between gap-4"
          htmlFor="public-share-links"
        >
          <span>
            <span className="block font-medium text-sm">
              Allow public share links
            </span>
            <span className="text-muted-foreground text-sm">
              When off, every link is members-only and existing public links
              stop working for people outside the workspace.
            </span>
          </span>
          <Switch
            checked={query.data.publicShareLinks}
            disabled={!canManage || update.isPending}
            id="public-share-links"
            onCheckedChange={setAllowed}
          />
        </label>
        {!canManage && (
          <p className="text-muted-foreground text-xs">
            Only workspace owners and admins can change this.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
