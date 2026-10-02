import { describe, expect, it } from "vitest";
import type { TriggerStep } from "./flow-types";
import { validateFlow } from "./flow-validation";

const trigger = (overrides: Partial<TriggerStep> = {}): TriggerStep => ({
  id: "trigger-1",
  type: "trigger",
  triggerType: "COMMENT",
  targetMode: "specific",
  targetPostIds: ["media-1"],
  nextStepId: "dm-1",
  ...overrides,
});

const steps = [
  {
    id: "dm-1",
    type: "send_dm" as const,
    messageTemplate: "Here is the link",
  },
];

describe("automation flow validation", () => {
  it("accepts all-post targeting without selected IDs", () => {
    expect(
      validateFlow([trigger({ targetMode: "all", targetPostIds: [] })], steps)
        .errors
    ).toEqual([]);
  });

  it("requires a post when specific targeting is selected", () => {
    expect(
      validateFlow(
        [trigger({ targetMode: "specific", targetPostIds: [] })],
        steps
      ).errors
    ).toContain("Select at least one target post");
  });

  it("accepts a scheduled-only specific target", () => {
    expect(
      validateFlow(
        [
          trigger({
            targetMode: "specific",
            targetPostIds: [],
            pendingPostIds: ["post-1"],
          }),
        ],
        steps
      ).errors
    ).toEqual([]);
  });
});
