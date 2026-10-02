"use client";

import {
  type PromotionContentType,
  promotionContentTypes,
} from "@delulu/core/publishing/post";
import { cn } from "@delulu/design-system/lib/utils";

interface TikTokConsentBannerProps {
  promotionContent: PromotionContentType;
  className?: string;
  variant?: "inline" | "card";
}

export function TikTokConsentBanner({
  promotionContent,
  className,
  variant = "inline",
}: TikTokConsentBannerProps) {
  const hasBrandedContent =
    promotionContent === promotionContentTypes.PAID ||
    promotionContent === promotionContentTypes.BOTH;

  const content = (
    <p className="text-muted-foreground text-xs">
      By posting, you agree to TikTok's{" "}
      {hasBrandedContent && (
        <>
          <a
            className="underline hover:text-foreground"
            href="https://www.tiktok.com/legal/page/global/bc-policy/en"
            rel="noopener noreferrer"
            target="_blank"
          >
            Branded Content Policy
          </a>
          {" and "}
        </>
      )}
      <a
        className="underline hover:text-foreground"
        href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
        rel="noopener noreferrer"
        target="_blank"
      >
        Music Usage Confirmation
      </a>
      .
    </p>
  );

  if (variant === "card") {
    return (
      <div className={cn("rounded-md bg-muted/50 p-3", className)}>
        {content}
      </div>
    );
  }

  return <div className={className}>{content}</div>;
}
