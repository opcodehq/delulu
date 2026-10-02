import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { CHARACTER_LIMIT, MAX_IMAGES } from "./constants";

/**
 * LinkedIn rules — the LINKEDIN slice of the old `platform-rules.ts`, plus the
 * publish-time mutual-exclusion the provider enforced by branching on media
 * type. A post is one of: up to 4 images (multi-image), a single video, or a
 * single document — the three are mutually exclusive.
 */
export const linkedinRules: PlatformRules = {
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
      errors.push(`Post exceeds LinkedIn's ${CHARACTER_LIMIT} character limit`);
    }

    const valid = getValidMediaUrls(input.media);
    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");
    const documents = valid.filter((m) => m.mediaType === "DOCUMENT");

    if (videos.length > 1) {
      errors.push("LinkedIn supports only one video per post");
    }
    if (documents.length > 1) {
      errors.push("LinkedIn supports only one document per post");
    }
    if (images.length > MAX_IMAGES) {
      errors.push(`LinkedIn supports at most ${MAX_IMAGES} images`);
    }

    // Mutually exclusive media types.
    const kindsPresent = [
      images.length > 0,
      videos.length > 0,
      documents.length > 0,
    ].filter(Boolean).length;
    if (kindsPresent > 1) {
      errors.push(
        "LinkedIn does not support mixing images, videos, and documents"
      );
    }

    return { valid: errors.length === 0, errors };
  },
};
