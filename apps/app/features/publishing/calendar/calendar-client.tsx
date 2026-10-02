"use client";

import { POST_DELETED, POST_RESCHEDULED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import type { CalendarEvent } from "@delulu/design-system/components/event-calendar";
import { EventCalendar } from "@delulu/design-system/components/event-calendar";
import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { Icon } from "@delulu/design-system/providers/icon";
import { CalendarPlus } from "@delulu/icons";
import { Effect } from "effect";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Header } from "@/shell/navigation/header";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom, useResourceAtom } from "@/shell/state/resources";

interface TargetMutation {
  postId: string;
  targetId: string;
  scheduledAt: string;
}

export function CalendarClient() {
  const router = useRouter();
  const analytics = useAnalytics();
  const { workspaceId, isPending: isWorkspacePending } =
    useWorkspaceSelection();
  const { resources } = useApiClient();
  const scheduledPosts = useResourceAtom({
    suspense: false,
    ...resources.posts.list(workspaceId ?? "", {
      limit: 250,
      status: "scheduled",
    }),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    retry: 2,
  });

  const updateTarget = useMutationAtom({
    mutationKey: ["workspace", workspaceId, "posts"],
    effect: ({ postId, targetId, scheduledAt }: TargetMutation) => {
      if (!workspaceId) {
        return Effect.fail(new Error("Select a workspace before rescheduling"));
      }
      return resources.posts
        .updateTarget(workspaceId, postId, targetId)
        .effect({ scheduledAt });
    },
  });
  const removePost = useMutationAtom({
    mutationKey: ["workspace", workspaceId, "posts"],
    effect: (postId: string) => {
      if (!workspaceId) {
        return Effect.fail(new Error("Select a workspace before deleting"));
      }
      return resources.posts.remove(workspaceId).effect(postId);
    },
  });

  const targetByEventId = useMemo(() => {
    const index = new Map<string, { postId: string; targetId: string }>();
    for (const post of scheduledPosts.data?.data ?? []) {
      for (const target of post.targets) {
        index.set(`${post.id}:${target.id}`, {
          postId: post.id,
          targetId: target.id,
        });
      }
    }
    return index;
  }, [scheduledPosts.data]);

  const events = useMemo<CalendarEvent[]>(
    () =>
      (scheduledPosts.data?.data ?? []).flatMap((post) => {
        const title =
          post.groups
            .flatMap((group) => group.segments)
            .find((segment) => segment.text.trim())?.text ?? "Untitled post";
        return post.targets.flatMap((target) => {
          if (!target.scheduledAt) {
            return [];
          }
          const start = new Date(target.scheduledAt);
          return [
            {
              id: `${post.id}:${target.id}`,
              title,
              description: target.settings.platform,
              start,
              end: new Date(start.getTime() + 3_600_000),
              allDay: false,
              color: "sky" as const,
            },
          ];
        });
      }),
    [scheduledPosts.data]
  );

  const handleEventUpdate = useCallback(
    async (event: CalendarEvent) => {
      const target = targetByEventId.get(event.id);
      if (!target) {
        return;
      }
      try {
        await updateTarget.mutateAsync({
          ...target,
          scheduledAt: event.start.toISOString(),
        });
        analytics.capture(POST_RESCHEDULED, {
          post_id: target.postId,
          new_scheduled_at: event.start.toISOString(),
        });
      } catch (error) {
        toast.error("Failed to reschedule post", {
          description:
            error instanceof Error ? error.message : "Please try again",
        });
      }
    },
    [analytics, targetByEventId, updateTarget]
  );

  const handleEventDelete = useCallback(
    async (eventId: string) => {
      const target = targetByEventId.get(eventId);
      if (!target) {
        return;
      }
      try {
        await removePost.mutateAsync(target.postId);
        analytics.capture(POST_DELETED, {
          post_id: target.postId,
          source: "calendar",
        });
        toast.success("Post deleted");
      } catch (error) {
        toast.error("Failed to delete post", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [analytics, removePost, targetByEventId]
  );

  const header = (
    <>
      <Header page="Calendar" pages={["Content"]}>
        <Button onClick={() => router.push("/post")}>
          <Icon icon={CalendarPlus} size={16} />
          Create Post
        </Button>
      </Header>
      <DottedSeparator fullBleed />
    </>
  );

  if (isWorkspacePending || scheduledPosts.isPending) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
          <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading calendar…
        </div>
      </div>
    );
  }
  if ((scheduledPosts.isError && !scheduledPosts.data) || !workspaceId) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="p-4 md:p-6">
          <Card className="p-4">
            <p className="text-muted-foreground text-sm">
              {scheduledPosts.error?.message ??
                "Select a workspace to view its calendar."}
            </p>
            <Button
              className="mt-3 w-fit"
              onClick={() => scheduledPosts.refetch()}
              variant="outline"
            >
              Retry
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <EventCalendar
          events={events}
          initialView="week"
          onEventCreate={(start) =>
            router.push(`/post?scheduledAt=${start.getTime()}`)
          }
          onEventDelete={handleEventDelete}
          onEventSelect={(event) => {
            const target = targetByEventId.get(event.id);
            if (target) {
              router.push(`/post/${target.postId}`);
            }
          }}
          onEventUpdate={handleEventUpdate}
        />
      </div>
    </div>
  );
}
