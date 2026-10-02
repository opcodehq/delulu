import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { DESCRIPTION_LIMIT, MAX_IMAGES } from "./constants";

/**
 * Pinterest rules — the PINTEREST slice of the old `platform-rules.ts`, plus the
 * publish-time validation the provider used to do inline. Pin-style: image-based
 * pins, no video. The provider publishes a single image pin from the first valid
 * image; multiple images map to separate pins conceptually (max 5).
 */
export const pinterestRules: PlatformRules = {
  maxLength: DESCRIPTION_LIMIT,
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

    if (input.text.length > DESCRIPTION_LIMIT) {
      errors.push(
        `Description exceeds Pinterest's ${DESCRIPTION_LIMIT} character limit`
      );
    }

    const valid = getValidMediaUrls(input.media);
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (images.length === 0) {
      errors.push("Pinterest requires an image");
    }
    if (images.length > MAX_IMAGES) {
      errors.push(`Pinterest supports at most ${MAX_IMAGES} images`);
    }

    return { valid: errors.length === 0, errors };
  },
};
