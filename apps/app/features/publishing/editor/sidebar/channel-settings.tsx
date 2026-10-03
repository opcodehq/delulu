"use client";

import type { SocialProviderType } from "@delulu/core/publishing/post";
import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { Settings01Icon } from "@delulu/icons";
import { useState } from "react";
import { PlatformSettingsDialog } from "@/features/publishing/editor/sidebar/platform-settings-dialog";
import { ChannelMark } from "@/features/publishing/editor/sidebar/social-icon";
import {
  useAutomationConfig,
  useSelectedSocialProviders,
} from "@/features/publishing/store";

const SETTINGS_SUMMARY: Partial<Record<string, string>> = {
  INSTAGRAM: "Trial Reel, comment automation",
  TIKTOK: "Privacy, interactions, content disclosure",
  YOUTUBE: "Visibility, made for kids",
};

/** Selected accounts that expose platform-specific publish options. */
export function ChannelSettings() {
  const selected = useSelectedSocialProviders().filter(
    (provider) => SETTINGS_SUMMARY[provider.socialType]
  );

  if (selected.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 p-4">
      <h3 className="font-medium text-sm">Channel options</h3>
      <ul className="space-y-1">
        {selected.map((provider) => (
          <ChannelSettingsRow key={provider.socialId} provider={provider} />
        ))}
      </ul>
    </section>
  );
}

function ChannelSettingsRow({ provider }: { provider: SocialProviderType }) {
  const [isOpen, setIsOpen] = useState(false);
  const automationConfig = useAutomationConfig(provider.socialId);
  const hasAutomation =
    provider.socialType === "INSTAGRAM" && Boolean(automationConfig);

  return (
    <li>
      <Button
        aria-label={`${provider.name} options`}
        className="h-auto min-h-11 w-full justify-start gap-3 px-2 py-2 text-left"
        onClick={() => setIsOpen(true)}
        variant="ghost"
      >
        <ChannelMark platform={provider.socialType} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium text-sm">
            <span className="truncate">{provider.name}</span>
            {hasAutomation && (
              <span className="shrink-0 rounded bg-emerald-500/12 px-1.5 py-0.5 font-medium text-[11px] text-emerald-700 dark:text-emerald-400">
                Automation on
              </span>
            )}
          </span>
          <span className="block truncate font-normal text-muted-foreground text-xs">
            {SETTINGS_SUMMARY[provider.socialType]}
          </span>
        </span>
        <Icon
          className="shrink-0 text-muted-foreground"
          icon={Settings01Icon}
          size={16}
        />
      </Button>
      <PlatformSettingsDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        platform={provider.socialType}
        platformName={provider.name}
        socialId={provider.socialId}
      />
    </li>
  );
}
