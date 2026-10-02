"use client";

import type { AutomationScope } from "@delulu/client";
import { useMemo } from "react";
import { useWorkspace } from "@/shell/providers/workspace";
import type {
  AutomationStep,
  Note,
  TriggerStep,
} from "./flow-builder/utils/flow-types";

export const AUTOMATION_PLATFORM = "instagram" as const;
export const AUTOMATION_CATEGORY = "dm";

export interface AutomationResourceView {
  readonly id: string;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly platform: string;
  readonly category: string;
  readonly name: string;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly triggers: TriggerStep[];
  readonly steps: AutomationStep[];
  readonly notes: Note[];
  readonly nodePositions: Readonly<
    Record<string, { readonly x: number; readonly y: number }>
  >;
  readonly totalTriggered: number;
  readonly totalDmsSent: number;
  readonly totalFailed: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type ResourceTrigger = Omit<TriggerStep, "triggerType"> & {
  readonly triggerType: "comment" | "mention" | "story_reply";
};

interface ResourceAutomationShape
  extends Omit<AutomationResourceView, "triggers"> {
  readonly triggers: readonly ResourceTrigger[];
}

const triggerFromResource = (
  triggerType: ResourceTrigger["triggerType"]
): TriggerStep["triggerType"] => {
  switch (triggerType) {
    case "mention":
      return "MENTION";
    case "story_reply":
      return "STORY_REPLY";
    default:
      return "COMMENT";
  }
};

const triggerToResource = (
  triggerType: TriggerStep["triggerType"]
): ResourceTrigger["triggerType"] => {
  switch (triggerType) {
    case "MENTION":
      return "mention";
    case "STORY_REPLY":
      return "story_reply";
    default:
      return "comment";
  }
};

export const automationFromResource = (
  input: unknown
): AutomationResourceView => {
  const automation = input as ResourceAutomationShape;
  return {
    ...automation,
    nodePositions: automation.nodePositions ?? {},
    triggers: (automation.triggers ?? []).map((trigger) => ({
      ...trigger,
      targetMode:
        trigger.targetMode ??
        (trigger.targetPostIds.length === 0 &&
        (trigger.pendingPostIds?.length ?? 0) === 0
          ? "all"
          : "specific"),
      targetPostIds: [...trigger.targetPostIds],
      pendingPostIds: trigger.pendingPostIds
        ? [...trigger.pendingPostIds]
        : undefined,
      triggerType: triggerFromResource(trigger.triggerType),
    })),
    steps: [...(automation.steps ?? [])],
    notes: [...(automation.notes ?? [])],
  };
};

export const triggersToResource = (triggers: readonly TriggerStep[]) =>
  triggers.map((trigger) => ({
    ...trigger,
    triggerType: triggerToResource(trigger.triggerType),
  }));

const canonicalNodePositions = (
  positions: AutomationResourceView["nodePositions"]
) =>
  Object.fromEntries(
    Object.entries(positions).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );

export const automationConfigurationChanged = (
  loaded: AutomationResourceView,
  latest: AutomationResourceView
): boolean =>
  JSON.stringify({
    connectionId: loaded.connectionId,
    name: loaded.name,
    description: loaded.description,
    enabled: loaded.enabled,
    triggers: loaded.triggers,
    steps: loaded.steps,
    notes: loaded.notes,
    nodePositions: canonicalNodePositions(loaded.nodePositions),
  }) !==
  JSON.stringify({
    connectionId: latest.connectionId,
    name: latest.name,
    description: latest.description,
    enabled: latest.enabled,
    triggers: latest.triggers,
    steps: latest.steps,
    notes: latest.notes,
    nodePositions: canonicalNodePositions(latest.nodePositions),
  });

export type ApiErrorKind =
  | "permission"
  | "not-found"
  | "validation"
  | "conflict"
  | "transport";

export interface ApiErrorDetails {
  readonly kind: ApiErrorKind;
  readonly message: string;
}

export const getApiErrorDetails = (error: unknown): ApiErrorDetails => {
  const tagged = error as { readonly _tag?: string; readonly message?: string };
  const message =
    tagged.message ??
    (error instanceof Error
      ? error.message
      : "The request could not be completed");

  switch (tagged._tag) {
    case "ForbiddenError":
    case "UnauthorizedError":
      return { kind: "permission", message };
    case "NotFoundError":
      return { kind: "not-found", message };
    case "ValidationError":
      return { kind: "validation", message };
    case "ConflictError":
      return { kind: "conflict", message };
    default:
      return { kind: "transport", message };
  }
};

export function useAutomationWorkspace() {
  const workspace = useWorkspace();

  const scope = useMemo<AutomationScope | undefined>(
    () =>
      workspace.workspaceId
        ? {
            workspaceId: workspace.workspaceId,
            platform: AUTOMATION_PLATFORM,
            category: AUTOMATION_CATEGORY,
          }
        : undefined,
    [workspace.workspaceId]
  );

  return {
    scope,
    workspaceId: workspace.workspaceId ?? undefined,
    isPending: workspace.isLoading,
    isError: workspace.isError,
    error: workspace.error,
    refetch: workspace.refetch,
  };
}
