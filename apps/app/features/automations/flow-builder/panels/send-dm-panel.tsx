"use client";

import type { SendDmStep } from "../utils/flow-types";
import { DmComposer } from "./dm-composer";

interface SendDmPanelProps {
  step: SendDmStep;
  isFreePlan?: boolean;
  commentPrivateReply?: boolean;
  onChange: (step: SendDmStep) => void;
  onCreateStepForButton?: (
    buttonIndex: number,
    stepType: "send_dm" | "condition"
  ) => void;
  onRemoveStepForButton?: (buttonIndex: number) => void;
}

export function SendDmPanel({
  step,
  isFreePlan,
  commentPrivateReply,
  onChange,
}: SendDmPanelProps) {
  return (
    <DmComposer
      commentPrivateReply={commentPrivateReply}
      isFreePlan={isFreePlan}
      onChange={onChange}
      step={step}
    />
  );
}
