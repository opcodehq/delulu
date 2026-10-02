import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CHARACTER_LIMIT, MAX_IMAGES } from "./constants";

/**
 * Bluesky rules — the BLUESKY slice of the old `platform-rules.ts`. Text-first
 * network: media is optional (no requires*), up to 4 images per post, no
 * multiple videos.
 */
export const blueskyRules: PlatformRules = {
  maxLength: CHARACTER_LIMIT,
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

    if (input.text.length > CHARACTER_LIMIT) {
      errors.push(`Text exceeds Bluesky's ${CHARACTER_LIMIT} character limit`);
    }

    const valid = getValidMediaUrls(input.media);
    const images = valid.filter((m) => m.mediaType === "IMAGE");
    const videos = valid.filter((m) => m.mediaType === "VIDEO");

    if (images.length > MAX_IMAGES) {
      errors.push(`Bluesky supports at most ${MAX_IMAGES} images`);
    }
    if (videos.length > 1) {
      errors.push("Bluesky supports only one video per post");
    }

    return { valid: errors.length === 0, errors };
  },
};
