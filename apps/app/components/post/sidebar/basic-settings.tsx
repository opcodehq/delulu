"use client";

import {
  Alert,
  AlertDescription,
} from "@delulu/design-system/components/ui/alert";
import { Button } from "@delulu/design-system/components/ui/button";
import { CardContent } from "@delulu/design-system/components/ui/card";
import { NaturalDatePicker } from "@delulu/design-system/components/ui/natural-date-picker";
import { Icon } from "@delulu/design-system/providers/icon";
import { AlertCircleIcon, EyeIcon } from "@delulu/icons";
import { InlineUpgradePrompt } from "@/components/billing/upgrade-prompt";
import { usePostActions } from "@/hooks/use-post-actions";
import {
  useDateTime,
  useSelectedSocialProviders,
  useStore,
} from "@/store/post";
import { TikTokConsentBanner } from "./tiktok-consent-banner";

interface BasicSettingsProps {
  onOpenPreview?: () => void;
  showPreviewAction?: boolean;
}

export function BasicSettings({
  onOpenPreview,
  showPreviewAction = false,
}: BasicSettingsProps = {}) {
  const { date } = useDateTime();
  const setDate = useStore((state) => state.setDateAlongWithTime);
  const selected = useSelectedSocialProviders();
  const actions = usePostActions();

  return (
    <CardContent className="space-y-4 p-4">
      <NaturalDatePicker onChange={setDate} value={date} />
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
      {selected.length === 0 && (
        <p className="text-center text-muted-foreground text-xs">
          Choose at least one account above the editor before publishing.
        </p>
      )}
      <TikTokConsentBanner promotionContent="NONE" />
    </CardContent>
  );
}
