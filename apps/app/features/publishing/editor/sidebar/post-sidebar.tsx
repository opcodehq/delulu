"use client";

import { CardContent } from "@delulu/design-system/components/ui/card";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { BasicSettings } from "@/features/publishing/editor/sidebar/basic-settings";
import { PreviewPanel } from "@/features/publishing/editor/sidebar/previews/preview-panel";
import { ReviewActivity } from "@/features/publishing/posts/review-activity";
import { ShareFeedback } from "@/features/publishing/share/share-feedback";

interface PostSidebarProps {
  postId?: string;
  organizationId?: string;
  view?: "controls" | "preview";
  onOpenPreview?: () => void;
  showPreviewAction?: boolean;
  /** Show the live preview inside the controls (wide layouts). */
  inlinePreview?: boolean;
}

export function PostSidebar({
  postId,
  organizationId,
  view = "controls",
  onOpenPreview,
  showPreviewAction = false,
  inlinePreview = false,
}: PostSidebarProps) {
  const activity = postId && organizationId && (
    <>
      <DottedSeparator />
      <ShareFeedback postId={postId} />
      <div className="px-4 pt-4">
        <h3 className="font-medium text-sm">Activity</h3>
      </div>
      <CardContent className="px-1 pt-2">
        <ReviewActivity postId={postId} />
      </CardContent>
    </>
  );

  if (view === "controls") {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <BasicSettings
          inlinePreview={inlinePreview}
          onOpenPreview={onOpenPreview}
          showPreviewAction={showPreviewAction}
        />
        {inlinePreview && activity}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <PreviewPanel />
      {activity}
    </div>
  );
}
