"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { ScrollArea } from "@delulu/design-system/components/ui/scroll-area";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Cancel01Icon, Delete02Icon } from "@delulu/icons";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { AddStepMenu } from "@/features/automations/flow-builder/add-step-menu";
import { ConditionPanel } from "@/features/automations/flow-builder/panels/condition-panel";
import { SendDmPanel } from "@/features/automations/flow-builder/panels/send-dm-panel";
import { TriggerPanel } from "@/features/automations/flow-builder/panels/trigger-panel";
import {
  type AddableStepType,
  FLOW_NODE_KINDS,
  type FlowNodeKind,
} from "@/features/automations/flow-builder/step-kinds";
import type {
  AutomationStep,
  ConditionStep,
  Note,
  SendDmStep,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";

interface SocialProvider {
  _id: string;
  username?: string;
  fullName?: string;
  profileImageUrl?: string;
}

interface FlowSidebarPanelProps {
  selectedId: string | null;
  triggers: TriggerStep[];
  steps: AutomationStep[];
  notes: Note[];
  socialProviderId: string;
  instagramProviders: SocialProvider[];
  isFreePlan?: boolean;
  onSocialProviderChange: (id: string) => void;
  onClose: () => void;
  onUpdateTrigger: (id: string, trigger: TriggerStep) => void;
  onDeleteTrigger?: (id: string) => void;
  onUpdateStep: (id: string, step: Partial<AutomationStep>) => void;
  onDeleteStep: (id: string) => void;
  /** Add a step directly below the given trigger or step. */
  onAddNextStep?: (parentId: string, type: AddableStepType) => void;
  onUpdateNote?: (id: string, patch: Partial<Note>) => void;
  onDeleteNote?: (id: string) => void;
  onCreateStepForButton?: (
    stepId: string,
    buttonIndex: number,
    stepType: "send_dm" | "condition"
  ) => void;
  onRemoveStepForButton?: (stepId: string, buttonIndex: number) => void;
}

interface InspectorProps {
  kind: FlowNodeKind;
  onClose: () => void;
  onDelete?: () => void;
  onAddNext?: (type: AddableStepType) => void;
  children: ReactNode;
}

/**
 * Non-modal inspector docked over the right of the canvas, so the flow stays
 * visible and clickable while a step is edited.
 */
function Inspector({
  kind,
  onClose,
  onDelete,
  onAddNext,
  children,
}: InspectorProps) {
  const headingId = useId();
  const style = FLOW_NODE_KINDS[kind];
  const panelRef = useRef<HTMLElement>(null);

  // Escape closes the panel while focus is inside it. Menus portal outside
  // the panel and handle their own Escape.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        panelRef.current?.contains(event.target as globalThis.Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      aria-labelledby={headingId}
      aria-modal="false"
      className="absolute top-3 right-3 bottom-3 z-10 flex w-[340px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-md"
      ref={panelRef}
      role="dialog"
    >
      <header className="flex items-center gap-2 border-b py-1 pr-1 pl-3">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded",
            style.tile
          )}
        >
          <Icon icon={style.icon} size={13} />
        </span>
        <h2
          className="min-w-0 flex-1 truncate font-medium text-sm"
          id={headingId}
        >
          {style.label}
        </h2>
        {onDelete ? (
          <Button
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            size="sm"
            variant="ghost"
          >
            <Icon icon={Delete02Icon} size={14} />
            Delete
          </Button>
        ) : null}
        <Button
          aria-label="Close"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <Icon icon={Cancel01Icon} size={14} />
        </Button>
      </header>
      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        viewportClassName="[&>div]:block!"
      >
        <div className="min-w-0 p-4">{children}</div>
      </ScrollArea>
      {onAddNext ? (
        <footer className="border-t p-2">
          <AddStepMenu align="center" onAdd={onAddNext} side="top">
            <Button className="w-full" size="sm">
              <Icon icon={Add01Icon} size={14} />
              Add next step
            </Button>
          </AddStepMenu>
        </footer>
      ) : null}
    </aside>
  );
}

export function FlowSidebarPanel({
  selectedId,
  triggers,
  steps,
  notes,
  socialProviderId,
  instagramProviders,
  isFreePlan,
  onSocialProviderChange,
  onClose,
  onUpdateTrigger,
  onDeleteTrigger,
  onUpdateStep,
  onDeleteStep,
  onAddNextStep,
  onUpdateNote,
  onDeleteNote,
  onCreateStepForButton,
  onRemoveStepForButton,
}: FlowSidebarPanelProps) {
  if (!selectedId) {
    return null;
  }
  const addNextFrom = (parentId: string) =>
    onAddNextStep
      ? (type: AddableStepType) => onAddNextStep(parentId, type)
      : undefined;

  const trigger = triggers.find((t) => t.id === selectedId);
  if (trigger) {
    return (
      <Inspector
        key={trigger.id}
        kind="trigger"
        onAddNext={addNextFrom(trigger.id)}
        onClose={onClose}
        onDelete={
          onDeleteTrigger ? () => onDeleteTrigger(trigger.id) : undefined
        }
      >
        <TriggerPanel
          instagramProviders={instagramProviders}
          onChange={(updated) => onUpdateTrigger(trigger.id, updated)}
          onSocialProviderChange={onSocialProviderChange}
          socialProviderId={socialProviderId}
          trigger={trigger}
        />
      </Inspector>
    );
  }

  const note = notes.find((n) => n.id === selectedId);
  if (note) {
    return (
      <Inspector
        key={note.id}
        kind="note"
        onClose={onClose}
        onDelete={onDeleteNote ? () => onDeleteNote(note.id) : undefined}
      >
        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="note-content">
            Content
          </label>
          <Textarea
            id="note-content"
            onChange={(e) =>
              onUpdateNote?.(note.id, { content: e.target.value })
            }
            placeholder="Write a note to explain this part of your flow..."
            rows={6}
            value={note.content}
          />
        </div>
      </Inspector>
    );
  }

  const step = steps.find((s) => s.id === selectedId);
  if (!step) {
    return null;
  }

  return (
    <Inspector
      key={step.id}
      kind={step.type}
      onAddNext={addNextFrom(step.id)}
      onClose={onClose}
      onDelete={() => onDeleteStep(step.id)}
    >
      {step.type === "condition" && (
        <ConditionPanel
          onChange={(updated) => onUpdateStep(step.id, updated)}
          step={step as ConditionStep}
        />
      )}
      {step.type === "send_dm" && (
        <SendDmPanel
          commentPrivateReply={triggers.some(
            (candidate) => candidate.triggerType === "COMMENT"
          )}
          isFreePlan={isFreePlan}
          onChange={(updated) => onUpdateStep(step.id, updated)}
          onCreateStepForButton={
            onCreateStepForButton
              ? (buttonIndex, stepType) =>
                  onCreateStepForButton(step.id, buttonIndex, stepType)
              : undefined
          }
          onRemoveStepForButton={
            onRemoveStepForButton
              ? (buttonIndex) => onRemoveStepForButton(step.id, buttonIndex)
              : undefined
          }
          step={step as SendDmStep}
        />
      )}
    </Inspector>
  );
}
