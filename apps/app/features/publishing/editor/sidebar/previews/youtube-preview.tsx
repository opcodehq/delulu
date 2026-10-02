"use client";

import { ComposerSocialPreview } from "@/features/publishing/editor/sidebar/previews/composer-social-preview";
import type { usePreviewData } from "@/features/publishing/editor/sidebar/previews/preview-utils";

export function YouTubePreview({
  postData,
}: {
  postData?: Parameters<typeof usePreviewData>[1];
} = {}) {
  return <ComposerSocialPreview platform="YOUTUBE" postData={postData} />;
}
