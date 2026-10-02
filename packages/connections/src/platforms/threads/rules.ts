import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CAPTION_LIMIT, MAX_CAROUSEL_IMAGES } from "./constants";

/**
 * Threads rules — the THREADS slice of the old `platform-rules.ts` (media
 * optional, no video mixing, up to 10 carousel images), plus the caption limit
 * the provider enforced. Text-only posts are allowed; media is never required.
 */
export const threadsRules: PlatformRules = {
  maxLength: CAPTION_LIMIT,
  media: {
    requiresVideo: false,
    requiresImage: false,
    requiresEither: false,
    allowsMultipleImages: false,
    allowsMultipleVideos: false,
    maxImages: MAX_CAROUSEL_IMAGES,
  },
  validate(input: ValidateInput): ValidationResult {
    const errors: string[] = [];

    if (input.text.length > CAPTION_LIMIT) {
      errors.push(`Text exceeds Threads' ${CAPTION_LIMIT} character limit`);
    }

    const valid = getValidMediaUrls(input.media);
    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (videos.length > 1) {
      errors.push("Threads supports only one video per post");
    }
    if (videos.length > 0 && images.length > 0) {
      errors.push("Threads does not support mixing videos and images");
    }
    if (images.length > MAX_CAROUSEL_IMAGES) {
      errors.push(`Threads supports at most ${MAX_CAROUSEL_IMAGES} images`);
    }

    return { valid: errors.length === 0, errors };
  },
};
