import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CAST_LIMIT, MAX_IMAGES } from "./constants";

/**
 * Farcaster rules — the FARCASTER slice of the old `platform-rules.ts`. Casts are
 * capped at 320 chars. Farcaster does not upload media; images are attached as
 * embed URLs (up to 2). No video.
 */
export const farcasterRules: PlatformRules = {
  maxLength: CAST_LIMIT,
  media: {
    requiresVideo: false,
    requiresImage: false,
    requiresEither: false,
    allowsMultipleImages: false,
    allowsMultipleVideos: false,
    maxImages: MAX_IMAGES,
  },
  validate(input: ValidateInput): ValidationResult {
    const errors: string[] = [];

    if (input.text.length > CAST_LIMIT) {
      errors.push(`Cast exceeds Farcaster's ${CAST_LIMIT} character limit`);
    }

    const valid = getValidMediaUrls(input.media);
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (images.length > MAX_IMAGES) {
      errors.push(`Farcaster supports at most ${MAX_IMAGES} images`);
    }

    return { valid: errors.length === 0, errors };
  },
};
