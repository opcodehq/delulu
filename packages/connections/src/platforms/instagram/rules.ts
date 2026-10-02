import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CAPTION_LIMIT, MAX_CAROUSEL_IMAGES } from "./constants";

/**
 * Instagram rules — the INSTAGRAM slice of the old `platform-rules.ts`, plus the
 * publish-time validation the provider used to do inline. Single video (Reels)
 * OR up to 10 images (carousel); no mixing.
 */
export const instagramRules: PlatformRules = {
  maxLength: CAPTION_LIMIT,
  media: {
    requiresVideo: false,
    requiresImage: false,
    requiresEither: true,
    allowsMultipleImages: true,
    allowsMultipleVideos: false,
    maxImages: MAX_CAROUSEL_IMAGES,
  },
  validate(input: ValidateInput): ValidationResult {
    const errors: string[] = [];

    if (input.text.length > CAPTION_LIMIT) {
      errors.push(
        `Caption exceeds Instagram's ${CAPTION_LIMIT} character limit`
      );
    }

    const valid = getValidMediaUrls(input.media);
    if (valid.length === 0) {
      errors.push("Instagram requires at least one image or video");
    }

    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (videos.length > 1) {
      errors.push("Instagram supports only one video per post");
    }
    if (videos.length > 0 && images.length > 0) {
      errors.push("Instagram does not support mixing videos and images");
    }
    if (images.length > MAX_CAROUSEL_IMAGES) {
      errors.push(`Instagram supports at most ${MAX_CAROUSEL_IMAGES} images`);
    }

    return { valid: errors.length === 0, errors };
  },
};
