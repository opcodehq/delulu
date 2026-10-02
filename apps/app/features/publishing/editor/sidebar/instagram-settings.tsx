"use client";

import { DEFAULT_INSTAGRAM_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { InstagramSettings } from "@delulu/core/publishing/post";
import {
  Alert,
  AlertDescription,
} from "@delulu/design-system/components/ui/alert";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Separator } from "@delulu/design-system/components/ui/separator";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Comment01Icon,
  InformationCircleIcon,
  MailSend01Icon,
  TickDouble01Icon,
} from "@delulu/icons";
import { useCallback } from "react";
import { SendDmPanel } from "@/features/automations/flow-builder/panels/send-dm-panel";
import {
  AUTOMATION_TEMPLATES,
  type AutomationTemplate,
} from "@/features/automations/flow-builder/templates/automation-templates";
import type {
  AutomationConditionOperator,
  AutomationStep,
  SendDmStep,
} from "@/features/automations/flow-builder/utils/flow-types";
import { createTrigger } from "@/features/automations/flow-builder/utils/step-helpers";
import { useAutomationConfig, useStore } from "@/features/publishing/store";

const COMMENT_TEMPLATES = AUTOMATION_TEMPLATES.filter(
  (t) => t.triggerType === "COMMENT"
);

const TEMPLATE_ICONS: Record<string, typeof Comment01Icon> = {
  "grow-followers-comments": TickDouble01Icon,
  "email-collection": MailSend01Icon,
  "lead-magnet": Comment01Icon,
};

const TEMPLATE_GRADIENTS: Record<string, string> = {
  "grow-followers-comments": "from-purple-500 to-pink-500",
  "email-collection": "from-blue-500 to-cyan-500",
  "lead-magnet": "from-amber-500 to-orange-500",
};

interface InstagramSettingsProps {
  hasVideo: boolean;
  providerId: string;
}

/**
 * Find the primary DM step to show in the inline editor.
 * For simple templates (first step is send_dm), returns it directly.
 * For condition-based templates, returns the "yes" branch DM step.
 */
function getPrimaryDmStep(steps: AutomationStep[]): SendDmStep | null {
  const first = steps[0];
  if (!first) {
    return null;
  }
  if (first.type === "send_dm") {
    return first;
  }
  if (first.type === "condition") {
    const yesStep = steps.find((s) => s.id === first.yesStepId);
    if (yesStep?.type === "send_dm") {
      return yesStep;
    }
  }
  return (steps.find((s) => s.type === "send_dm") as SendDmStep) ?? null;
}

