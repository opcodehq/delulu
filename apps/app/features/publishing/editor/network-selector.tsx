"use client";

import type { SocialType } from "@delulu/core/publishing/post";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@delulu/design-system/components/ui/tooltip";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowDown01Icon, PencilEdit02Icon } from "@delulu/icons";
import { SocialIcon } from "@/features/publishing/editor/sidebar/social-icon";
import { getPlatformsInDefault } from "@/features/publishing/platform-rules";
import {
  useSelectedSocialProviders,
  useStore,
} from "@/features/publishing/store";

export function AlternativeContentSelector() {
  const { post, setPost } = useStore((state) => ({
    post: state.post,
    setPost: state.setPost,
  }));
  const socialProviders = useSelectedSocialProviders();

  // Get platforms currently in default
  const platformsInDefault = getPlatformsInDefault(
    socialProviders,
    post.alternativeContent
  );

  // Check if a provider is the last one in default
  const isLastInDefault = (providerId: string) => {
    return (
      platformsInDefault.length === 1 &&
      socialProviders.find((p) => p.socialId === providerId) !== undefined &&
      !post.alternativeContent.some(
        (content) => content.socialProvider.socialId === providerId
      )
    );
  };

  const handleProviderToggle = (provider: {
    socialId: string;
    name: string;
    socialType: SocialType;
  }) => {
    const isSelected = post.alternativeContent.some(
      (content) => content.socialProvider.socialId === provider.socialId
    );

    // Prevent toggling if this is the last platform in default
    if (isLastInDefault(provider.socialId)) {
      return;
    }

    if (isSelected) {
      // Remove provider
      setPost({
        ...post,
        alternativeContent: post.alternativeContent.filter(
          (content) => content.socialProvider.socialId !== provider.socialId
        ),
      });
    } else {
      // Add provider with default content - deep copy ALL content items (supports threads)
      setPost({
        ...post,
        alternativeContent: [
          ...post.alternativeContent,
          {
            socialProvider: provider,
            content: post.content.map((contentItem, index) => ({
              id: "",
              order: index,
              name: provider.name,
              // Deep copy media to prevent reference sharing
              media: contentItem.media.map((m) => ({
                mediaType: m.mediaType,
                url: m.url,
                bucketKey: m.bucketKey,
                bucketUrl: m.bucketUrl,
                altText: m.altText,
                thumbnailBucketUrl: m.thumbnailBucketUrl,
                thumbnailBucketKey: m.thumbnailBucketKey,
                thumbnailMediaId: m.thumbnailMediaId,
                thumbnailTimestamp: m.thumbnailTimestamp,
              })),
              text: contentItem.text,
              title: contentItem.title, // Copy YouTube title
              tags: [...(contentItem.tags || [])], // Deep copy tags
              socialId: provider.socialId,
            })),
          },
        ],
      });
    }
  };

  if (!socialProviders.length) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-11"
          variant="ghost"
        >
          <Icon icon={PencilEdit02Icon} size={15} />
          <span className="hidden sm:inline">Customize per channel</span>
          <span className="sm:hidden">Customize</span>
          <Icon icon={ArrowDown01Icon} size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
          Give a channel its own text and media
        </DropdownMenuLabel>
        {socialProviders.map((provider) => {
          const isSelected = post.alternativeContent.some(
            (content) => content.socialProvider.socialId === provider.socialId
          );
          const isDisabled = isLastInDefault(provider.socialId);

          const menuItem = (
            <DropdownMenuCheckboxItem
              checked={isSelected}
              className={isDisabled ? "cursor-not-allowed opacity-50" : ""}
              disabled={isDisabled}
              key={provider.socialId}
              onCheckedChange={() => handleProviderToggle(provider)}
            >
              <div className="flex items-center gap-2">
                <SocialIcon size="sm" type={provider.socialType} />
                <span>{provider.name}</span>
              </div>
            </DropdownMenuCheckboxItem>
          );

          if (isDisabled) {
            return (
              <TooltipProvider key={provider.socialId}>
                <Tooltip>
                  <TooltipTrigger asChild>{menuItem}</TooltipTrigger>
                  <TooltipContent>
                    At least one channel has to keep the shared content
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return menuItem;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
