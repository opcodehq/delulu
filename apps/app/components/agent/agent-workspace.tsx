"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Progress } from "@delulu/design-system/components/ui/progress";
import { ScrollArea } from "@delulu/design-system/components/ui/scroll-area";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { cn } from "@delulu/design-system/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/components/providers/api-client";
import { useWorkspace } from "@/components/providers/workspace";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/state/resources";

const activeStatuses = new Set([
  "queued",
  "submitted",
  "running",
  "interrupting",
]);

const statusVariant = (status: string) => {
  if (status === "completed") {
    return "green" as const;
  }
  if (status === "failed" || status === "timed_out") {
    return "red" as const;
  }
  if (status === "interrupted") {
    return "zinc" as const;
  }
  return "blue" as const;
};

const percentUsed = (used: string, budget: string) => {
  const total = Number(budget);
  return total > 0 ? Math.min(100, (Number(used) / total) * 100) : 0;
};

export function AgentWorkspace() {
  const { resources } = useApiClient();
  const { workspaceId } = useWorkspace();
  const registry = useResourceRegistry();
  const id = workspaceId ?? "";
  const workspaceResource = resources.agent.workspace(id);
  const runsResource = resources.agent.runs(id);
  const workspace = useResourceAtom({
    ...workspaceResource,
    enabled: Boolean(workspaceId),
  });
  const runs = useResourceAtom({
    ...runsResource,
    enabled: Boolean(workspaceId && workspace.data),
    staleTime: 2000,
  });
  const usage = useResourceAtom({
    ...resources.agent.usage(id),
    enabled: Boolean(workspaceId && workspace.data),
    staleTime: 5000,
  });
  const rituals = useResourceAtom({
    ...resources.agent.rituals(id),
    enabled: Boolean(workspaceId && workspace.data),
  });
  const memories = useResourceAtom({
    ...resources.agent.memories(id),
    enabled: Boolean(workspaceId && workspace.data),
  });
  const createWorkspace = useMutationAtom(resources.agent.createWorkspace(id));
  const start = useMutationAtom(resources.agent.runAgent(id));
  const interrupt = useMutationAtom(resources.agent.interrupt(id));
  const resolveApproval = useMutationAtom(resources.agent.resolveApproval(id));
  const updateRitual = useMutationAtom(resources.agent.updateRitual(id));
  const resolveMemory = useMutationAtom(resources.agent.resolveMemory(id));
  const [message, setMessage] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const agentRuns = runs.data ?? [];

  useEffect(() => {
    if (selectedRunId && agentRuns.some((run) => run.id === selectedRunId)) {
      return;
    }
    setSelectedRunId(agentRuns[0]?.id ?? null);
  }, [agentRuns, selectedRunId]);

  const runResource = resources.agent.run(id, selectedRunId ?? "");
  const eventsResource = resources.agent.events(id, selectedRunId ?? "");
  const run = useResourceAtom({
    ...runResource,
    enabled: Boolean(workspaceId && selectedRunId),
    staleTime: 1000,
  });
  const events = useResourceAtom({
    ...eventsResource,
    enabled: Boolean(workspaceId && selectedRunId),
    staleTime: 1000,
  });
  const approvals = useResourceAtom({
    ...resources.agent.approvals(id, selectedRunId ?? ""),
    enabled: Boolean(
      workspaceId && selectedRunId && run.data?.status === "waiting_approval"
    ),
    staleTime: 1000,
  });
  const selectedRun =
    run.data ?? agentRuns.find((item) => item.id === selectedRunId) ?? null;
  const isActive = Boolean(
    selectedRun && activeStatuses.has(selectedRun.status)
  );
  const pendingApprovals = approvals.data ?? [];

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const timer = window.setInterval(() => {
      Promise.all([run.refetch(), events.refetch(), runs.refetch()]).catch(
        () => undefined
      );
    }, 2000);
    return () => window.clearInterval(timer);
  }, [events.refetch, isActive, run.refetch, runs.refetch]);

  const memoryCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const memory of memories.data ?? []) {
      result.set(memory.category, (result.get(memory.category) ?? 0) + 1);
    }
    return result;
  }, [memories.data]);
  const pendingMemories = (memories.data ?? []).filter(
    (memory) => memory.status === "proposed" && memory.requiresConfirmation
  );

  const startRun = async () => {
    const request = message.trim();
    if (!request) {
      return;
    }
    try {
      const created = await start.mutateAsync({
        message: request,
        idempotencyKey: crypto.randomUUID(),
        threadId: selectedRun?.chatKey.startsWith("web:")
          ? selectedRun.chatKey.slice("web:".length)
          : crypto.randomUUID(),
      });
      setMessage("");
      setSelectedRunId(created.id);
      await Promise.all([runs.refetch(), usage.refetch()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start the agent"
      );
    }
  };

  const decideApproval = async (
    runId: string,
    code: string,
    decision: "approved" | "rejected"
  ) => {
    try {
      const result = await resolveApproval.mutateAsync({
        id: runId,
        payload: { code, decision },
      });
      toast.success(result.message);
      await Promise.all([
        run.refetch(),
        runs.refetch(),
        events.refetch(),
        approvals.refetch(),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not ${decision === "approved" ? "approve" : "reject"} the action`
      );
    }
  };

  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="text-muted-foreground text-sm">
          Choose a workspace to open its Content HQ.
        </CardContent>
      </Card>
    );
  }

  if (!workspace.data) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Create your Content HQ</CardTitle>
          <CardDescription className="max-w-2xl leading-relaxed">
            Start a durable agent workspace for your voice, strategy, research,
            drafts and proactive content rituals. It wakes when needed and keeps
            your context between conversations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="min-h-11"
            disabled={createWorkspace.isPending}
            onClick={async () => {
              try {
                await createWorkspace.mutateAsync(undefined);
                await registry.invalidateResources({
                  queryKey: workspaceResource.queryKey,
                });
                toast.success("Content HQ is ready");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not create Content HQ"
                );
              }
            }}
          >
            {createWorkspace.isPending ? "Preparing…" : "Create Content HQ"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const monthlyUsed = usage.data
    ? percentUsed(usage.data.monthlyUsedMicros, usage.data.monthlyBudgetMicros)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Content HQ</CardTitle>
              <CardDescription className="mt-1">
                Your voice, strategy, working memory and content operations.
              </CardDescription>
            </div>
            <Badge size="sm" variant="green">
              {workspace.data.state}
            </Badge>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Agent usage</CardTitle>
            <CardDescription>
              {usage.data?.accessTier ?? workspace.data.accessTier}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={monthlyUsed} />
            <p className="text-muted-foreground text-xs">
              {Math.round(monthlyUsed)}% of this month&apos;s included usage
              {usage.data?.accessTier === "trial"
                ? ` · ${usage.data.trialTurnsRemaining} trial turns left`
                : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-h-0 gap-0 overflow-hidden py-0">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b px-5 py-3">
            <div>
              <p className="font-medium text-sm">Work with your agent</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Research, plan, draft and prepare actions for approval
              </p>
            </div>
            {selectedRun ? (
              <Badge size="sm" variant={statusVariant(selectedRun.status)}>
                {selectedRun.status.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </div>

          <ScrollArea className="min-h-0 flex-1" viewportClassName="h-[500px]">
            <div className="space-y-5 p-5">
              {selectedRun ? (
                <>
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground text-sm leading-relaxed">
                    {selectedRun.objective}
                  </div>
                  {(events.data ?? [])
                    .filter((event) => event.content && event.role !== "user")
                    .map((event) => (
                      <div
                        className={cn(
                          "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed",
                          event.role === "assistant"
                            ? "border bg-background"
                            : "bg-muted font-mono text-muted-foreground text-xs"
                        )}
                        key={event.id}
                      >
                        {event.content}
                      </div>
                    ))}
                  {isActive ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <span className="size-2 animate-pulse rounded-full bg-blue-500" />
                      Agent is working…
                    </div>
                  ) : null}
                  {selectedRun.status === "waiting_approval" ? (
                    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                      <p>
                        This run prepared an external action. Review the agent
                        output, then approve or reject it here.
                      </p>
                      {pendingApprovals.map((approval) => (
                        <div
                          className="flex flex-wrap items-center gap-2"
                          key={approval.id}
                        >
                          <span className="mr-auto font-medium">
                            {approval.summary}
                          </span>
                          <Button
                            disabled={resolveApproval.isPending}
                            onClick={() =>
                              decideApproval(
                                selectedRun.id,
                                approval.code,
                                "approved"
                              )
                            }
                            type="button"
                          >
                            Approve action
                          </Button>
                          <Button
                            disabled={resolveApproval.isPending}
                            onClick={() =>
                              decideApproval(
                                selectedRun.id,
                                approval.code,
                                "rejected"
                              )
                            }
                            type="button"
                            variant="outline"
                          >
                            Reject
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!isActive && selectedRun.output ? (
                    <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-background px-4 py-3 text-sm leading-relaxed">
                      {selectedRun.output}
                    </div>
                  ) : null}
                  {selectedRun.error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                      {selectedRun.error}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
                  <h2 className="font-medium text-lg">
                    What should we create?
                  </h2>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    Ask for research, a content plan, a post in your voice or a
                    multi-platform campaign. Your context persists
                    automatically.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          <form
            className="border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              startRun().catch(() => undefined);
            }}
          >
            <Textarea
              aria-label="Message your agent"
              className="min-h-24 resize-none"
              disabled={isActive || start.isPending}
              maxLength={20_000}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                isActive
                  ? "The agent is finishing this run…"
                  : "Research this topic and draft three posts in my voice…"
              }
              value={message}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                External actions always require approval
              </p>
              {isActive && selectedRun ? (
                <Button
                  disabled={interrupt.isPending}
                  onClick={async () => {
                    try {
                      await interrupt.mutateAsync(selectedRun.id);
                      await Promise.all([run.refetch(), runs.refetch()]);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not stop the agent"
                      );
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  Stop run
                </Button>
              ) : (
                <Button
                  disabled={!message.trim() || start.isPending}
                  type="submit"
                >
                  {start.isPending ? "Starting…" : "Send"}
                </Button>
              )}
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Workspace memory</CardTitle>
              <CardDescription>Visible, editable context</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                ["VOICE.md", "voice"],
                ["STRATEGY.md", "goal"],
                ["MEMORY.md", "preference"],
                ["RITUALS.md", "ritual"],
              ].map(([label, category]) => (
                <div className="rounded-lg border p-3" key={label}>
                  <p className="font-medium text-xs">{label}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {category === "ritual"
                      ? `${rituals.data?.length ?? 0} rituals`
                      : `${memoryCounts.get(category) ?? 0} items`}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {pendingMemories.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Memory review</CardTitle>
                <CardDescription>
                  Confirm identity, brand and strategy changes before they
                  become trusted context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingMemories.map((memory) => (
                  <div className="rounded-lg border p-3" key={memory.id}>
                    <div className="flex items-center justify-between gap-2">
                      <Badge size="sm" variant="zinc">
                        {memory.category}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {Math.round(memory.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm">
                      {typeof memory.value === "string"
                        ? memory.value
                        : JSON.stringify(memory.value)}
                    </p>
                    <p className="mt-2 line-clamp-2 text-muted-foreground text-xs">
                      Source: {memory.provenance}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        className="min-h-11"
                        disabled={resolveMemory.isPending}
                        onClick={async () => {
                          await resolveMemory.mutateAsync({
                            id: memory.id,
                            payload: { status: "confirmed" },
                          });
                          await memories.refetch();
                        }}
                        size="sm"
                      >
                        Confirm
                      </Button>
                      <Button
                        className="min-h-11"
                        disabled={resolveMemory.isPending}
                        onClick={async () => {
                          await resolveMemory.mutateAsync({
                            id: memory.id,
                            payload: { status: "rejected" },
                          });
                          await memories.refetch();
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {(rituals.data?.length ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Rituals</CardTitle>
                <CardDescription>
                  Disabled until you explicitly enable them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {rituals.data?.map((ritual) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    key={ritual.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {ritual.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {ritual.timezone}
                      </p>
                    </div>
                    <Button
                      className="min-h-11"
                      disabled={updateRitual.isPending}
                      onClick={async () => {
                        await updateRitual.mutateAsync({
                          id: ritual.id,
                          payload: { enabled: !ritual.enabled },
                        });
                        await rituals.refetch();
                      }}
                      size="sm"
                      variant={ritual.enabled ? "outline" : "default"}
                    >
                      {ritual.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="min-h-0 gap-0 overflow-hidden py-0">
            <CardHeader className="border-b py-4">
              <CardTitle className="text-sm">Recent work</CardTitle>
              <CardDescription>Durable conversation history</CardDescription>
            </CardHeader>
            <ScrollArea viewportClassName="max-h-[430px]">
              <CardContent className="space-y-2 p-3">
                {agentRuns.length === 0 ? (
                  <p className="px-2 py-8 text-center text-muted-foreground text-sm">
                    Your work will appear here.
                  </p>
                ) : (
                  agentRuns.map((item) => (
                    <button
                      className={cn(
                        "w-full rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/60",
                        selectedRunId === item.id &&
                          "border-primary/30 bg-muted"
                      )}
                      key={item.id}
                      onClick={() => setSelectedRunId(item.id)}
                      type="button"
                    >
                      <span className="line-clamp-2 text-sm leading-snug">
                        {item.objective}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <Badge size="sm" variant={statusVariant(item.status)}>
                          {item.status.replaceAll("_", " ")}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}
