"use client";

import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { useState } from "react";
import { PlatformPreview } from "@/features/publishing/editor/sidebar/previews/platform-preview";
import { SocialIcon } from "@/features/publishing/editor/sidebar/social-icon";
import { useSelectedSocialProviders } from "@/features/publishing/store";

/**
 * Live preview of the post for one selected account at a time. `compact`
 * scales the phone down to fit the composer's settings column.
 */
export function PreviewPanel({ compact = false }: { compact?: boolean }) {
  const providers = useSelectedSocialProviders();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active =
    providers.find((provider) => provider.socialId === activeId) ??
    providers[0];

  if (!active) {
    return (
      <p className="px-4 py-6 text-center text-muted-foreground text-sm">
        Choose a channel to see a preview.
      </p>
    );
  }

  return (
    <div>
      {providers.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-3 pt-2">
          {providers.map((provider) => {
            const isActive = provider.socialId === active.socialId;
            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors [@media(pointer:coarse)]:min-h-11",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={provider.socialId}
                onClick={() => setActiveId(provider.socialId)}
                type="button"
              >
                <SocialIcon className="size-3.5" type={provider.socialType} />
                <span className="max-w-[8rem] truncate">{provider.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className={cn(compact && "[zoom:0.78]")}>
        <PlatformPreview
          socialType={active.socialType as SupportedSocialPlatform}
        />
      </div>
    </div>
  );
}
