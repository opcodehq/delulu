"use client";

import type { NodeProps } from "@xyflow/react";
import { FlowNodeCard } from "@/features/automations/flow-builder/nodes/flow-node-card";
import { TRIGGER_TYPE_LABELS } from "@/features/automations/flow-builder/step-kinds";
import type { TriggerStep } from "@/features/automations/flow-builder/utils/flow-types";
import { triggerIssue } from "@/features/automations/flow-builder/utils/flow-validation";
import { openBranches } from "@/features/automations/flow-builder/utils/step-helpers";

function describeTargets(trigger: TriggerStep) {
  if (trigger.targetMode === "all") {
    return trigger.triggerType === "STORY_REPLY" ? "Any story" : "Any post";
  }
  const count =
    trigger.targetPostIds.length + (trigger.pendingPostIds?.length ?? 0);
  const noun = trigger.triggerType === "STORY_REPLY" ? "story" : "post";
  if (count === 0) {
    return `No ${noun} selected`;
  }
  const plural = noun === "story" ? "stories" : "posts";
  return `${count} ${count === 1 ? noun : plural}`;
}

function describeKeyword(trigger: TriggerStep) {
  const filter = trigger.keywordFilter;
  if (!filter || filter.operator === "always") {
    return trigger.triggerType === "STORY_REPLY" ? "any reply" : "any comment";
  }
  return filter.value?.trim() ? `keyword “${filter.value.trim()}”` : "keyword";
}

export function TriggerNode({ data, selected }: NodeProps) {
  const trigger = data.step as TriggerStep;

  return (
    <FlowNodeCard
      badge="Start"
      description={`${describeTargets(trigger)} · ${describeKeyword(trigger)}`}
      hasTarget={false}
      id={trigger.id}
      issue={triggerIssue(trigger)?.label}
      kind="trigger"
      selected={selected}
      slots={openBranches(trigger).map((branch) => ({ branch, left: 50 }))}
      sources={[{ id: "default", left: 50 }]}
      title={TRIGGER_TYPE_LABELS[trigger.triggerType] ?? trigger.triggerType}
    />
  );
}
