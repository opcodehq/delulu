"use client";

import type { AutomationScope } from "@delulu/client";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  ArrowLeft01Icon,
  Comment01Icon,
  Loading03Icon,
  MailSend01Icon,
  TickDouble01Icon,
} from "@delulu/icons";
import { useMemo } from "react";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";
import { useApiClient } from "@/shell/providers/api-client";
import { useResourceAtom } from "@/shell/state/resources";
import {
  automationFromResource,
  getApiErrorDetails,
  useAutomationWorkspace,
} from "./automation-resource";

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function AnalyticsContent({
  automationId,
  scope,
}: {
  automationId: string;
  scope: AutomationScope;
}) {
  const { resources } = useApiClient();
  const detailResource = useMemo(
    () => resources.automations.get(scope, automationId),
    [automationId, resources, scope]
  );
  const runsOptions = useMemo(
    () => resources.automations.runs(scope, { automationId, limit: 50 }),
    [automationId, resources, scope]
  );
  const automationQuery = useResourceAtom({
    ...detailResource,
    queryKey: detailResource.queryKey!,
  });
  const runsQuery = useResourceAtom({
    ...runsOptions,
    queryKey: runsOptions.queryKey!,
  });

  if (automationQuery.isPending) {
    return (
      <PageShell page="Loading..." pages={["Automations"]}>
        <div className="flex h-64 items-center justify-center">
          <Icon
            className="animate-spin text-muted-foreground"
            icon={Loading03Icon}
            size={24}
          />
        </div>
      </PageShell>
    );
  }

  if (automationQuery.isError) {
    const details = getApiErrorDetails(automationQuery.error);
    const notFound = details.kind === "not-found";
    return (
      <PageShell
        page={notFound ? "Not Found" : "Unavailable"}
        pages={["Automations"]}
      >
        <div className="flex h-64 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-medium">
            {details.kind === "permission"
              ? "You do not have permission to view this automation"
              : notFound
                ? "Automation not found"
                : "Automation analytics could not be loaded"}
          </p>
          <p className="max-w-md text-muted-foreground text-sm">
            {details.message}
          </p>
          {details.kind === "transport" ? (
            <Button onClick={() => automationQuery.refetch()} variant="outline">
              Try again
            </Button>
          ) : null}
          <Link href="/automations">
            <Button variant="link">Back to Automations</Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  const automation = automationFromResource(automationQuery.data);
  const runs = runsQuery.data?.data ?? [];
  return (
    <PageShell
      actions={
        <Link href="/automations">
          <Button size="sm" variant="outline">
            <Icon icon={ArrowLeft01Icon} size={16} />
            Back
          </Button>
        </Link>
      }
      description="Automation analytics"
      page={automation.name}
      pages={["Automations"]}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Icon
                className="text-blue-600 dark:text-blue-400"
                icon={Comment01Icon}
                size={20}
              />
            </div>
            <div>
              <p className="font-semibold text-foreground text-xl">
                {automation.totalTriggered}
              </p>
              <p className="text-muted-foreground text-xs">Total Triggered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Icon
                className="text-green-600 dark:text-green-400"
                icon={MailSend01Icon}
                size={20}
              />
            </div>
            <div>
              <p className="font-semibold text-foreground text-xl">
                {automation.totalDmsSent}
              </p>
              <p className="text-muted-foreground text-xs">DMs Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Icon
                className="text-purple-600 dark:text-purple-400"
                icon={TickDouble01Icon}
                size={20}
              />
            </div>
            <div>
              <p className="font-semibold text-foreground text-xl">
                {automation.totalTriggered > 0
                  ? Math.round(
                      (automation.totalDmsSent / automation.totalTriggered) *
                        100
                    )
                  : 0}
                %
              </p>
              <p className="text-muted-foreground text-xs">Success Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <PageSection>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Run history</CardTitle>
          </CardHeader>
          <CardContent>
            {runsQuery.isPending ? (
              <div className="flex justify-center py-12">
                <Icon
                  className="animate-spin text-muted-foreground"
                  icon={Loading03Icon}
                  size={20}
                />
              </div>
            ) : runsQuery.isError ? (
              <div className="py-10 text-center">
                <p className="text-muted-foreground text-sm">
                  {getApiErrorDetails(runsQuery.error).message}
                </p>
                <Button
                  className="mt-2"
                  onClick={() => runsQuery.refetch()}
                  variant="outline"
                >
                  Retry history
                </Button>
              </div>
            ) : runs.length > 0 ? (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div
                    className="flex items-start gap-4 rounded-lg border border-border bg-card/50 p-4"
                    key={run.id}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant={
                            run.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {run.status}
                        </Badge>
                        {run.error ? (
                          <span className="truncate text-destructive text-sm">
                            {run.error}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="shrink-0 text-muted-foreground text-xs">
                      {formatDate(run.startedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="mb-4 rounded-full bg-muted/50 p-4">
                  <Icon
                    className="text-muted-foreground"
                    icon={Comment01Icon}
                    size={24}
                  />
                </div>
                <p className="text-muted-foreground">No activity yet</p>
                <p className="text-muted-foreground text-sm">
                  Runs will appear here when this automation is triggered
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </PageSection>
    </PageShell>
  );
}

export function AutomationAnalytics({
  automationId,
}: {
  automationId: string;
}) {
  const workspace = useAutomationWorkspace();
  if (workspace.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Icon
          className="animate-spin text-muted-foreground"
          icon={Loading03Icon}
          size={24}
        />
      </div>
    );
  }
  if (workspace.isError || !workspace.scope) {
    const details = getApiErrorDetails(
      workspace.error ?? new Error("No workspace is available for this account")
    );
    return (
      <p className="p-6 text-center text-muted-foreground">{details.message}</p>
    );
  }
  return (
    <AnalyticsContent automationId={automationId} scope={workspace.scope} />
  );
}
