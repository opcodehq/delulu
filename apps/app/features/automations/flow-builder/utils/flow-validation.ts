import type { AutomationStep, TriggerStep } from "./flow-types";

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

  // 2. Specific targeting must have at least 1 target post
  for (const trigger of triggers) {
    if (
      trigger.targetMode === "specific" &&
      trigger.targetPostIds.length === 0 &&
      (trigger.pendingPostIds?.length ?? 0) === 0
    ) {
      errors.push("Select at least one target post");
      break;
    }
  }

  // 3. Keyword filter validation: if operator is not "always", value must be set
  for (const trigger of triggers) {
    if (
      trigger.keywordFilter &&
      trigger.keywordFilter.operator !== "always" &&
      !trigger.keywordFilter.value?.trim()
    ) {
      errors.push("Keyword filter must have a value when enabled");
      break;
    }
  }

  // 4. At least 1 Send DM step
  const sendDmSteps = steps.filter((s) => s.type === "send_dm");
  if (sendDmSteps.length === 0) {
    errors.push("Flow must have at least one Send DM step");
  }

  // 5. All Send DM steps must have a message
  for (const step of sendDmSteps) {
    if (step.type === "send_dm" && !step.messageTemplate.trim()) {
      errors.push("All Send DM steps must have a message");
      break;
    }
  }

  // 6. URL buttons must have valid URLs and titles
  // Quick reply buttons with nextStepId must point to valid step IDs
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  for (const step of sendDmSteps) {
    if (step.type !== "send_dm" || !step.buttons) {
      continue;
    }
    for (const btn of step.buttons) {
      if (!btn.title.trim()) {
        errors.push("All DM buttons must have a title");
        break;
      }
      if (btn.type === "url" && "url" in btn && !isValidUrl(btn.url ?? "")) {
        errors.push(
          "URL buttons must have a valid URL (e.g. https://example.com)"
        );
        break;
      }
      if (
        btn.type === "quick_reply" &&
        "nextStepId" in btn &&
        btn.nextStepId &&
        !stepMap.has(btn.nextStepId)
      ) {
        errors.push("Quick reply button references a non-existent step");
        break;
      }
    }
    if (errors.length > 0) {
      break;
    }
  }

  // 7. Every trigger must lead to at least one Send DM (reachability)
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
