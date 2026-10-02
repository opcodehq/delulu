const MEDIA_BASE_URL = "https://media.delulu.social";

/**
 * Generates a direct media URL using the R2 custom domain.
 * Prefers bucketKey (constructs URL), falls back to the raw URL.
 */
export function getMediaUrl(
  bucketKey: string | undefined,
  fallbackUrl?: string
): string {
  if (bucketKey) {
    return `${MEDIA_BASE_URL}/${bucketKey}`;
  }
  if (fallbackUrl) {
    return fallbackUrl;
  }
  return "";
}

/**
 * Generates media URL from media object.
 * Prefers bucketKey over url for environment-aware serving.
 */
export function getMediaUrlFromObject(media: {
  bucketKey?: string;
  url?: string;
}): string {
  return getMediaUrl(media.bucketKey, media.url);
}
