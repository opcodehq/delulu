"use client";

import { createContext, useContext } from "react";
import type { AddableStepType } from "@/features/automations/flow-builder/step-kinds";
import type { StepSlot } from "@/features/automations/flow-builder/utils/step-helpers";

export interface FlowActions {
  /** Insert a new step at a slot, then select and reveal it. */
  addStep: (slot: StepSlot, type: AddableStepType) => void;
}

const FlowActionsContext = createContext<FlowActions | null>(null);

export const FlowActionsProvider = FlowActionsContext.Provider;

/** Canvas actions for custom nodes; null outside the editable builder. */
export function useFlowActions() {
  return useContext(FlowActionsContext);
}
