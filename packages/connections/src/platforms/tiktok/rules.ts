import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CAPTION_LIMIT, MAX_PHOTOS } from "./constants";

/**
 * TikTok rules — the TIKTOK slice of the old `platform-rules.ts` plus the
 * publish-time validation the provider used to do inline. TikTok accepts
 * either one video or a photo carousel, but never a mixture of the two.
 */
export const tiktokRules: PlatformRules = {
  maxLength: CAPTION_LIMIT,
  media: {
    requiresVideo: false,
    requiresImage: false,
    requiresEither: true,
    allowsMultipleImages: true,
    allowsMultipleVideos: false,
    maxImages: MAX_PHOTOS,
  },
  validate(input: ValidateInput): ValidationResult {
    const errors: string[] = [];

    if (input.text.length > CAPTION_LIMIT) {
      errors.push(`Caption exceeds TikTok's ${CAPTION_LIMIT} character limit`);
    }

    const valid = getValidMediaUrls(input.media);
    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (videos.length === 0 && images.length === 0) {
      errors.push("TikTok requires a video or at least one photo");
    }
    if (videos.length > 1) {
      errors.push("TikTok supports only one video per post");
    }
    if (images.length > MAX_PHOTOS) {
      errors.push(`TikTok supports at most ${MAX_PHOTOS} photos per post`);
    }
    if (videos.length > 0 && images.length > 0) {
      errors.push("TikTok does not support mixing photos and video");
    }

    return { valid: errors.length === 0, errors };
  },
};
