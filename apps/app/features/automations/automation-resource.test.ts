import { describe, expect, it } from "vitest";
import {
  automationConfigurationChanged,
  automationFromResource,
  getApiErrorDetails,
  triggersToResource,
} from "@/features/automations/automation-resource";

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
  it("replaces a pending target with the editor's live selection", () => {
    expect(
      triggersToResource([
        {
          id: "trigger_1",
          type: "trigger",
          triggerType: "COMMENT",
          targetMode: "specific",
          targetPostIds: ["media_live"],
          pendingPostIds: ["post_pending00001"],
        },
      ])[0]
    ).toMatchObject({
      triggerType: "comment",
      targetPostIds: ["media_live"],
      pendingPostIds: [],
    });
  });

  it("saves only the selected live and scheduled targets", () => {
    expect(
      triggersToResource([
        {
          id: "trigger_1",
          type: "trigger",
          triggerType: "COMMENT",
          targetMode: "specific",
          targetPostIds: ["media_live", "pending:post_selected0001"],
          pendingPostIds: ["post_removed0001"],
        },
      ])[0]
    ).toMatchObject({
      targetPostIds: ["media_live"],
      pendingPostIds: ["post_selected0001"],
    });
  });

  it("clears pending targets when targeting all posts", () => {
    expect(
      triggersToResource([
        {
          id: "trigger_1",
          type: "trigger",
          triggerType: "COMMENT",
          targetMode: "all",
          targetPostIds: [],
          pendingPostIds: ["post_pending00001"],
        },
      ])[0]
    ).toMatchObject({
      targetMode: "all",
      targetPostIds: [],
      pendingPostIds: [],
    });
  });

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
