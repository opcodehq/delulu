"use client";

import {
  Alert,
  AlertDescription,
} from "@delulu/design-system/components/ui/alert";
import { Button } from "@delulu/design-system/components/ui/button";
import { NaturalDatePicker } from "@delulu/design-system/components/ui/natural-date-picker";
import { RadioGroup } from "@delulu/design-system/components/ui/radio-group";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Alert02Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  EyeIcon,
} from "@delulu/icons";
import { addHours, format, startOfHour } from "date-fns";
import { useMemo } from "react";
import { InlineUpgradePrompt } from "@/features/billing/upgrade-prompt";
import { ChannelSettings } from "@/features/publishing/editor/sidebar/channel-settings";
import { PreviewPanel } from "@/features/publishing/editor/sidebar/previews/preview-panel";
import { SocialIcon } from "@/features/publishing/editor/sidebar/social-icon";
import { TikTokConsentBanner } from "@/features/publishing/editor/sidebar/tiktok-consent-banner";
import { getPublishIssues } from "@/features/publishing/publish-readiness";
import {
  useDateTime,
  usePost,
  useSelectedSocialProviders,
  useStore,
} from "@/features/publishing/store";
import { usePostActions } from "@/features/publishing/use-post-actions";
import { ChoiceRadio } from "@/shared/choice-radio";

interface BasicSettingsProps {
  onOpenPreview?: () => void;
  showPreviewAction?: boolean;
  /** Render the live post preview inside the panel (wide layouts). */
  inlinePreview?: boolean;
}

export function BasicSettings({
  onOpenPreview,
  showPreviewAction = false,
  inlinePreview = false,
}: BasicSettingsProps = {}) {
  const selected = useSelectedSocialProviders();
  const actions = usePostActions();
  const hasTikTok = selected.some(
    (provider) => provider.socialType === "TIKTOK"
  );

  return (
    <div className="divide-y-[1.5px] divide-dotted divide-zinc-950/10 dark:divide-white/10">
      <ScheduleSection />
      <ReadinessSection />
      <ChannelSettings />
      {inlinePreview && (
        <section className="py-4">
          <h3 className="px-4 font-medium text-sm">Preview</h3>
          <PreviewPanel compact />
        </section>
      )}
      {(actions.isAtPostLimit ||
        hasTikTok ||
        (showPreviewAction && onOpenPreview)) && (
        <section className="space-y-3 p-4">
          {actions.isAtPostLimit && (
            <Alert variant="destructive">
              <Icon icon={AlertCircleIcon} size={16} />
              <AlertDescription>
                Monthly post quota reached.{" "}
                <InlineUpgradePrompt feature="monthlyPosts" />
              </AlertDescription>
            </Alert>
          )}
          {showPreviewAction && onOpenPreview && (
            <Button
              className="h-11 w-full"
              onClick={onOpenPreview}
              variant="outline"
            >
              <Icon icon={EyeIcon} size={17} />
              Preview post
            </Button>
          )}
          {hasTikTok && <TikTokConsentBanner promotionContent="NONE" />}
        </section>
      )}
    </div>
  );
}

function ScheduleSection() {
  const { date } = useDateTime();
  const setDate = useStore((state) => state.setDateAlongWithTime);

  return (
    <section className="space-y-3 p-4">
      <h3 className="font-medium text-sm" id="publish-timing">
        When to publish
      </h3>
      <RadioGroup
        aria-labelledby="publish-timing"
        className="gap-1"
        onValueChange={(value) => {
          if (value === "now") {
            setDate(undefined);
          } else if (!date) {
            setDate(addHours(startOfHour(new Date()), 1));
          }
        }}
        value={date ? "schedule" : "now"}
      >
        <ChoiceRadio
          description="As soon as you hit Publish"
          id="publish-timing-now"
          label="Post now"
          value="now"
        />
        <ChoiceRadio
          description={
            date
              ? `Goes out ${format(date, "EEEE, MMM d 'at' h:mm a")}`
              : "Pick a date and time"
          }
          id="publish-timing-schedule"
          label="Schedule"
          value="schedule"
        />
      </RadioGroup>
      {date && <NaturalDatePicker onChange={setDate} value={date} />}
    </section>
  );
}

function ReadinessSection() {
  const selected = useSelectedSocialProviders();
  const post = usePost();
  const issues = useMemo(
    () => getPublishIssues(selected, post),
    [selected, post]
  );

  if (issues.length === 0) {
    return (
      <section className="flex items-center gap-2 p-4 text-sm">
        <Icon
          className="text-emerald-600 dark:text-emerald-400"
          icon={CheckmarkCircle02Icon}
          size={18}
        />
        <span className="font-medium">Ready to publish</span>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="space-y-2 p-4">
      <h3 className="font-medium text-sm">Before you publish</h3>
      <ul className="space-y-1.5">
        {issues.map((issue) => (
          <li
            className="flex items-start gap-2 text-muted-foreground text-xs leading-5"
            key={issue.id}
          >
            {issue.socialType ? (
              <SocialIcon
                className="mt-0.5 size-4 shrink-0"
                type={issue.socialType}
              />
            ) : (
              <Icon
                className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                icon={Alert02Icon}
                size={16}
              />
            )}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
