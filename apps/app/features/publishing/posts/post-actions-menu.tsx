"use client";

import { POST_DELETED, POST_PUBLISH_RETRIED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import { NaturalDatePicker } from "@delulu/design-system/components/ui/natural-date-picker";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Calendar01Icon,
  Delete02Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  RefreshIcon,
  Sent02Icon,
  Share08Icon,
  ViewIcon,
} from "@delulu/icons";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ShareDialog } from "@/features/publishing/share/share-dialog";
import type { PostView } from "@/shared/workspace-views";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom } from "@/shell/state/resources";

interface PostActionsMenuProps {
  post: PostView;
  onPreview?: () => void;
  align?: "start" | "end";
  trigger?: ReactNode;
}

export function PostActionsMenu({
  post,
  onPreview,
  align = "end",
  trigger,
}: PostActionsMenuProps) {
  const router = useRouter();
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const analytics = useAnalytics();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();

  const remove = useMutationAtom(resources.posts.remove(workspaceId ?? ""));
  const retry = useMutationAtom(
    resources.posts.retryTarget(workspaceId ?? "", post.id)
  );
  const update = useMutationAtom(
    resources.posts.update(workspaceId ?? "", post.id)
  );

  const hasTargets = post.targets.length > 0;
  const hasFailedTargets =
    post.status === "failed" ||
    post.status === "partially_failed" ||
    post.targets.some((target) => target.status === "failed");
  const canPublish =
    hasTargets && (post.status === "draft" || post.status === "scheduled");
  const canSchedule =
    hasTargets && (post.status === "draft" || post.status === "scheduled");

  const buildPayload = (scheduledAt: string | null) => ({
    groups: post.groups.map((group) => ({
      id: group.id,
      isDefault: group.isDefault,
      segments: group.segments.map((segment) => ({
        text: segment.text,
        media: segment.media.map((ref) => ({ ...ref })),
        ...(segment.delayMinutes === undefined
          ? {}
          : { delayMinutes: segment.delayMinutes }),
      })),
    })),
    targets: post.targets.map((target) => ({
      connectionId: target.connectionId,
      groupId: target.groupId,
      settings: target.settings,
      scheduledAt,
    })),
    source: "app" as const,
  });

  const handlePublishNow = async () => {
    try {
      await update.mutateAsync(buildPayload(new Date().toISOString()));
      toast.success("Post queued to publish now");
    } catch (error) {
      toast.error("Failed to publish post", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate) {
      return;
    }
    try {
      await update.mutateAsync(buildPayload(scheduleDate.toISOString()));
      setScheduleOpen(false);
      toast.success(`Scheduled for ${scheduleDate.toLocaleString()}`);
    } catch (error) {
      toast.error("Failed to schedule post", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleRetry = async () => {
    try {
      const failed = post.targets.filter(
        (target) => target.status === "failed"
      );
      await Promise.all(failed.map((target) => retry.mutateAsync(target.id)));
      analytics.capture(POST_PUBLISH_RETRIED, { post_id: post.id });
      toast.success("Failed targets queued for retry");
    } catch (error) {
      toast.error("Retry failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(post.id);
      analytics.capture(POST_DELETED, {
        post_id: post.id,
        post_status: post.status,
      });
      setDeleteOpen(false);
      toast.success("Post deleted");
    } catch (error) {
      toast.error("Failed to delete post", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button
              aria-label="Post actions"
              className="text-muted-foreground"
              size="icon"
              variant="ghost"
            >
              <Icon icon={MoreVerticalIcon} size={18} />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="z-[70] w-48">
          {onPreview && (
            <DropdownMenuItem onSelect={() => onPreview()}>
              <Icon icon={ViewIcon} size={16} />
              Preview
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => router.push(`/post/${post.id}`)}>
            <Icon icon={PencilEdit02Icon} size={16} />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShareOpen(true)}>
            <Icon icon={Share08Icon} size={16} />
            Share preview
          </DropdownMenuItem>
          {hasFailedTargets && (
            <DropdownMenuItem
              disabled={retry.isPending}
              onSelect={(event) => {
                event.preventDefault();
                handleRetry();
              }}
            >
              <Icon icon={RefreshIcon} size={16} />
              Retry failed targets
            </DropdownMenuItem>
          )}
          {canPublish && (
            <DropdownMenuItem
              disabled={update.isPending}
              onSelect={(event) => {
                event.preventDefault();
                handlePublishNow();
              }}
            >
              <Icon icon={Sent02Icon} size={16} />
              Publish now
            </DropdownMenuItem>
          )}
          {canSchedule && (
            <DropdownMenuItem
              onSelect={() => {
                setScheduleDate(undefined);
                setScheduleOpen(true);
              }}
            >
              <Icon icon={Calendar01Icon} size={16} />
              {post.status === "scheduled" ? "Reschedule…" : "Schedule…"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            variant="destructive"
          >
            <Icon icon={Delete02Icon} size={16} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setScheduleOpen} open={scheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {post.status === "scheduled"
                ? "Reschedule post"
                : "Schedule post"}
            </DialogTitle>
          </DialogHeader>
          <NaturalDatePicker onChange={setScheduleDate} value={scheduleDate} />
          <DialogFooter>
            <Button onClick={() => setScheduleOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!scheduleDate || update.isPending}
              onClick={handleSchedule}
            >
              {post.status === "scheduled" ? "Reschedule" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareDialog
        onOpenChange={setShareOpen}
        open={shareOpen}
        postId={post.id}
      />

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the post and its scheduled targets. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
