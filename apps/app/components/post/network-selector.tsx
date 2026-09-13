"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@delulu/design-system/components/ui/tooltip";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowDown01Icon } from "@delulu/icons";
import type { SocialType } from "@delulu/validators/post";
import { getPlatformsInDefault } from "@/lib/platform-rules";
import { useSelectedSocialProviders, useStore } from "@/store/post";
import { SocialIcon } from "./sidebar/social-icon";

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
          aria-label="Choose platform-specific content"
          className="size-11 rounded-md sm:size-8 [@media(pointer:coarse)]:size-11"
          size="icon"
          variant="ghost"
        >
          <Icon icon={ArrowDown01Icon} size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
                    Cannot create alternative content - this is the only
                    platform in default
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
