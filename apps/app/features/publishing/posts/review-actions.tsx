"use client";

import { invalidateWorkspaceResource } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { Icon } from "@delulu/design-system/providers/icon";
import { CancelCircleIcon, Tick01Icon } from "@delulu/icons";
import React from "react";
import { toast } from "sonner";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom, useResourceRegistry } from "@/shell/state/resources";

interface ReviewActionsProps {
  postId: string;
  onReviewed?: () => void;
  compact?: boolean;
}

export function ReviewActions({
  postId,
  onReviewed,
  compact = false,
}: ReviewActionsProps) {
  const [showDialog, setShowDialog] = React.useState<
    "approve" | "reject" | null
  >(null);
  const [comment, setComment] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);

  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const registry = useResourceRegistry();
  const reviewPostMutation = useMutationAtom({
    ...resources.reviews.act(workspaceId ?? "", postId),
    onSuccess: async () => {
      if (!workspaceId) {
        return;
      }
      await Promise.all([
        registry.invalidateResources({
          queryKey: resources.reviews.queue(workspaceId).queryKey,
        }),
        registry.invalidateResources({
          queryKey: resources.reviews.forPost(workspaceId, postId).queryKey,
        }),
        registry.invalidateResources({
          queryKey: resources.reviews.activity(workspaceId, postId).queryKey,
        }),
        invalidateWorkspaceResource(registry, workspaceId, "posts"),
        registry.invalidateResources({
          queryKey: resources.posts.get(workspaceId, postId).queryKey,
        }),
      ]);
    },
  });

  const handleReview = async (status: "APPROVED" | "REJECTED") => {
    if (status === "REJECTED" && !comment.trim()) {
      toast.error("Please provide a reason for declining");
      return;
    }
    setIsProcessing(true);
    try {
      if (!workspaceId) {
        throw new Error("Select a workspace before reviewing");
      }
      await reviewPostMutation.mutateAsync(
        status === "APPROVED"
          ? { action: "approve", comment: comment.trim() || undefined }
          : { action: "reject", reason: comment.trim() }
      );
      toast.success(status === "APPROVED" ? "Post approved" : "Post declined");
      setShowDialog(null);
      setComment("");
      onReviewed?.();
    } catch (error) {
      toast.error(
        status === "APPROVED"
          ? "Failed to approve post"
          : "Failed to decline post",
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          className="gap-1 px-2.5 text-xs"
          disabled={isProcessing || !workspaceId}
          onClick={() => setShowDialog("approve")}
          size="sm"
        >
          <Icon icon={Tick01Icon} size={12} />
          Approve
        </Button>
        <Button
          className="gap-1 px-2.5 text-xs"
          disabled={isProcessing || !workspaceId}
          onClick={() => setShowDialog("reject")}
          size="sm"
          variant="outline"
        >
          <Icon icon={CancelCircleIcon} size={12} />
          Decline
        </Button>
        <ReviewDialog
          comment={comment}
          isProcessing={isProcessing}
          onClose={() => {
            setShowDialog(null);
            setComment("");
          }}
          onCommentChange={setComment}
          onConfirm={() =>
            handleReview(showDialog === "approve" ? "APPROVED" : "REJECTED")
          }
          type={showDialog}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          className="gap-1.5"
          disabled={isProcessing}
          onClick={() => setShowDialog("approve")}
          size="sm"
        >
          <Icon icon={Tick01Icon} size={14} />
          Approve
        </Button>
        <Button
          className="gap-1.5"
          disabled={isProcessing}
          onClick={() => setShowDialog("reject")}
          size="sm"
          variant="outline"
        >
          <Icon icon={CancelCircleIcon} size={14} />
          Decline
        </Button>
      </div>
      <ReviewDialog
        comment={comment}
        isProcessing={isProcessing}
        onClose={() => {
          setShowDialog(null);
          setComment("");
        }}
        onCommentChange={setComment}
        onConfirm={() =>
          handleReview(showDialog === "approve" ? "APPROVED" : "REJECTED")
        }
        type={showDialog}
      />
    </>
  );
}

function ReviewDialog({
  type,
  comment,
  isProcessing,
  onClose,
  onConfirm,
  onCommentChange,
}: {
  type: "approve" | "reject" | null;
  comment: string;
  isProcessing: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCommentChange: (v: string) => void;
}) {
  if (!type) {
    return null;
  }

  const isReject = type === "reject";

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReject ? "Decline post" : "Approve post"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label
            className="text-muted-foreground text-sm"
            htmlFor="review-comment"
          >
            {isReject
              ? "Reason for declining (required)"
              : "Comment (optional)"}
          </label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="review-comment"
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder={
              isReject
                ? "Explain what needs to change..."
                : "Add a note for the author..."
            }
            rows={3}
            value={comment}
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={isProcessing || (isReject && !comment.trim())}
            onClick={onConfirm}
            variant={isReject ? "destructive" : "default"}
          >
            {isReject ? "Decline" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
