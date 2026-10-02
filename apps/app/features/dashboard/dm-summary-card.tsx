"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { MailSend01Icon } from "@delulu/icons";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export function DmSummaryCard() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const workspaceId = workspace.workspaceId ?? "";
  const scope = { workspaceId, platform: "instagram" as const, category: "dm" };
  const automationOptions = resources.automations.list(scope, {
    limit: 100,
    offset: 0,
  });
  const usageResource = resources.billing.usage(workspaceId);
  const automations = useResourceAtom({
    suspense: false,
    ...automationOptions,
    queryKey: automationOptions.queryKey!,
    enabled: !!workspaceId,
  });
  const usage = useResourceAtom({
    suspense: false,
    ...usageResource,
    queryKey: usageResource.queryKey!,
    enabled: !!workspaceId,
  });
  const items = automations.data?.data ?? [];

  if (items.length === 0) {
    return null;
  }

  const active = items.filter((automation) => automation.enabled).length;
  const totalDmsSent = items.reduce(
    (total, automation) => total + automation.totalDmsSent,
    0
  );

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="text-primary" icon={MailSend01Icon} size={20} />
          </div>
          <div>
            <p className="font-medium text-sm">DM Automations</p>
            <p className="text-muted-foreground text-xs">
              {active} active · {totalDmsSent.toLocaleString()} DMs sent all
              time
            </p>
            {usage.data && (
              <p className="mt-1 text-muted-foreground text-xs">
                {usage.data.usage.dmsSent.toLocaleString()} sent ·{" "}
                {usage.data.usage.dmsSkipped.toLocaleString()} skipped this
                period
              </p>
            )}
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/automations">View automations</Link>
        </Button>
      </div>
    </div>
  );
}
