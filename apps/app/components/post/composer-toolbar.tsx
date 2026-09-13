"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { SidebarTrigger } from "@delulu/design-system/components/ui/sidebar";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Bookmark01Icon,
  Calendar03Icon,
  EyeIcon,
  Loading03Icon,
  Sent02Icon,
  Settings01Icon,
} from "@delulu/icons";
import { usePermissions } from "@/hooks/use-permissions";
import { usePostActions } from "@/hooks/use-post-actions";
import { useIsMediaUploading, useSelectedSocialProviders } from "@/store/post";

interface ComposerToolbarProps {
  postId?: string;
  actionsDisabled?: boolean;
  onOpenControls?: () => void;
  onOpenPreview?: () => void;
}

export function ComposerToolbar({
  postId,
  actionsDisabled = false,
  onOpenControls,
  onOpenPreview,
}: ComposerToolbarProps) {
  const actions = usePostActions();
  const selected = useSelectedSocialProviders();
  const isUploading = useIsMediaUploading();
  const { isViewer, canCreate } = usePermissions();
  const disabled =
    actionsDisabled ||
    actions.isProcessing ||
    isUploading ||
    isViewer ||
    !canCreate;
  const cannotPublish =
    disabled || selected.length === 0 || actions.isAtPostLimit;
  const hasSchedule = Boolean(actions.date);

  const handlePrimaryAction = () => {
    if (hasSchedule) {
      actions.handleSchedulePost();
      return;
    }
    actions.handlePostNow();
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-border/80 border-b bg-background px-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarTrigger
          aria-label="Open navigation"
          className="size-11 shrink-0 rounded-lg text-foreground hover:bg-muted"
        />
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-[15px] tracking-tight">
            {postId ? "Edit post" : "New post"}
          </h1>
          <p className="hidden truncate text-muted-foreground text-xs sm:block">
            {isUploading ? "Uploading media…" : "Draft across every channel"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {onOpenPreview && (
          <Button
            className="hidden h-9 rounded-lg px-3 text-foreground lg:inline-flex"
            onClick={onOpenPreview}
            variant="ghost"
          >
            <Icon icon={EyeIcon} size={17} />
            Preview
          </Button>
        )}

        <Button
          aria-label="Save draft"
          className="size-11 rounded-lg px-0 text-foreground sm:h-9 sm:w-auto sm:px-3"
          disabled={disabled}
          onClick={actions.handleSaveAsDraft}
          title="Save draft"
          variant="ghost"
        >
          {actions.isProcessing ? (
            <Icon className="animate-spin" icon={Loading03Icon} size={16} />
          ) : (
            <Icon icon={Bookmark01Icon} size={17} />
          )}
          <span className="hidden sm:inline">Save draft</span>
        </Button>

        <Button
          aria-label={hasSchedule ? "Schedule post" : "Publish post"}
          className="h-10 rounded-lg px-3.5 shadow-none sm:h-9 sm:px-4"
          disabled={cannotPublish}
          onClick={handlePrimaryAction}
        >
          {actions.isProcessing ? (
            <Icon className="animate-spin" icon={Loading03Icon} size={16} />
          ) : hasSchedule ? (
            <Icon icon={Calendar03Icon} size={17} />
          ) : (
            <Icon icon={Sent02Icon} size={17} />
          )}
          <span>{hasSchedule ? "Schedule" : "Publish"}</span>
        </Button>

        {onOpenControls && (
          <Button
            aria-label="Open post settings"
            className="size-11 rounded-lg text-foreground lg:hidden"
            onClick={onOpenControls}
            size="icon"
            title="Post settings"
            variant="ghost"
          >
            <Icon icon={Settings01Icon} size={19} />
          </Button>
        )}
      </div>
    </header>
  );
}
