import type { PostWrite } from "@delulu/contracts";
import { describe, expect, it } from "vitest";
import {
  assertContentReceiptOwner,
  prepareContentWrite,
} from "./content-action-policy";

const scheduled: typeof PostWrite.Type = {
  groups: [
    { id: "group", isDefault: true, segments: [{ text: "Draft", media: [] }] },
  ],
  targets: [
    {
      connectionId: "connection",
      groupId: "group",
      settings: {
        platform: "INSTAGRAM",
        values: {
          shareToFeed: true,
          shareToStory: false,
          trialReels: false,
          graduationStrategy: "MANUAL",
        },
      },
      scheduledAt: "2030-01-01T00:00:00Z",
    },
  ],
  intent: "publish_now",
};

describe("Content action capabilities", () => {
  it.each([
    "create_draft",
    "update_draft",
  ] as const)("%s cannot enqueue delivery", (kind) => {
    const value = prepareContentWrite(kind, scheduled, "receipt");
    expect(value.intent).toBe("draft");
    expect(value.targets.every((target) => target.scheduledAt === null)).toBe(
      true
    );
    expect(value.source).toBe("automation");
    expect(scheduled.targets[0]?.scheduledAt).toBe("2030-01-01T00:00:00Z");
    expect(value.externalSubmissionId).toBe(
      kind === "create_draft" ? "receipt" : undefined
    );
  });

  it("retains delivery times only for schedule approval", () => {
    const value = prepareContentWrite("schedule", scheduled, "receipt");
    expect(value.intent).toBe("schedule");
    expect(value.targets).toEqual(scheduled.targets);
  });
});

describe("Content receipt ownership", () => {
  const owner = {
    callerEmail: "user@example.invalid",
    workspaceId: "workspace",
    actionKind: "create_draft",
  };
  it("accepts an exact owner and action match", () => {
    expect(() => assertContentReceiptOwner(owner, owner)).not.toThrow();
  });
  it.each([
    "callerEmail",
    "workspaceId",
    "actionKind",
  ] as const)("rejects reused keys with a different %s", (field) => {
    expect(() =>
      assertContentReceiptOwner({ ...owner, [field]: "different" }, owner)
    ).toThrow("does not match");
  });
});
