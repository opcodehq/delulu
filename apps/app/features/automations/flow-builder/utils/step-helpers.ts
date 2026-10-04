import { nanoid } from "nanoid";
import type {
  AutomationStep,
  ConditionStep,
  SendDmStep,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";

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

export type StepBranch = "next" | "yes" | "no";

/** A place in the flow where a new step can be attached. */
export interface StepSlot {
  parentId: string;
  branch: StepBranch;
}

/** Branches of a trigger or step that do not lead anywhere yet. */
export function openBranches(node: TriggerStep | AutomationStep): StepBranch[] {
  if (node.type === "condition") {
    return [
      ...(node.yesStepId ? [] : (["yes"] as const)),
      ...(node.noStepId ? [] : (["no"] as const)),
    ];
  }
  return node.nextStepId ? [] : ["next"];
}

function childIds(step: AutomationStep): string[] {
  if (step.type === "condition") {
    return [step.yesStepId, step.noStepId].filter(
      (id): id is string => id !== undefined
    );
  }
  const buttonTargets = (step.buttons ?? []).flatMap((btn) =>
    btn.type === "quick_reply" && btn.nextStepId ? [btn.nextStepId] : []
  );
  return [...(step.nextStepId ? [step.nextStepId] : []), ...buttonTargets];
}

/**
 * Open ends of the flow in reading order: triggers first, then the steps
 * reachable from them (yes before no), then disconnected steps.
 */
export function openSlots(
  triggers: TriggerStep[],
  steps: AutomationStep[]
): StepSlot[] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const ordered: AutomationStep[] = [];
  const visit = (id: string | undefined) => {
    const step = id ? stepMap.get(id) : undefined;
    if (!step || visited.has(step.id)) {
      return;
    }
    visited.add(step.id);
    ordered.push(step);
    for (const child of childIds(step)) {
      visit(child);
    }
  };
  for (const trigger of triggers) {
    visit(trigger.nextStepId);
  }
  for (const step of steps) {
    visit(step.id);
  }
  return [...triggers, ...ordered].flatMap((node) =>
    openBranches(node).map((branch) => ({ parentId: node.id, branch }))
  );
}

/**
 * Where a step added from the palette should go: below the selected node
 * (into its first open branch, or between it and its child), otherwise at
 * the first open end of the flow. Returns undefined when there is nothing to
 * attach to yet.
 */
export function defaultInsertSlot(
  triggers: TriggerStep[],
  steps: AutomationStep[],
  selectedId: string | null
): StepSlot | undefined {
  const selected =
    triggers.find((t) => t.id === selectedId) ??
    steps.find((s) => s.id === selectedId);
  if (selected) {
    return {
      parentId: selected.id,
      branch: openBranches(selected)[0] ?? "next",
    };
  }
  return openSlots(triggers, steps)[0];
}

/**
 * Insert a step after a given parent (trigger or step).
 * Updates the parent's nextStepId/yesStepId/noStepId to point to the new
 * step, and sets the new step's nextStepId (yesStepId for conditions) to the
 * old child. Triggers share one step chain, so inserting after a trigger
 * re-points every trigger that led to the same child.
 */
export function insertStepAfter(
  triggers: TriggerStep[],
  steps: AutomationStep[],
  parentId: string,
  parentBranch: StepBranch,
  newStep: AutomationStep
): { triggers: TriggerStep[]; steps: AutomationStep[] } {
  let oldChildId: string | undefined;

  const parentTrigger = triggers.find((t) => t.id === parentId);
  if (parentTrigger) {
    oldChildId = parentTrigger.nextStepId;
  }
  const newTriggers = parentTrigger
    ? triggers.map((t) =>
        t.id === parentId || (oldChildId && t.nextStepId === oldChildId)
          ? { ...t, nextStepId: newStep.id }
          : t
      )
    : triggers;

  const newSteps = steps.map((s) => {
    if (s.id !== parentId) {
      return s;
    }
    if (s.type === "condition") {
      if (parentBranch === "no") {
        oldChildId = s.noStepId;
        return { ...s, noStepId: newStep.id };
      }
      // 'next' defaults to 'yes' branch for conditions
      oldChildId = s.yesStepId;
      return { ...s, yesStepId: newStep.id };
    }
    oldChildId = s.nextStepId;
    return { ...s, nextStepId: newStep.id };
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
