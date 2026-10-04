import type {
  AutomationStep,
  SendDmStep,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** What is missing from a single node, with a short label for the canvas. */
export interface NodeIssue {
  /** Short label shown on the node. */
  label: string;
  /** Full sentence shown in the flow-level issue list. */
  message: string;
}

export function triggerIssue(trigger: TriggerStep): NodeIssue | undefined {
  if (
    trigger.targetMode === "specific" &&
    trigger.targetPostIds.length === 0 &&
    (trigger.pendingPostIds?.length ?? 0) === 0
  ) {
    return {
      label: "Choose posts",
      message: "Select at least one target post",
    };
  }
  if (
    trigger.keywordFilter &&
    trigger.keywordFilter.operator !== "always" &&
    !trigger.keywordFilter.value?.trim()
  ) {
    return {
      label: "Add a keyword",
      message: "Keyword filter must have a value when enabled",
    };
  }
  return undefined;
}

export function sendDmIssue(step: SendDmStep): NodeIssue | undefined {
  if (!step.messageTemplate.trim()) {
    return {
      label: "Write a message",
      message: "All Send DM steps must have a message",
    };
  }
  for (const btn of step.buttons ?? []) {
    if (!btn.title.trim()) {
      return {
        label: "Name the button",
        message: "All DM buttons must have a title",
      };
    }
    if (btn.type === "url" && !isValidUrl(btn.url ?? "")) {
      return {
        label: "Fix the link",
        message: "URL buttons must have a valid URL (e.g. https://example.com)",
      };
    }
  }
  return undefined;
}

/**
 * Validate step-based flow for completeness before activation.
 */
export function validateFlow(
  triggers: TriggerStep[],
  steps: AutomationStep[]
): ValidationResult {
  const errors: string[] = [];

  // 1. At least 1 trigger
  if (triggers.length === 0) {
    errors.push("At least one trigger is required");
  }

  // 2. Each trigger needs targets and a usable keyword filter.
  // Each kind of problem is reported once, however many nodes have it.
  const triggerIssues = triggers.flatMap((trigger) => {
    const issue = triggerIssue(trigger);
    return issue ? [issue.message] : [];
  });
  errors.push(...new Set(triggerIssues));

  // 3. At least 1 Send DM step
  const sendDmSteps = steps.filter((s) => s.type === "send_dm");
  if (sendDmSteps.length === 0) {
    errors.push("Flow must have at least one Send DM step");
  }

  // 4. Every Send DM needs a message and complete buttons
  const sendDmIssues = sendDmSteps.flatMap((step) => {
    const issue = step.type === "send_dm" ? sendDmIssue(step) : undefined;
    return issue ? [issue.message] : [];
  });
  errors.push(...new Set(sendDmIssues));

  // 5. Quick reply buttons with nextStepId must point to valid step IDs
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const danglingButton = sendDmSteps.some(
    (step) =>
      step.type === "send_dm" &&
      step.buttons?.some(
        (btn) =>
          btn.type === "quick_reply" &&
          btn.nextStepId &&
          !stepMap.has(btn.nextStepId)
      )
  );
  if (danglingButton) {
    errors.push("Quick reply button references a non-existent step");
  }

  // 6. Every trigger must lead to at least one Send DM (reachability)
  for (const trigger of triggers) {
    if (!trigger.nextStepId) {
      errors.push("Every trigger must be connected to at least one step");
      break;
    }
    const reachable = getReachableSteps(trigger.nextStepId, stepMap);
    const hasSendDm = reachable.some((id) => {
      const s = stepMap.get(id);
      return s?.type === "send_dm";
    });
    if (!hasSendDm) {
      errors.push("Every trigger must lead to a Send DM step");
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

function getReachableSteps(
  startId: string,
  stepMap: Map<string, AutomationStep>
): string[] {
  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    const step = stepMap.get(id);
    if (!step) {
      continue;
    }

    if (step.type === "condition") {
      if (step.yesStepId) {
        stack.push(step.yesStepId);
      }
      if (step.noStepId) {
        stack.push(step.noStepId);
      }
    } else if (step.type === "send_dm") {
      if (step.nextStepId) {
        stack.push(step.nextStepId);
      }
      // Also traverse button branches
      if (step.buttons) {
        for (const btn of step.buttons) {
          if (
            btn.type === "quick_reply" &&
            "nextStepId" in btn &&
            btn.nextStepId
          ) {
            stack.push(btn.nextStepId);
          }
        }
      }
    }
  }

  return [...visited];
}
