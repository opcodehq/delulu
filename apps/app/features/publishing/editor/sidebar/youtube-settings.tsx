"use client";

import { DEFAULT_YOUTUBE_SETTINGS } from "@delulu/core/publishing/constants/settings";
import type { YouTubeSettings } from "@delulu/core/publishing/post";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { useStore } from "@/features/publishing/store";

const VISIBILITY: { value: YouTubeSettings["privacy"]; label: string }[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "UNLISTED", label: "Unlisted" },
  { value: "PRIVATE", label: "Private" },
];

export function YouTubeSettingsDisplay({ providerId }: { providerId: string }) {
  const setProviderSettings = useStore((state) => state.setProviderSettings);
  const stored = useStore((state) => state.providerSettings[providerId]);
  const settings =
    stored?.type === "YOUTUBE" ? stored.settings : DEFAULT_YOUTUBE_SETTINGS;

  const update = (changes: Partial<YouTubeSettings>) =>
    setProviderSettings(providerId, {
      socialProviderId: providerId,
      type: "YOUTUBE",
      settings: { ...settings, ...changes },
    });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`youtube-visibility-${providerId}`}>Visibility</Label>
        <Select
          onValueChange={(privacy) =>
            update({ privacy: privacy as YouTubeSettings["privacy"] })
          }
          value={settings.privacy}
        >
          <SelectTrigger
            className="w-full"
            id={`youtube-visibility-${providerId}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={`youtube-kids-${providerId}`}>Made for kids</Label>
          <p className="text-muted-foreground text-xs">
            Required by YouTube for content directed at children. Disables
            comments and personalized ads.
          </p>
        </div>
        <Switch
          checked={settings.madeForKids}
          id={`youtube-kids-${providerId}`}
          onCheckedChange={(madeForKids) => update({ madeForKids })}
        />
      </div>
    </div>
  );
}
