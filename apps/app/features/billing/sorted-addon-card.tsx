"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Progress } from "@delulu/design-system/components/ui/progress";
import { useSubscription } from "@/features/billing/use-subscription";
import { OperationsError } from "@/features/workspace/query-state";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export function SortedAddonCard() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const subscription = useSubscription();
  const options = resources.billing.usage(workspace.workspaceId ?? "");
  const query = useResourceAtom({
    ...options,
    queryKey: options.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const error = workspace.error ?? subscription.error ?? query.error;

  if (error) {
    return (
      <OperationsError
        error={error}
        onRetry={async () => {
          await query.refetch();
          subscription.retry();
        }}
      />
    );
  }
  if (workspace.isLoading || subscription.isLoading || query.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sorted Extension</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading usage…</p>
        </CardContent>
      </Card>
    );
  }

  const sortedAddon = subscription.subscription?.addons.sorted;
  const isSubscribed =
    sortedAddon === true ||
    (typeof sortedAddon === "object" &&
      sortedAddon !== null &&
      "status" in sortedAddon &&
      ["active", "trialing", "on_trial"].includes(
        String((sortedAddon as { status?: unknown }).status)
      ));
  const used = query.data?.usage.transcriptionsUsed ?? 0;
  const limit = isSubscribed ? 1000 : 10;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <img alt="Sorted" className="h-8 w-8 rounded-lg" src="/favicon.ico" />
          <div>
            <CardTitle className="flex items-center gap-2">
              Sorted Extension{isSubscribed && <Badge>Pro</Badge>}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Instagram Reel Sorter & Transcriber
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-muted-foreground">
              Transcriptions this month
            </span>
            <span className="font-medium">
              {used.toLocaleString()}/{limit.toLocaleString()}
            </span>
          </div>
          <Progress value={Math.min(100, (used / limit) * 100)} />
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {isSubscribed ? "Your add-on is active" : "Pro add-on"}
          </p>
          <p className="mt-1 text-muted-foreground">
            Usage is pooled with the workspace billing owner.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-1">
        <Button disabled>
          {isSubscribed ? "Management unavailable" : "Checkout unavailable"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Add-on checkout and portal actions are not yet exposed by the typed
          API.
        </p>
      </CardFooter>
    </Card>
  );
}
