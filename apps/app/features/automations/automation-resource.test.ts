import { describe, expect, it } from "vitest";
import {
  automationConfigurationChanged,
  automationFromResource,
  getApiErrorDetails,
  triggersToResource,
} from "./automation-resource";

const resource = {
  id: "aut_1",
  workspaceId: "ws_1",
  connectionId: "con_1",
  platform: "instagram",
  category: "dm",
  name: "Replies",
  description: null,
  enabled: true,
  triggers: triggersToResource([
    {
      id: "trigger_1",
      type: "trigger" as const,
      triggerType: "STORY_REPLY",
      targetMode: "all" as const,
      targetPostIds: [],
    },
  ]),
  steps: [],
  notes: [],
  nodePositions: {},
  totalTriggered: 0,
  totalDmsSent: 0,
  totalFailed: 0,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
};

describe("automation resource adapters", () => {
  it("converts trigger casing at the API boundary", () => {
    expect(resource.triggers[0]?.triggerType).toBe("story_reply");
    expect(automationFromResource(resource).triggers[0]?.triggerType).toBe(
      "STORY_REPLY"
    );
  });

  it("normalizes missing legacy graph metadata", () => {
    const { nodePositions: _, notes: __, ...legacyResource } = resource;

    expect(automationFromResource(legacyResource as never)).toMatchObject({
      notes: [],
      nodePositions: {},
    });
  });

  it("does not report another editor when only execution counters changed", () => {
    const latest = {
      ...resource,
      totalTriggered: 2,
      totalDmsSent: 2,
      updatedAt: "2026-07-11T00:05:00.000Z",
    };

    expect(
      automationConfigurationChanged(
        automationFromResource(resource),
        automationFromResource(latest)
      )
    ).toBe(false);
  });

  it("treats reordered node-position keys as the same configuration", () => {
    const withPositions = {
      ...resource,
      nodePositions: {
        trigger_1: { x: 0, y: 0 },
        step_1: { x: 200, y: 0 },
      },
    };
    const reordered = {
      ...withPositions,
      nodePositions: {
        step_1: { x: 200, y: 0 },
        trigger_1: { x: 0, y: 0 },
      },
    };

    expect(
      automationConfigurationChanged(
        automationFromResource(withPositions),
        automationFromResource(reordered)
      )
    ).toBe(false);
  });

  it("reports another editor when persisted configuration changed", () => {
    expect(
      automationConfigurationChanged(
        automationFromResource(resource),
        automationFromResource({
          ...resource,
          name: "Changed elsewhere",
          updatedAt: "2026-07-11T00:05:00.000Z",
        })
      )
    ).toBe(true);
  });

  it("distinguishes tagged domain errors from transport failures", () => {
    expect(
      getApiErrorDetails({
        _tag: "ForbiddenError",
        message: "You cannot edit this automation",
      })
    ).toEqual({
      kind: "permission",
      message: "You cannot edit this automation",
    });
    expect(getApiErrorDetails(new Error("Network unavailable")).kind).toBe(
      "transport"
    );
  });
});
