import type { PostWrite } from "@delulu/contracts";

/** Action labels are capabilities: a draft approval cannot authorize delivery. */
export function prepareContentWrite(
  kind: "create_draft" | "update_draft" | "schedule",
  value: typeof PostWrite.Type,
  idempotencyKey: string
): typeof PostWrite.Type {
  if (kind === "schedule") {
    return { ...value, intent: "schedule", source: "automation" };
  }
  return {
    ...value,
    intent: "draft",
    source: "automation",
    targets: value.targets.map((target) => ({ ...target, scheduledAt: null })),
    ...(kind === "create_draft"
      ? { externalSubmissionId: idempotencyKey }
      : {}),
  };
}

export interface ContentReceiptOwner {
  callerEmail: string;
  workspaceId: string;
  actionKind: string;
}

export function assertContentReceiptOwner(
  receipt: ContentReceiptOwner,
  expected: ContentReceiptOwner
): void {
  if (
    receipt.callerEmail !== expected.callerEmail ||
    receipt.workspaceId !== expected.workspaceId ||
    receipt.actionKind !== expected.actionKind
  ) {
    throw new Error("Content action receipt does not match caller and action");
  }
}
