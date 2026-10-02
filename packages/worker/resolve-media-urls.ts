import type { SocialPublishInputType } from "@delulu/core/publishing/post";
import { keys } from "./key";
import { generatePresignedDownloadUrl } from "./r2-presign";

const PRIVATE_HOST = "media.delulu.social";

function isPrivateUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return new URL(url).host === PRIVATE_HOST;
  } catch {
    return false;
  }
}

/** Extract the object key from a media.delulu.social URL (strip leading slash). */
function keyFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/") ? pathname.slice(1) : pathname;
  } catch {
    return undefined;
  }
}

/**
 * Replace private media.delulu.social URLs with time-limited presigned R2 URLs.
 * Mutates `input.content[].media[]` in place so every provider transparently
 * receives publicly-fetchable URLs.
 */
export async function resolveMediaUrls(
  input: SocialPublishInputType
): Promise<void> {
  const env = keys();
  const {
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_ACCOUNT_ID,
  } = env;

  if (
    !(
      R2_ACCESS_KEY_ID &&
      R2_SECRET_ACCESS_KEY &&
      R2_BUCKET_NAME &&
      R2_ACCOUNT_ID
    )
  ) {
    console.log("[resolveMediaUrls] R2 credentials not configured, skipping");
    return;
  }

  const config = {
    accountId: R2_ACCOUNT_ID,
    bucketName: R2_BUCKET_NAME,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  };

  const tasks: Promise<void>[] = [];

  for (const content of input.content) {
    for (const media of content.media) {
      // Replace media.url if it points to the private host
      const urlKey =
        media.bucketKey ?? (media.url ? keyFromUrl(media.url) : undefined);
      if (isPrivateUrl(media.url) && urlKey) {
        tasks.push(
          generatePresignedDownloadUrl(config, urlKey).then((presigned) => {
            console.log(`[resolveMediaUrls] Presigned: ${urlKey}`);
            media.url = presigned;
          })
        );
      }

      // Replace media.bucketUrl if it points to the private host
      const bucketUrlKey =
        media.bucketKey ??
        (media.bucketUrl ? keyFromUrl(media.bucketUrl) : undefined);
      if (isPrivateUrl(media.bucketUrl) && bucketUrlKey) {
        tasks.push(
          generatePresignedDownloadUrl(config, bucketUrlKey).then(
            (presigned) => {
              media.bucketUrl = presigned;
            }
          )
        );
      }

      // Replace thumbnailBucketUrl if it points to the private host
      const thumbKey =
        media.thumbnailBucketKey ??
        (media.thumbnailBucketUrl
          ? keyFromUrl(media.thumbnailBucketUrl)
          : undefined);
      if (isPrivateUrl(media.thumbnailBucketUrl) && thumbKey) {
        tasks.push(
          generatePresignedDownloadUrl(config, thumbKey).then((presigned) => {
            console.log(`[resolveMediaUrls] Presigned thumbnail: ${thumbKey}`);
            media.thumbnailBucketUrl = presigned;
          })
        );
      }
    }
  }

  await Promise.all(tasks);
}
