import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CHAR_LIMIT, MAX_IMAGES } from "./constants";

/**
 * Twitter/X rules — the TWITTER slice of the old `platform-rules.ts` (280-char
 * limit, up to 4 images, single video, no mixing) plus the light publish-time
 * validation the provider did inline. Media is optional (text-only tweets ok).
 */
export const twitterRules: PlatformRules = {
  maxLength: CHAR_LIMIT,
  media: {
    requiresVideo: false,
    requiresImage: false,
    requiresEither: false,
    allowsMultipleImages: true,
    allowsMultipleVideos: false,
    maxImages: MAX_IMAGES,
  },
  validate(input: ValidateInput): ValidationResult {
    const errors: string[] = [];

    if (input.text.length > CHAR_LIMIT) {
      errors.push(`Tweet exceeds X's ${CHAR_LIMIT} character limit`);
    }

    const valid = getValidMediaUrls(input.media);
    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (videos.length > 1) {
      errors.push("X supports only one video per tweet");
    }
    if (videos.length > 0 && images.length > 0) {
      errors.push("X does not support mixing videos and images");
    }
    if (images.length > MAX_IMAGES) {
      errors.push(`X supports at most ${MAX_IMAGES} images per tweet`);
    }

    return { valid: errors.length === 0, errors };
  },
};
