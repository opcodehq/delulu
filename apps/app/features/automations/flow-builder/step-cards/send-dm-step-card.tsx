"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Cancel01Icon, MailSend01Icon } from "@delulu/icons";
import type { SendDmStep } from "../utils/flow-types";

interface SendDmStepCardProps {
  step: SendDmStep;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
}

export function SendDmStepCard({
  step,
  isSelected,
  onClick,
  onRemove,
}: SendDmStepCardProps) {
  const hasMessage = step.messageTemplate.trim().length > 0;
  const hasButtons = step.buttons && step.buttons.length > 0;
  const hasReply =
    step.commentReply?.enabled && step.commentReply.replies.length > 0;

  return (
    <button
      className={cn(
        "group relative w-full max-w-xs rounded-xl border px-4 py-3 text-left transition-all",
        isSelected
          ? "border-green-500 bg-green-500/10 ring-1 ring-green-500/30"
          : "border-border bg-card hover:border-green-400/50 hover:bg-green-500/5"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/15">
          <Icon className="text-green-500" icon={MailSend01Icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Send DM</p>
          <p className="truncate text-muted-foreground text-xs">
            {hasMessage
              ? step.messageTemplate.slice(0, 50) +
                (step.messageTemplate.length > 50 ? "..." : "")
              : "No message set"}
          </p>
        </div>
      </div>
      {(hasButtons || hasReply) && (
        <div className="mt-2 flex gap-1.5 pl-12">
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
    </button>
  );
}
