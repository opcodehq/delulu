"use client";

import type { NodeProps } from "@xyflow/react";
import { FlowNodeCard } from "@/features/automations/flow-builder/nodes/flow-node-card";
import {
  CONDITION_HINTS,
  CONDITION_LABELS,
} from "@/features/automations/flow-builder/step-kinds";
import type { ConditionStep } from "@/features/automations/flow-builder/utils/flow-types";
import { openBranches } from "@/features/automations/flow-builder/utils/step-helpers";

/** Yes/No handles sit under the left and right thirds of the card. */
export const CONDITION_BRANCH_LEFT = { yes: 30, no: 70 } as const;

export function ConditionNode({ data, selected }: NodeProps) {
  const step = data.step as ConditionStep;

  return (
    <FlowNodeCard
      description={CONDITION_HINTS[step.operator]}
      id={step.id}
      kind="condition"
      selected={selected}
      slots={openBranches(step).flatMap((branch) =>
        branch === "next"
          ? []
          : [
              {
                branch,
                left: CONDITION_BRANCH_LEFT[branch],
                label: branch === "yes" ? "Yes" : "No",
              },
            ]
      )}
      sources={[
        {
          id: "yes",
          left: CONDITION_BRANCH_LEFT.yes,
          className: "!bg-emerald-500",
        },
        {
          id: "no",
          left: CONDITION_BRANCH_LEFT.no,
          className: "!bg-rose-500",
        },
      ]}
      title={CONDITION_LABELS[step.operator] ?? step.operator}
    />
  );
}
