"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { useState } from "react";
import { AccountStep } from "@/features/automations/flow-builder/trigger-wizard/account-step";
import { KeywordFilterStep } from "@/features/automations/flow-builder/trigger-wizard/keyword-filter-step";
import { PostSelectorStep } from "@/features/automations/flow-builder/trigger-wizard/post-selector-step";
import { TriggerTypeStep } from "@/features/automations/flow-builder/trigger-wizard/trigger-type-step";
import type {
  AutomationTriggerType,
  KeywordFilter,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";
import { createTrigger } from "@/features/automations/flow-builder/utils/step-helpers";
import { PostSelectorLoading } from "@/features/automations/post-selector";
import { ResourceBoundary } from "@/shell/state/resources";

interface SocialProvider {
  _id: string;
  username?: string;
  fullName?: string;
  profileImageUrl?: string;
}

interface TriggerWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (trigger: TriggerStep, socialProviderId: string) => void;
  instagramProviders: SocialProvider[];
  /** If set, skip account step (editing existing automation) */
  currentSocialProviderId?: string;
  /** Pre-select trigger type (from template) */
  defaultTriggerType?: AutomationTriggerType;
}

type WizardStep = "account" | "trigger_type" | "posts" | "keyword_filter";

export function TriggerWizard({
  open,
  onClose,
  onComplete,
  instagramProviders,
  currentSocialProviderId,
  defaultTriggerType,
}: TriggerWizardProps) {
  const skipAccount = !!currentSocialProviderId;
  const initialStep: WizardStep = skipAccount ? "trigger_type" : "account";

  const [wizardStep, setWizardStep] = useState<WizardStep>(initialStep);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    currentSocialProviderId || null
  );
  const [selectedTriggerType, setSelectedTriggerType] =
    useState<AutomationTriggerType | null>(defaultTriggerType ?? null);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<"specific" | "all">("specific");
  const [keywordFilter, setKeywordFilter] = useState<KeywordFilter | undefined>(
    undefined
  );

  // Keyword filter step is available for COMMENT and STORY_REPLY triggers
  const showKeywordStep =
    selectedTriggerType === "COMMENT" || selectedTriggerType === "STORY_REPLY";

  const handleNext = () => {
    if (wizardStep === "account") {
      setWizardStep("trigger_type");
    } else if (wizardStep === "trigger_type") {
      setWizardStep("posts");
    } else if (wizardStep === "posts") {
      if (showKeywordStep) {
        setWizardStep("keyword_filter");
      } else {
        finishWizard();
      }
    } else if (wizardStep === "keyword_filter") {
      finishWizard();
    }
  };

  const finishWizard = () => {
    if (!(selectedAccountId && selectedTriggerType)) {
      return;
    }
    const trigger = createTrigger({
      triggerType: selectedTriggerType,
      targetMode,
      targetPostIds: selectedPostIds,
      keywordFilter,
    });
    onComplete(trigger, selectedAccountId);
    // Reset state
    setWizardStep(initialStep);
    setSelectedAccountId(currentSocialProviderId || null);
    setSelectedTriggerType(null);
    setSelectedPostIds([]);
    setTargetMode("specific");
    setKeywordFilter(undefined);
  };

  const handleBack = () => {
    if (wizardStep === "keyword_filter") {
      setWizardStep("posts");
    } else if (wizardStep === "posts") {
      setWizardStep("trigger_type");
    } else if (wizardStep === "trigger_type" && !skipAccount) {
      setWizardStep("account");
    }
  };

  const canProceed =
    (wizardStep === "account" && selectedAccountId) ||
    (wizardStep === "trigger_type" && selectedTriggerType) ||
    (wizardStep === "posts" &&
      (targetMode === "all" || selectedPostIds.length > 0)) ||
    wizardStep === "keyword_filter"; // keyword filter is always valid (can skip = "any")

  const totalSteps = (skipAccount ? 0 : 1) + 2 + (showKeywordStep ? 1 : 0);

  let stepNumber: number;
  if (wizardStep === "account") {
    stepNumber = 1;
  } else if (wizardStep === "trigger_type") {
    stepNumber = skipAccount ? 1 : 2;
  } else if (wizardStep === "posts") {
    stepNumber = skipAccount ? 2 : 3;
  } else {
    // keyword_filter
    stepNumber = skipAccount ? 3 : 4;
  }

  const isLastStep =
    wizardStep === "keyword_filter" ||
    (wizardStep === "posts" && !showKeywordStep);

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Add Trigger
            <span className="ml-2 font-normal text-muted-foreground text-sm">
              Step {stepNumber} of {totalSteps}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {wizardStep === "account" && (
            <AccountStep
              onSelect={setSelectedAccountId}
              providers={instagramProviders}
              selectedId={selectedAccountId}
            />
          )}
          {wizardStep === "trigger_type" && (
            <TriggerTypeStep
              onSelect={setSelectedTriggerType}
              selectedType={selectedTriggerType}
            />
          )}
          {wizardStep === "posts" && selectedAccountId && (
            <ResourceBoundary fallback={<PostSelectorLoading />}>
              <PostSelectorStep
                onSelectionChange={setSelectedPostIds}
                onTargetModeChange={setTargetMode}
                selectedPostIds={selectedPostIds}
                socialProviderId={selectedAccountId}
                targetMode={targetMode}
                triggerType={selectedTriggerType || undefined}
              />
            </ResourceBoundary>
          )}
          {wizardStep === "keyword_filter" && (
            <KeywordFilterStep
              filter={keywordFilter}
              onChange={setKeywordFilter}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {((wizardStep === "trigger_type" && !skipAccount) ||
            wizardStep === "posts" ||
            wizardStep === "keyword_filter") && (
            <Button onClick={handleBack} variant="outline">
              Back
            </Button>
          )}
          <Button disabled={!canProceed} onClick={handleNext}>
            {isLastStep ? "Add Trigger" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
