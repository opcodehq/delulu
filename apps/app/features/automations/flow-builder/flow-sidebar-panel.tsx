"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { ScrollArea } from "@delulu/design-system/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@delulu/design-system/components/ui/sheet";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { Icon } from "@delulu/design-system/providers/icon";
import { Delete02Icon } from "@delulu/icons";
import { ConditionPanel } from "./panels/condition-panel";
import { SendDmPanel } from "./panels/send-dm-panel";
import { TriggerPanel } from "./panels/trigger-panel";
import type {
  AutomationStep,
  ConditionStep,
  Note,
  SendDmStep,
  TriggerStep,
} from "./utils/flow-types";

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
  onUpdateStep: (id: string, step: Partial<AutomationStep>) => void;
  onDeleteStep: (id: string) => void;
  onUpdateNote?: (id: string, patch: Partial<Note>) => void;
  onDeleteNote?: (id: string) => void;
  onCreateStepForButton?: (
    stepId: string,
    buttonIndex: number,
    stepType: "send_dm" | "condition"
  ) => void;
  onRemoveStepForButton?: (stepId: string, buttonIndex: number) => void;
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
  onUpdateStep,
  onDeleteStep,
  onUpdateNote,
  onDeleteNote,
  onCreateStepForButton,
  onRemoveStepForButton,
}: FlowSidebarPanelProps) {
  if (!selectedId) {
    return null;
  }

  // Check if it's a trigger
  const trigger = triggers.find((t) => t.id === selectedId);
  if (trigger) {
    return (
      <Sheet onOpenChange={(o) => !o && onClose()} open>
        <SheetContent className="w-[400px] p-0 sm:max-w-[400px]">
          <SheetHeader className="border-border border-b px-6 py-4">
            <SheetTitle>Trigger Configuration</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-73px)]">
            <div className="px-6 py-5">
              <TriggerPanel
                instagramProviders={instagramProviders}
                onChange={(updated) => onUpdateTrigger(trigger.id, updated)}
                onSocialProviderChange={onSocialProviderChange}
                socialProviderId={socialProviderId}
                trigger={trigger}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  // Check if it's a note
  const note = notes.find((n) => n.id === selectedId);
  if (note) {
    return (
      <Sheet onOpenChange={(o) => !o && onClose()} open>
        <SheetContent className="w-[400px] p-0 sm:max-w-[400px]">
          <SheetHeader className="border-border border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <SheetTitle>Note</SheetTitle>
              <Button
                className="text-destructive hover:text-destructive"
                onClick={() => onDeleteNote?.(note.id)}
                size="sm"
                variant="ghost"
              >
                <Icon className="mr-1" icon={Delete02Icon} size={14} />
                Delete
              </Button>
            </div>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-73px)]">
            <div className="px-6 py-5">
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
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  // It's a step
  const step = steps.find((s) => s.id === selectedId);
  if (!step) {
    return null;
  }

  const panelTitle = step.type === "condition" ? "Condition" : "Send DM";

  return (
    <Sheet onOpenChange={(o) => !o && onClose()} open>
      <SheetContent className="w-[400px] p-0 sm:max-w-[400px]">
        <SheetHeader className="border-border border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle>{panelTitle}</SheetTitle>
            <Button
              className="text-destructive hover:text-destructive"
              onClick={() => onDeleteStep(step.id)}
              size="sm"
              variant="ghost"
            >
              <Icon className="mr-1" icon={Delete02Icon} size={14} />
              Delete
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-73px)]">
          <div className="px-6 py-5">
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
                    ? (buttonIndex) =>
                        onRemoveStepForButton(step.id, buttonIndex)
                    : undefined
                }
                step={step as SendDmStep}
              />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
