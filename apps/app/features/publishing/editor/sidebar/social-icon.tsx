import type { SocialType } from "@delulu/core/publishing/post";
import { SocialIcon as BaseSocialIcon } from "@delulu/design-system/components/ui/social-icon";
import {
  type SupportedSocialPlatform,
  socialBackgroundColors,
} from "@delulu/design-system/lib/social-config";
import { cn } from "@delulu/design-system/lib/utils";
import { normalizePlatform } from "@/features/publishing/social-platform";

interface SocialIconProps {
  type: SocialType;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function SocialIcon({ type, className, size = "xs" }: SocialIconProps) {
  // Skip unsupported platforms
  if (!type) {
    return null;
  }

  return (
    <BaseSocialIcon
      className={className}
      size={size}
      type={type as SupportedSocialPlatform}
    />
  );
}

/** Brand-colored square mark for a connected account's platform. */
export function ChannelMark({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const normalized = normalizePlatform(platform);
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md",
        normalized ? socialBackgroundColors[normalized] : "bg-muted",
        className
      )}
    >
      {normalized && (
        <BaseSocialIcon className="size-3.5 text-white" type={normalized} />
      )}
    </span>
  );
}
