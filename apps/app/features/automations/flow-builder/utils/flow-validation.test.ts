import { describe, expect, it } from "vitest";
import type { TriggerStep } from "@/features/automations/flow-builder/utils/flow-types";
import {
  sendDmIssue,
  triggerIssue,
  validateFlow,
} from "@/features/automations/flow-builder/utils/flow-validation";

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

describe("node issues", () => {
  it("labels what a trigger is missing", () => {
    expect(triggerIssue(trigger({ targetPostIds: [] }))?.label).toBe(
      "Choose posts"
    );
    expect(
      triggerIssue(
        trigger({ keywordFilter: { operator: "contains", value: " " } })
      )?.label
    ).toBe("Add a keyword");
    expect(triggerIssue(trigger())).toBeUndefined();
  });

  it("labels what a DM is missing, matching the flow-level message", () => {
    const empty = { ...steps[0], messageTemplate: " " };
    expect(sendDmIssue(empty)?.label).toBe("Write a message");
    expect(validateFlow([trigger()], [empty]).errors).toContain(
      sendDmIssue(empty)?.message
    );
    expect(
      sendDmIssue({
        ...steps[0],
        buttons: [{ type: "url", title: "Open", url: "not a url" }],
      })?.label
    ).toBe("Fix the link");
    expect(sendDmIssue(steps[0])).toBeUndefined();
  });

  it("reports each kind of DM problem once", () => {
    const empty = (id: string) => ({ ...steps[0], id, messageTemplate: "" });
    const errors = validateFlow(
      [trigger({ nextStepId: "a" })],
      [{ ...empty("a"), nextStepId: "b" }, empty("b")]
    ).errors;
    expect(
      errors.filter((e) => e === "All Send DM steps must have a message")
    ).toHaveLength(1);
  });
});
