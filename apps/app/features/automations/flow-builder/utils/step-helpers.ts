import { nanoid } from "nanoid";
import type {
  AutomationStep,
  ConditionStep,
  SendDmStep,
  TriggerStep,
} from "./flow-types";

export function createId() {
  return nanoid(10);
}

export function createTrigger(overrides?: Partial<TriggerStep>): TriggerStep {
  return {
    id: createId(),
    type: "trigger",
    triggerType: "COMMENT",
    targetMode: "specific",
    targetPostIds: [],
    ...overrides,
  };
}

export function createConditionStep(
  overrides?: Partial<ConditionStep>
): ConditionStep {
  return {
    id: createId(),
    type: "condition",
    operator: "is_follower",
    ...overrides,
  };
}

export function createSendDmStep(overrides?: Partial<SendDmStep>): SendDmStep {
  return {
    id: createId(),
    type: "send_dm",
    messageTemplate: "",
    ...overrides,
  };
}

/**
 * Find a step by ID in the steps array
 */
export function findStep(
  steps: AutomationStep[],
  id: string
): AutomationStep | undefined {
  return steps.find((s) => s.id === id);
}

/**
 * Update a step in the array by ID, returning a new array
 */
export function updateStep(
  steps: AutomationStep[],
  id: string,
  patch: Partial<AutomationStep>
): AutomationStep[] {
  return steps.map((s) =>
    s.id === id ? ({ ...s, ...patch } as AutomationStep) : s
  );
}

/**
 * Remove a step by ID and clean up references to it in other steps
 * (including button nextStepId references)
 */
export function removeStep(
  steps: AutomationStep[],
  id: string
): AutomationStep[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) => {
      if (s.type === "condition") {
        return {
          ...s,
          yesStepId: s.yesStepId === id ? undefined : s.yesStepId,
          noStepId: s.noStepId === id ? undefined : s.noStepId,
        };
      }
      if (s.type === "send_dm") {
        const cleanedButtons = s.buttons?.map((btn) => {
          if (
            btn.type === "quick_reply" &&
            "nextStepId" in btn &&
            btn.nextStepId === id
          ) {
            return { ...btn, nextStepId: undefined };
          }
          return btn;
        });
        return {
          ...s,
          nextStepId: s.nextStepId === id ? undefined : s.nextStepId,
          buttons: cleanedButtons,
        };
      }
      return s;
    });
}

/**
 * Remove references to a step from triggers
 */
export function removeStepFromTriggers(
  triggers: TriggerStep[],
  stepId: string
): TriggerStep[] {
  return triggers.map((t) => ({
    ...t,
    nextStepId: t.nextStepId === stepId ? undefined : t.nextStepId,
  }));
}

/**
 * Insert a step after a given parent (trigger or step).
 * Updates the parent's nextStepId/yesStepId to point to the new step,
 * and sets the new step's nextStepId to the old child.
 */
export function insertStepAfter(
  triggers: TriggerStep[],
  steps: AutomationStep[],
  parentId: string,
  parentBranch: "next" | "yes" | "no",
  newStep: AutomationStep
): { triggers: TriggerStep[]; steps: AutomationStep[] } {
  let oldChildId: string | undefined;

  // Update parent to point to new step
  const newTriggers = triggers.map((t) => {
    if (t.id === parentId) {
      oldChildId = t.nextStepId;
      return { ...t, nextStepId: newStep.id };
    }
    return t;
  });

  const newSteps = steps.map((s) => {
    if (s.id !== parentId) {
      return s;
    }
    if (s.type === "condition") {
      if (parentBranch === "yes" || parentBranch === "next") {
        // 'next' defaults to 'yes' branch for conditions
        oldChildId = s.yesStepId;
        return { ...s, yesStepId: newStep.id };
      }
      if (parentBranch === "no") {
        oldChildId = s.noStepId;
        return { ...s, noStepId: newStep.id };
      }
    }
    if (s.type === "send_dm") {
      oldChildId = s.nextStepId;
      return { ...s, nextStepId: newStep.id };
    }
    return s;
  });

  // Link new step to old child
  const linkedNewStep = { ...newStep } as AutomationStep;
  if (linkedNewStep.type === "condition") {
    linkedNewStep.yesStepId = oldChildId;
  } else if (linkedNewStep.type === "send_dm") {
    linkedNewStep.nextStepId = oldChildId;
  }

  return {
    triggers: newTriggers,
    steps: [...newSteps, linkedNewStep],
  };
}
