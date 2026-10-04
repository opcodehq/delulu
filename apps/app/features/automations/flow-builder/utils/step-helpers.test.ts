import { describe, expect, it } from "vitest";
import {
  NODE_WIDTH,
  stepsToFlow,
} from "@/features/automations/flow-builder/utils/auto-layout";
import type {
  AutomationStep,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";
import {
  defaultInsertSlot,
  insertStepAfter,
  openSlots,
} from "@/features/automations/flow-builder/utils/step-helpers";

const trigger = (id: string, nextStepId?: string): TriggerStep => ({
  id,
  type: "trigger",
  triggerType: "COMMENT",
  targetMode: "all",
  targetPostIds: [],
  nextStepId,
});
const dm = (id: string, nextStepId?: string): AutomationStep => ({
  id,
  type: "send_dm",
  messageTemplate: "Hi",
  nextStepId,
});
const condition = (
  id: string,
  yesStepId?: string,
  noStepId?: string
): AutomationStep => ({
  id,
  type: "condition",
  operator: "is_follower",
  yesStepId,
  noStepId,
});

describe("open slots", () => {
  it("lists open ends in flow order, yes before no, loose steps last", () => {
    const steps = [dm("loose"), condition("check", "yes-dm"), dm("yes-dm")];
    expect(openSlots([trigger("t", "check")], steps)).toEqual([
      { parentId: "check", branch: "no" },
      { parentId: "yes-dm", branch: "next" },
      { parentId: "loose", branch: "next" },
    ]);
  });

  it("offers the trigger itself before anything is connected", () => {
    expect(openSlots([trigger("t")], [])).toEqual([
      { parentId: "t", branch: "next" },
    ]);
  });
});

describe("default insert slot", () => {
  it("attaches below the selected step's first open branch", () => {
    const steps = [condition("check", "yes-dm"), dm("yes-dm")];
    expect(defaultInsertSlot([trigger("t", "check")], steps, "check")).toEqual({
      parentId: "check",
      branch: "no",
    });
  });

  it("inserts directly after a selected step that is already connected", () => {
    const steps = [dm("first", "second"), dm("second")];
    expect(defaultInsertSlot([trigger("t", "first")], steps, "first")).toEqual({
      parentId: "first",
      branch: "next",
    });
  });

  it("falls back to the end of the flow without a selection", () => {
    const steps = [dm("first", "second"), dm("second")];
    expect(defaultInsertSlot([trigger("t", "first")], steps, null)).toEqual({
      parentId: "second",
      branch: "next",
    });
  });

  it("has nowhere to attach in an empty flow", () => {
    expect(defaultInsertSlot([], [], null)).toBeUndefined();
  });
});

describe("insert step after", () => {
  it("keeps every trigger on the shared chain when inserting after one", () => {
    const result = insertStepAfter(
      [trigger("a", "dm"), trigger("b", "dm")],
      [dm("dm")],
      "a",
      "next",
      condition("check")
    );
    expect(result.triggers.map((t) => t.nextStepId)).toEqual([
      "check",
      "check",
    ]);
    expect(result.steps.find((s) => s.id === "check")).toMatchObject({
      yesStepId: "dm",
    });
  });

  it("moves the existing child below the new step on the No branch", () => {
    const result = insertStepAfter(
      [trigger("t", "check")],
      [condition("check", undefined, "old")],
      "check",
      "no",
      dm("new")
    );
    expect(result.steps.find((s) => s.id === "check")).toMatchObject({
      noStepId: "new",
    });
    expect(result.steps.find((s) => s.id === "new")).toMatchObject({
      nextStepId: "old",
    });
  });
});

describe("flow layout", () => {
  const positions = (triggers: TriggerStep[], steps: AutomationStep[]) =>
    Object.fromEntries(
      stepsToFlow(triggers, steps).nodes.map((n) => [n.id, n.position])
    );

  it("stacks a linear flow in one column under the trigger", () => {
    const at = positions([trigger("t", "a")], [dm("a", "b"), dm("b")]);
    expect(at.a.x).toBe(at.t.x);
    expect(at.b.x).toBe(at.t.x);
    expect(at.b.y).toBeGreaterThan(at.a.y);
  });

  it("keeps a lone branch on its own side of the condition", () => {
    const at = positions(
      [trigger("t", "check")],
      [condition("check", undefined, "no-dm"), dm("no-dm")]
    );
    expect(at.check.x).toBe(at.t.x);
    expect(at["no-dm"].x).toBeGreaterThan(at.check.x);
  });

  it("gives nested branches room so cards never overlap", () => {
    const at = positions(
      [trigger("t", "root")],
      [
        condition("root", "left", "right"),
        condition("left", "l1", "l2"),
        condition("right", "r1", "r2"),
        dm("l1"),
        dm("l2"),
        dm("r1"),
        dm("r2"),
      ]
    );
    const row = ["l1", "l2", "r1", "r2"].map((id) => at[id].x);
    for (let i = 1; i < row.length; i++) {
      expect(row[i] - row[i - 1]).toBeGreaterThanOrEqual(NODE_WIDTH);
    }
  });
});
