"use client";

import { ComposerSocialPreview } from "./composer-social-preview";
import type { usePreviewData } from "./preview-utils";

export function YouTubePreview({
  postData,
}: {
  postData?: Parameters<typeof usePreviewData>[1];
} = {}) {
  return <ComposerSocialPreview platform="YOUTUBE" postData={postData} />;
}
