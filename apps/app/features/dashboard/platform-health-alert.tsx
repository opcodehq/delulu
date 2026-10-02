"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { Alert01Icon } from "@delulu/icons";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export function PlatformHealthAlert() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const workspaceId = workspace.workspaceId ?? "";
  const options = resources.connections.list(workspaceId, { limit: 100 });
  const query = useResourceAtom({
    suspense: false,
    ...options,
    queryKey: options.queryKey!,
    enabled: !!workspace.workspaceId,
    staleTime: 60_000,
  });

  const now = Date.now();
  const expired = (query.data?.data ?? []).filter(
    (account) =>
      account.expiresAt && new Date(account.expiresAt).getTime() <= now
  ).length;

  if (expired === 0) {
    return null;
  }

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Icon
          className="text-amber-600 dark:text-amber-400"
          icon={Alert01Icon}
          size={16}
        />
        <p className="font-medium text-sm">
          {expired} account{expired === 1 ? "" : "s"} need
          {expired === 1 ? "s" : ""} reconnecting
        </p>
        <Button
          asChild
          className="ml-auto text-muted-foreground"
          size="sm"
          variant="ghost"
        >
          <Link href="/socials">Reconnect</Link>
        </Button>
      </div>
    </Card>
  );
}