export function InstagramSettingsDisplay({
  hasVideo,
  providerId,
}: InstagramSettingsProps) {
  const { setProviderSettings, getProviderSettings, setAutomationConfig } =
    useStore();
  const automationConfig = useAutomationConfig(providerId);
  const providerSetting = getProviderSettings(providerId);
  const instagramSettings =
    providerSetting?.type === "INSTAGRAM"
      ? providerSetting.settings
      : undefined;

  const settings = instagramSettings ?? DEFAULT_INSTAGRAM_SETTINGS;

  const updateSettings = useCallback(
    (updates: Partial<InstagramSettings>) => {
      const newSettings = { ...settings, ...updates };
      setProviderSettings(providerId, {
        socialProviderId: providerId,
        type: "INSTAGRAM",
        settings: newSettings,
      });
    },
    [providerId, setProviderSettings, settings]
  );

  const handleSelectTemplate = useCallback(
    (template: AutomationTemplate) => {
      const { steps, firstStepId, notes, nodePositions } =
        template.buildSteps();
      const trigger = createTrigger({
        triggerType: template.triggerType,
        targetPostIds: [],
        nextStepId: firstStepId,
        commentReply: {
          enabled: true,
          replies: [
            "Check your DMs! 📨",
            "DM sent! 🎉",
            "Sent you a message ✉️",
          ],
        },
      });
      setAutomationConfig(providerId, {
        templateSlug: template.slug,
        socialProviderId: providerId,
        name: template.name,
        triggers: [trigger],
        steps,
        notes,
        nodePositions,
        isActive: true,
      });
    },
    [providerId, setAutomationConfig]
  );

  const handleRemoveTemplate = useCallback(() => {
    setAutomationConfig(providerId, null);
  }, [providerId, setAutomationConfig]);

  const handleDmStepChange = useCallback(
    (updatedStep: SendDmStep) => {
      if (!automationConfig) {
        return;
      }
      const newSteps = automationConfig.steps.map((s) =>
        s.id === updatedStep.id ? updatedStep : s
      );
      setAutomationConfig(providerId, {
        ...automationConfig,
        steps: newSteps,
      });
    },
    [providerId, automationConfig, setAutomationConfig]
  );

  const handleKeywordFilterChange = useCallback(
    (
      mode: "any" | "specific",
      operator?: AutomationConditionOperator,
      value?: string
    ) => {
      if (!automationConfig) {
        return;
      }
      const trigger = automationConfig.triggers[0];
      if (!trigger) {
        return;
      }

      const keywordFilter =
        mode === "any"
          ? { operator: "always" as const, value: undefined }
          : {
              operator: operator ?? ("contains" as AutomationConditionOperator),
              value: value ?? "",
            };

      const newTriggers = [{ ...trigger, keywordFilter }];
      setAutomationConfig(providerId, {
        ...automationConfig,
        triggers: newTriggers,
      });
    },
    [providerId, automationConfig, setAutomationConfig]
  );

  const currentFilter = automationConfig?.triggers[0]?.keywordFilter;
  const isSpecificKeyword =
    currentFilter != null && currentFilter.operator !== "always";

  const primaryDmStep = automationConfig
    ? getPrimaryDmStep(automationConfig.steps)
    : null;
  const hasMultipleSteps = automationConfig
    ? automationConfig.steps.length > 1
    : false;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Instagram Settings</h3>

      {/* Trial Reels */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="trial-reels">Trial Reel</Label>
            <p className="text-muted-foreground text-xs">
              Post as a trial reel — only visible to non-followers initially
            </p>
          </div>
          <Switch
            checked={settings.trialReels}
            disabled={!hasVideo}
            id="trial-reels"
            onCheckedChange={(checked) =>
              updateSettings({ trialReels: checked })
            }
          />
        </div>

        {!hasVideo && (
          <p className="text-muted-foreground text-xs italic">
            Trial reels are only available for video content.
          </p>
        )}

        {settings.trialReels && hasVideo && (
          <div className="space-y-2">
            <Label>Graduation Strategy</Label>
            <Select
              onValueChange={(value) =>
                updateSettings({
                  graduationStrategy: value as "MANUAL" | "SS_PERFORMANCE",
                })
              }
              value={settings.graduationStrategy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="SS_PERFORMANCE">
                  Auto (Performance-based)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {settings.graduationStrategy === "MANUAL"
                ? "You decide when to share the reel to your feed."
                : "Instagram will automatically share the reel to your feed if it performs well."}
            </p>

            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <Icon
                className="text-blue-600 dark:text-blue-400"
                icon={InformationCircleIcon}
                size={16}
              />
              <AlertDescription className="text-blue-800 dark:text-blue-300">
                Trial reels are shown to a small audience of non-followers
                first. Based on performance (or your manual choice), they can
                later be shared to your full audience.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      {/* Automation Section */}
      <Separator />

      <div className="space-y-3">
        <h3 className="font-semibold">Comment Automation</h3>
        <p className="text-muted-foreground text-xs">
          Auto-reply with a DM when someone comments on this post.
        </p>

        {automationConfig ? (
          /* Selected Template — Inline Editor */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{automationConfig.name}</p>
                <Badge className="px-1 py-0 text-[9px]" variant="secondary">
                  {automationConfig.steps.length}{" "}
                  {automationConfig.steps.length === 1 ? "step" : "steps"}
                </Badge>
              </div>
              <div className="flex gap-1.5">
                <Button
                  onClick={handleRemoveTemplate}
                  size="sm"
                  variant="ghost"
                >
                  Change
                </Button>
              </div>
            </div>

            {/* Keyword Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Trigger on</Label>
              <div className="flex gap-1.5">
                <Button
                  className="flex-1 text-xs"
                  onClick={() => handleKeywordFilterChange("any")}
                  size="sm"
                  variant={isSpecificKeyword ? "outline" : "default"}
                >
                  Any comment
                </Button>
                <Button
                  className="flex-1 text-xs"
                  onClick={() =>
                    handleKeywordFilterChange(
                      "specific",
                      "contains",
                      currentFilter?.value ?? ""
                    )
                  }
                  size="sm"
                  variant={isSpecificKeyword ? "default" : "outline"}
                >
                  Specific keyword
                </Button>
              </div>

              {isSpecificKeyword && (
                <div className="space-y-2">
                  <Select
                    onValueChange={(value) =>
                      handleKeywordFilterChange(
                        "specific",
                        value as AutomationConditionOperator,
                        currentFilter?.value ?? ""
                      )
                    }
                    value={currentFilter.operator}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="starts_with">Starts with</SelectItem>
                      <SelectItem value="ends_with">Ends with</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs"
                    onChange={(e) =>
                      handleKeywordFilterChange(
                        "specific",
                        currentFilter.operator as AutomationConditionOperator,
                        e.target.value
                      )
                    }
                    placeholder="e.g. LINK"
                    value={currentFilter.value ?? ""}
                  />
                </div>
              )}
            </div>

            {primaryDmStep && (
              <SendDmPanel onChange={handleDmStepChange} step={primaryDmStep} />
            )}

            {hasMultipleSteps && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <Icon
                  className="text-amber-600 dark:text-amber-400"
                  icon={InformationCircleIcon}
                  size={16}
                />
                <AlertDescription className="text-amber-800 text-xs dark:text-amber-300">
                  This template has additional steps (conditions, follow-up
                  DMs). You can customize them in the flow builder after saving.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          /* Template Picker */
          <div className="grid grid-cols-1 gap-1.5">
            {COMMENT_TEMPLATES.map((template) => {
              const TemplateIcon =
                TEMPLATE_ICONS[template.slug] ?? Comment01Icon;
              const gradient =
                TEMPLATE_GRADIENTS[template.slug] ??
                "from-purple-500 to-pink-500";

              return (
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all",
                    "border-border hover:border-primary/40 hover:bg-muted/50"
                  )}
                  key={template.slug}
                  onClick={() => handleSelectTemplate(template)}
                  type="button"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
                      gradient
                    )}
                  >
                    <Icon
                      className="text-white"
                      icon={TemplateIcon}
                      size={16}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-xs">{template.name}</p>
                      <Badge
                        className="px-1 py-0 text-[9px]"
                        variant="secondary"
                      >
                        {template.stepCount}
                      </Badge>
                    </div>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
