import { getValidMediaUrls } from "@delulu/core/publishing/post";
import type {
  PlatformRules,
  ValidateInput,
  ValidationResult,
} from "../../types";
import { MAX_LENGTH } from "./constants";

/**
 * YouTube (Shorts) rules — the YOUTUBE slice of the old `platform-rules.ts` plus
 * `PLATFORM_VIDEO_RULES.YOUTUBE`. Requires exactly one video; an optional custom
 * thumbnail may accompany it. Images-only / carousels are not supported.
 *
 * NOTE: duration / format / file-size limits (`PLATFORM_VIDEO_RULES.YOUTUBE`)
 * are enforced at the client upload layer where the raw `File` (with `.type`,
 * `.size`, and probed duration) is available — see `validateVideo`. `MediaType`
 * carries none of those fields, so `validate()` here checks only what a resolved
 * media list can express: text length and the single-video shape.
 */
export const youtubeRules: PlatformRules = {
  maxLength: MAX_LENGTH,
  media: {
    requiresVideo: true,
    requiresImage: false,
    requiresEither: false,
    allowsMultipleImages: false,
    allowsMultipleVideos: false,
  },
  validate(input: ValidateInput): ValidationResult {
    const errors: string[] = [];

    if (input.text.length > MAX_LENGTH) {
      errors.push(
        `Description exceeds YouTube's ${MAX_LENGTH} character limit`
      );
    }

    const valid = getValidMediaUrls(input.media);
    const videos = valid.filter((m) => m.mediaType === "VIDEO");
    const images = valid.filter((m) => m.mediaType === "IMAGE");

    if (videos.length === 0) {
      errors.push("YouTube requires a video file");
    }
    if (videos.length > 1) {
      errors.push("YouTube supports only one video per post");
    }
    if (images.length > 0) {
      errors.push("YouTube does not support image posts");
    }

    return { valid: errors.length === 0, errors };
  },
};
