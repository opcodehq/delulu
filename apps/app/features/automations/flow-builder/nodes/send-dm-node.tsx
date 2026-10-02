"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Icon } from "@delulu/design-system/providers/icon";
import { MailSend01Icon } from "@delulu/icons";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { SendDmStep } from "../utils/flow-types";

export function SendDmNode({ data, selected }: NodeProps) {
  const step = data.step as SendDmStep;
  const hasMessage = step.messageTemplate.trim().length > 0;
  const hasButtons = step.buttons && step.buttons.length > 0;
  const hasReply =
    step.commentReply?.enabled && step.commentReply.replies.length > 0;

  // Collect quick reply buttons that have nextStepId (branching buttons)
  const branchingButtons =
    step.buttons?.filter(
      (b) => b.type === "quick_reply" && "nextStepId" in b && b.nextStepId
    ) ?? [];

  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-sm transition-all ${
        selected
          ? "border-green-500 bg-green-500/10 ring-1 ring-green-500/30"
          : "border-border bg-card hover:border-green-400/50"
      }`}
      style={{ minWidth: 240 }}
    >
      <Handle className="!bg-green-500" position={Position.Top} type="target" />
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/15">
          <Icon className="text-green-500" icon={MailSend01Icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Send DM</p>
          <p className="truncate text-muted-foreground text-xs">
            {hasMessage
              ? step.messageTemplate.slice(0, 40) +
                (step.messageTemplate.length > 40 ? "..." : "")
              : "No message set"}
          </p>
        </div>
      </div>
      {(hasButtons || hasReply) && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
          {hasButtons && (
            <Badge className="text-[10px]" variant="secondary">
              {step.buttons!.length} button
              {step.buttons!.length === 1 ? "" : "s"}
            </Badge>
          )}
          {hasReply && (
            <Badge className="text-[10px]" variant="secondary">
              + Reply
            </Badge>
          )}
        </div>
      )}

      {/* Branching button labels */}
      {branchingButtons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-12">
          {branchingButtons.map((btn, i) => (
            <Badge
              className="text-[9px]"
              key={`branch-${btn.type === "quick_reply" ? btn.payload : i}`}
              variant="outline"
            >
              {btn.title || `Button ${i + 1}`}
            </Badge>
          ))}
        </div>
      )}

      {/* Default bottom handle for linear nextStepId chain */}
      <Handle
        className="!bg-green-500"
        id="default"
        position={Position.Bottom}
        type="source"
      />

      {/* Dynamic handles for branching buttons */}
      {branchingButtons.map((btn, i) => {
        const totalBranches = branchingButtons.length;
        // Distribute handles evenly along the bottom
        const leftPercent = ((i + 1) / (totalBranches + 1)) * 100;
        return (
          <Handle
            className="!bg-blue-500"
            id={`button_${step.buttons!.indexOf(btn)}`}
            key={`handle-${btn.type === "quick_reply" ? btn.payload : i}`}
            position={Position.Bottom}
            style={{ left: `${leftPercent}%` }}
            type="source"
          />
        );
      })}
    </div>
  );
}
