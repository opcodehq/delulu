import type { SocialType } from "@delulu/core/publishing/post";
import { SocialIcon as BaseSocialIcon } from "@delulu/design-system/components/ui/social-icon";
import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";

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
