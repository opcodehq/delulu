"use client";

import { Icon } from "@delulu/design-system/providers/icon";
import { Comment01Icon } from "@delulu/icons";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { TriggerStep } from "../utils/flow-types";

const TRIGGER_LABELS: Record<string, string> = {
  COMMENT: "Post or Reel Comments",
  MENTION: "Mentions",
  STORY_REPLY: "Story Replies",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const trigger = data.step as TriggerStep;
  const postCount = trigger.targetPostIds.length;

  const hasKeywordFilter =
    trigger.keywordFilter && trigger.keywordFilter.operator !== "always";
  const keywordLabel = hasKeywordFilter
    ? `keyword: ${trigger.keywordFilter!.value || "..."}`
    : "any comment";

  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-sm transition-all ${
        selected
          ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30"
          : "border-border bg-card hover:border-purple-400/50"
      }`}
      style={{ minWidth: 240 }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
          <Icon className="text-purple-500" icon={Comment01Icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            {TRIGGER_LABELS[trigger.triggerType] || trigger.triggerType}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {trigger.targetMode === "all"
              ? `Any current or future post | ${keywordLabel}`
              : postCount === 0
                ? "No posts selected"
                : `${postCount} post${postCount === 1 ? "" : "s"} | ${keywordLabel}`}
          </p>
        </div>
      </div>
      <Handle
        className="!bg-purple-500"
        id="default"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}
