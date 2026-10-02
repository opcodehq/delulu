"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Separator } from "@delulu/design-system/components/ui/separator";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  ArrowLeft01Icon,
  CheckmarkCircle01Icon,
  Comment01Icon,
  Loading03Icon,
  MailSend01Icon,
} from "@delulu/icons";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import type { UseAutomationStateReturn } from "@/features/automations/flow-builder/hooks/use-automation-state";
import { CommentReplyEditor } from "@/features/automations/flow-builder/panels/comment-reply-editor";
import { DmComposer } from "@/features/automations/flow-builder/panels/dm-composer";
import { KeywordFilterStep } from "@/features/automations/flow-builder/trigger-wizard/keyword-filter-step";
import { PostSelectorStep } from "@/features/automations/flow-builder/trigger-wizard/post-selector-step";
import { TriggerTypeStep } from "@/features/automations/flow-builder/trigger-wizard/trigger-type-step";
import type {
  AutomationTriggerType,
  CommentReply,
  KeywordFilter,
  SendDmStep,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";
import { validateFlow } from "@/features/automations/flow-builder/utils/flow-validation";
import {
  createSendDmStep,
  createTrigger,
} from "@/features/automations/flow-builder/utils/step-helpers";
import { useSubscription } from "@/features/billing/use-subscription";
import { AppLink as Link } from "@/shell/navigation/app-link";

type MobileStep = 1 | 2 | 3 | 4;

interface SocialProvider {
  _id: string;
  username?: string;
  fullName?: string;
  profileImageUrl?: string;
}

interface MobileFlowEditorProps {
  state: UseAutomationStateReturn;
  instagramProviders: SocialProvider[];
  isNew: boolean;
  isSaving: boolean;
  canSave?: boolean;
  onSave: () => Promise<void>;
  templateTriggerType?: "COMMENT" | "STORY_REPLY";
  templateFirstStepId?: string;
}

export function MobileFlowEditor({
  state,
  instagramProviders,
  isNew,
  isSaving,
  canSave = true,
  onSave,
  templateTriggerType,
  templateFirstStepId,
}: MobileFlowEditorProps) {
  const { isFree: isFreePlan } = useSubscription();
  const {
    triggers,
    steps,
    automationMeta,
    setAutomationMeta,
    addTrigger,
    updateTrigger,
    setSteps,
    markDirty,
    updateStepById,
  } = state;

  const [currentStep, setCurrentStep] = useState<MobileStep>(1);

  // Step 1 state - trigger
  const hasTrigger = triggers.length > 0;
  const trigger = triggers[0] as TriggerStep | undefined;

  // Step 3 - DM step
  const dmStep = steps.find((s) => s.type === "send_dm") as
    | SendDmStep
    | undefined;

  // The M4 API exposes stable media ids but not a separate story-thumbnail
  // feed. The review step therefore renders the selected-id summary below.
  const selectedPosts: readonly [] = [];

  const handleSelectTriggerType = useCallback(
    (type: AutomationTriggerType) => {
      if (hasTrigger && trigger) {
        updateTrigger(trigger.id, { triggerType: type });
      } else {
        // If template already set up steps, link to the first one
        const existingFirstStep =
          templateFirstStepId && steps.some((s) => s.id === templateFirstStepId)
            ? templateFirstStepId
            : steps.length > 0
              ? steps[0].id
              : undefined;

        if (existingFirstStep) {
          const newTrigger = createTrigger({
            triggerType: type,
            nextStepId: existingFirstStep,
          });
          if (instagramProviders.length > 0) {
            setAutomationMeta((prev) => ({
              ...prev,
              socialProviderId: instagramProviders[0]._id,
            }));
          }
          addTrigger(newTrigger);
        } else {
          const newDmStep = createSendDmStep();
          const newTrigger = createTrigger({
            triggerType: type,
            nextStepId: newDmStep.id,
          });
          if (instagramProviders.length > 0) {
            setAutomationMeta((prev) => ({
              ...prev,
              socialProviderId: instagramProviders[0]._id,
            }));
          }
          addTrigger(newTrigger);
          setSteps([newDmStep]);
        }
      }
    },
    [
      hasTrigger,
      trigger,
      updateTrigger,
      addTrigger,
      setSteps,
      steps,
      templateFirstStepId,
      instagramProviders,
      setAutomationMeta,
    ]
  );

  const handlePostsChange = useCallback(
    (postIds: string[]) => {
      if (trigger) {
        updateTrigger(trigger.id, { targetPostIds: postIds });
      }
    },
    [trigger, updateTrigger]
  );

  const handleTargetModeChange = useCallback(
    (targetMode: "specific" | "all") => {
      if (trigger) {
        updateTrigger(trigger.id, {
          targetMode,
          targetPostIds: targetMode === "all" ? [] : trigger.targetPostIds,
        });
      }
    },
    [trigger, updateTrigger]
  );

  const handleKeywordChange = useCallback(
    (filter: KeywordFilter | undefined) => {
      if (trigger) {
        updateTrigger(trigger.id, { keywordFilter: filter });
      }
    },
    [trigger, updateTrigger]
  );

  const handleCommentReplyChange = useCallback(
    (commentReply: CommentReply) => {
      if (trigger) {
        updateTrigger(trigger.id, { commentReply });
      }
    },
    [trigger, updateTrigger]
  );

  const handleDmChange = useCallback(
    (updated: SendDmStep) => {
      if (dmStep) {
        updateStepById(dmStep.id, updated);
      }
    },
    [dmStep, updateStepById]
  );

  const handleConfirmLaunch = useCallback(async () => {
    const result = validateFlow(triggers, steps);
    if (!result.valid) {
      const { toast } = await import("sonner");
      toast.error(result.errors[0]);
      return;
    }
    setAutomationMeta((prev) => ({ ...prev, isActive: true }));
    markDirty();
    setTimeout(() => {
      onSave();
    }, 0);
  }, [triggers, steps, setAutomationMeta, markDirty, onSave]);

  const canGoNext = (step: MobileStep): boolean => {
    switch (step) {
      case 1:
        return (
          !!trigger?.triggerType &&
          (trigger.targetMode === "all" || trigger.targetPostIds.length > 0)
        );
      case 2:
      case 3:
      case 4:
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as MobileStep);
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as MobileStep);
    }
  };

  const renderPreview = (template: string) =>
    (template || "")
      .replace(/{username}/g, "john_doe")
      .replace(/{comment_text}/g, "Great post!");

  const triggerLabel =
    trigger?.triggerType === "STORY_REPLY"
      ? "Story Reply"
      : trigger?.triggerType === "MENTION"
        ? "Mention"
        : "Comment";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href="/automations">
            <Button size="icon" variant="ghost">
              <Icon icon={ArrowLeft01Icon} size={20} />
            </Button>
          </Link>
          <span className="font-semibold text-sm">
            {isNew ? "New Automation" : "Edit Automation"}
          </span>
        </div>
        <Button
          disabled={isSaving || !canSave}
          onClick={onSave}
          size="sm"
          variant="outline"
        >
          {isSaving ? (
            <Icon className="animate-spin" icon={Loading03Icon} size={14} />
          ) : (
            "Save"
          )}
        </Button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-4 py-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              s <= currentStep ? "bg-primary" : "bg-muted"
            )}
            key={s}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        <div className="py-4">
          <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Step {currentStep} of 4
          </p>

          {currentStep === 1 && (
            <div className="space-y-4">
              <TriggerTypeStep
                onSelect={handleSelectTriggerType}
                selectedType={
                  trigger?.triggerType ?? templateTriggerType ?? null
                }
              />
              {trigger?.triggerType && automationMeta.socialProviderId && (
                <>
                  <Separator />
                  <PostSelectorStep
                    onSelectionChange={handlePostsChange}
                    onTargetModeChange={handleTargetModeChange}
                    selectedPostIds={trigger.targetPostIds}
                    socialProviderId={automationMeta.socialProviderId}
                    targetMode={trigger.targetMode}
                    triggerType={trigger.triggerType}
                  />
                </>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <KeywordFilterStep
                filter={trigger?.keywordFilter}
                onChange={handleKeywordChange}
              />
              {trigger?.triggerType === "COMMENT" && (
                <>
                  <Separator />
                  <CommentReplyEditor
                    commentReply={trigger.commentReply}
                    onChange={handleCommentReplyChange}
                  />
                </>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div>
              {dmStep ? (
                <DmComposer
                  commentPrivateReply={trigger?.triggerType === "COMMENT"}
                  isFreePlan={isFreePlan}
                  onChange={handleDmChange}
                  step={dmStep}
                />
              ) : (
                <div className="py-4 text-center">
                  <Button
                    onClick={() => {
                      const newDm = createSendDmStep();
                      setSteps((prev) => [...prev, newDm]);
                      if (trigger) {
                        updateTrigger(trigger.id, { nextStepId: newDm.id });
                      }
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Add DM Step
                  </Button>
                </div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-base">
                Awesome! Let&apos;s review once before we launch!
              </h3>

              {/* When someone... */}
              <div className="space-y-2 text-sm">
                <p className="font-semibold">When someone...</p>
                <p className="text-muted-foreground">
                  {triggerLabel === "Comment"
                    ? trigger?.targetMode === "all"
                      ? "comments on any current or future post"
                      : "comments on a selected post"
                    : triggerLabel === "Story Reply"
                      ? "replies to your story"
                      : "mentions you"}
                </p>

                {/* Post preview */}
                {selectedPosts.length > 0 ? (
                  <div className="ml-5 space-y-2">
                    {selectedPosts
                      .slice(0, 3)
                      .map(
                        (post: {
                          id: string;
                          thumbnailUrl?: string;
                          caption?: string;
                        }) => (
                          <div className="flex items-start gap-2" key={post.id}>
                            <span className="mt-1 text-muted-foreground/50">
                              ↳
                            </span>
                            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-2.5 py-2">
                              {post.thumbnailUrl && (
                                <Image
                                  alt=""
                                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                                  height={48}
                                  src={post.thumbnailUrl}
                                  width={48}
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                                  Caption
                                </p>
                                <p className="line-clamp-2 text-xs">
                                  {post.caption || "No caption"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    {selectedPosts.length > 3 && (
                      <p className="ml-7 text-[11px] text-muted-foreground">
                        +{selectedPosts.length - 3} more post(s)
                      </p>
                    )}
                  </div>
                ) : (trigger?.targetPostIds?.length ?? 0) > 0 ? (
                  <div className="ml-5 flex items-start gap-2">
                    <span className="mt-1 text-muted-foreground/50">↳</span>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-muted-foreground text-xs">
                      {trigger!.targetPostIds.length} post(s) selected
                    </div>
                  </div>
                ) : null}

                {/* Keywords */}
                {trigger?.keywordFilter &&
                  trigger.keywordFilter.operator !== "always" && (
                    <>
                      <p className="text-muted-foreground">
                        and <strong>includes</strong> the following keywords in
                        their comment
                      </p>
                      <div className="ml-5 flex items-center gap-2">
                        <span className="text-muted-foreground/50">↳</span>
                        <span className="rounded-full border px-3 py-0.5 font-mono text-xs">
                          {trigger.keywordFilter.value}
                        </span>
                      </div>
                    </>
                  )}

                {/* Comment reply */}
                {trigger?.commentReply?.enabled && (
                  <>
                    <p className="text-muted-foreground">
                      leave a reply to their comment on the post
                    </p>
                    <div className="ml-5 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground/50">↳</span>
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                            <span className="text-[10px]">👤</span>
                          </div>
                          <span className="font-medium text-xs">User</span>
                          <span className="text-muted-foreground text-xs">
                            This is a comment
                          </span>
                        </div>
                      </div>
                      <div className="ml-8 flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                          <span className="text-[10px]">🤖</span>
                        </div>
                        <span className="font-medium text-xs">You</span>
                        <span className="text-primary text-xs">@user</span>
                        <span className="text-muted-foreground text-xs">
                          {trigger.commentReply.replies[0]}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* DM section */}
                {dmStep?.messageTemplate && (
                  <>
                    <p className="pt-1 text-muted-foreground">
                      {trigger?.commentReply?.enabled
                        ? "after they click the button, send the primary DM"
                        : "then send the primary DM"}
                    </p>
                    <div className="ml-5 flex items-start gap-2">
                      <span className="mt-1 text-muted-foreground/50">↳</span>
                      <div className="min-w-0 flex-1">
                        {/* Instagram DM-style bubble */}
                        <div className="rounded-2xl rounded-bl-md border bg-muted/30 px-3.5 py-2.5">
                          <p className="whitespace-pre-wrap text-xs leading-relaxed">
                            {renderPreview(dmStep.messageTemplate)}
                          </p>
                          {isFreePlan && (
                            <p className="mt-2 border-border border-t pt-2 text-[10px] text-muted-foreground">
                              - - -<br />
                              Sent via @delulu.social
                            </p>
                          )}
                          {(dmStep.buttons?.length ?? 0) > 0 && (
                            <div className="mt-2 grid gap-1">
                              {dmStep.buttons?.map((btn, i) => (
                                <span
                                  className="flex items-center justify-center rounded-md bg-muted px-2 py-1 text-[11px]"
                                  key={`btn-${i}`}
                                >
                                  {btn.title || "Button"}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed footer — tall enough to clear tab bar */}
      <div className="fixed inset-x-0 bottom-0 z-[55] border-t bg-background px-4 pt-3 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-3">
          {currentStep > 1 && (
            <Button className="h-11 flex-1" onClick={goBack} variant="outline">
              Back
            </Button>
          )}
          {currentStep < 4 ? (
            <Button
              className="h-11 flex-1"
              disabled={!canGoNext(currentStep)}
              onClick={goNext}
            >
              Next
            </Button>
          ) : (
            <Button
              className="h-11 flex-1"
              disabled={isSaving || !canSave}
              onClick={handleConfirmLaunch}
            >
              {isSaving ? (
                <Icon
                  className="mr-2 animate-spin"
                  icon={Loading03Icon}
                  size={14}
                />
              ) : (
                <Icon className="mr-2" icon={CheckmarkCircle01Icon} size={14} />
              )}
              Confirm & Launch
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
