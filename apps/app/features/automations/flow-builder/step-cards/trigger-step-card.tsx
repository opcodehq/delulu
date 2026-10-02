"use client";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Cancel01Icon, Comment01Icon } from "@delulu/icons";
import type { TriggerStep } from "../utils/flow-types";

const TRIGGER_LABELS: Record<string, string> = {
  COMMENT: "Post or Reel Comments",
  MENTION: "Mentions",
  STORY_REPLY: "Story Replies",
};

interface TriggerStepCardProps {
  trigger: TriggerStep;
  isSelected: boolean;
  onClick: () => void;
  onRemove?: () => void;
  canRemove: boolean;
}

export function TriggerStepCard({
  trigger,
  isSelected,
  onClick,
  onRemove,
  canRemove,
}: TriggerStepCardProps) {
  const postCount = trigger.targetPostIds.length;

  return (
    <button
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
        isSelected
          ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30"
          : "border-border bg-card hover:border-purple-400/50 hover:bg-purple-500/5"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
        <Icon className="text-purple-500" icon={Comment01Icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">
          {TRIGGER_LABELS[trigger.triggerType] || trigger.triggerType}
        </p>
        <p className="text-muted-foreground text-xs">
          {trigger.targetMode === "all"
            ? "Any current or future post"
            : postCount === 0
              ? "No posts selected"
              : `${postCount} post${postCount === 1 ? "" : "s"}`}
        </p>
      </div>
      {canRemove && onRemove && (
        <button
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-muted opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <Icon icon={Cancel01Icon} size={10} />
        </button>
      )}
    </button>
  );
}
