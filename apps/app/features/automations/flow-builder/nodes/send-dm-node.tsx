"use client";

import type { NodeProps } from "@xyflow/react";
import { FlowNodeCard } from "@/features/automations/flow-builder/nodes/flow-node-card";
import type { SendDmStep } from "@/features/automations/flow-builder/utils/flow-types";
import { sendDmIssue } from "@/features/automations/flow-builder/utils/flow-validation";
import { openBranches } from "@/features/automations/flow-builder/utils/step-helpers";

export function SendDmNode({ data, selected }: NodeProps) {
  const step = data.step as SendDmStep;
  const message = step.messageTemplate.trim();
  const buttons = step.buttons ?? [];
  const hasReply =
    step.commentReply?.enabled && step.commentReply.replies.length > 0;

  // Quick replies that lead somewhere get their own handle along the bottom
  const branchingIndexes = buttons.flatMap((btn, index) =>
    btn.type === "quick_reply" && btn.nextStepId ? [index] : []
  );

  return (
    <FlowNodeCard
      badge={hasReply ? "Replies publicly" : undefined}
      description={message ? undefined : "Write what they receive"}
      id={step.id}
      issue={sendDmIssue(step)?.label}
      kind="send_dm"
      selected={selected}
      // Branch handles share the bottom edge, so the "+" slot would overlap
      // them; branch from the button settings instead.
      slots={
        branchingIndexes.length > 0
          ? []
          : openBranches(step).map((branch) => ({ branch, left: 50 }))
      }
      sources={[
        { id: "default", left: 50 },
        ...branchingIndexes.map((buttonIndex, i) => ({
          id: `button_${buttonIndex}`,
          left: ((i + 1) / (branchingIndexes.length + 1)) * 100,
          className: "!bg-blue-500",
        })),
      ]}
      title={message || "No message yet"}
      wrapTitle
    >
      {buttons.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {buttons.map((btn, index) => (
            <span
              className="max-w-full truncate rounded border bg-background px-1.5 text-xs leading-5"
              key={btn.type === "quick_reply" ? btn.payload : `url-${index}`}
            >
              {btn.title || `Button ${index + 1}`}
            </span>
          ))}
        </div>
      )}
    </FlowNodeCard>
  );
}
