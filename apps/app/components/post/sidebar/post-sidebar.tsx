"use client";

import { CardContent } from "@delulu/design-system/components/ui/card";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import {
  type SupportedSocialPlatform,
  socialDisplayNames,
  socialIcons,
} from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { useState } from "react";
import { ReviewActivity } from "@/components/posts/review-activity";
import { useSelectedSocialProviders } from "@/store/post";
import { BasicSettings } from "./basic-settings";
import { PlatformPreview } from "./previews";

interface PostSidebarProps {
  postId?: string;
  organizationId?: string;
  view?: "controls" | "preview";
  onOpenPreview?: () => void;
  showPreviewAction?: boolean;
}

export function PostSidebar({
  postId,
  organizationId,
  view = "controls",
  onOpenPreview,
  showPreviewAction = false,
}: PostSidebarProps) {
  const socialProviders = useSelectedSocialProviders();
  const [activePreviewPlatform, setActivePreviewPlatform] =
    useState<SupportedSocialPlatform | null>(null);

  if (view === "controls") {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <BasicSettings
          onOpenPreview={onOpenPreview}
          showPreviewAction={showPreviewAction}
        />
      </div>
    );
  }

  const hasProviders = socialProviders.length > 0;
  const currentPlatform =
    activePreviewPlatform &&
    socialProviders.some(
      (provider) => provider.socialType === activePreviewPlatform
    )
      ? activePreviewPlatform
      : ((socialProviders[0]?.socialType as
          | SupportedSocialPlatform
          | undefined) ?? null);

  if (!(hasProviders && currentPlatform)) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className="font-medium text-sm">No preview yet</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Choose an account above the editor to preview this post.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {socialProviders.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-border/80 border-b px-4 py-3">
          {socialProviders.map((provider) => {
            const platform = provider.socialType as SupportedSocialPlatform;
            const IconComponent = socialIcons[platform];
            const isActive = platform === currentPlatform;

            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-medium text-xs transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
                key={provider.socialId}
                onClick={() => setActivePreviewPlatform(platform)}
                type="button"
              >
                {IconComponent && <IconComponent className="size-4" />}
                {socialDisplayNames[platform] || platform}
              </button>
            );
          })}
        </div>
      )}

      <PlatformPreview socialType={currentPlatform} />

      {postId && organizationId && (
        <>
          <DottedSeparator />
          <div className="px-4 pt-4">
            <h3 className="font-medium text-sm">Activity</h3>
          </div>
          <CardContent className="px-1 pt-2">
            <ReviewActivity postId={postId} />
          </CardContent>
        </>
      )}
    </div>
  );
}
