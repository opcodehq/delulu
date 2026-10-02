import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { MAX_IMAGES, MESSAGE_LIMIT } from "./constants";

/**
 * Facebook rules — the FACEBOOK slice of the old `platform-rules.ts`, plus the
 * publish-time constraints the provider enforced. Single-video platform: one
 * video (Reel) OR up to 10 images (album/feed); no mixing.
 */
export const facebookRules: PlatformRules = {
  maxLength: MESSAGE_LIMIT,
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

    if (input.text.length > MESSAGE_LIMIT) {
      errors.push(
        `Message exceeds Facebook's ${MESSAGE_LIMIT} character limit`
      );
    }

    const valid = getValidMediaUrls(input.media);
    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (videos.length > 1) {
      errors.push("Facebook supports only one video per post");
    }
    if (videos.length > 0 && images.length > 0) {
      errors.push("Facebook does not support mixing videos and images");
    }
    if (images.length > MAX_IMAGES) {
      errors.push(`Facebook supports at most ${MAX_IMAGES} images`);
    }

    return { valid: errors.length === 0, errors };
  },
};
