"use client";

import type { SocialType } from "@delulu/core/publishing/post";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { InstagramSettingsDisplay } from "@/features/publishing/editor/sidebar/instagram-settings";
import { TikTokSettingsDisplay } from "@/features/publishing/editor/sidebar/tiktok-settings";
import { YouTubeSettingsDisplay } from "@/features/publishing/editor/sidebar/youtube-settings";
import { usePost } from "@/features/publishing/store";

interface PlatformSettingsDialogProps {
  platform: SocialType;
  socialId: string;
  platformName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PlatformSettingsDialog({
  platform,
  socialId,
  platformName,
  isOpen,
  onClose,
}: PlatformSettingsDialogProps) {
  const post = usePost();
  // Check if we have video content
  const hasVideo = post.content.some((content) =>
    content.media?.some((media) => media.mediaType === "VIDEO")
  );
  const renderSettings = () => {
    switch (platform) {
      case "TIKTOK":
        return (
          <TikTokSettingsDisplay hasVideo={hasVideo} providerId={socialId} />
        );
      case "INSTAGRAM":
        return (
          <InstagramSettingsDisplay hasVideo={hasVideo} providerId={socialId} />
        );
      case "YOUTUBE":
        return <YouTubeSettingsDisplay providerId={socialId} />;
      default:
        return (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No settings available for {platformName}
          </div>
        );
    }
  };

  return (
    <Dialog modal={false} onOpenChange={onClose} open={isOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{platformName} Settings</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          {renderSettings()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
