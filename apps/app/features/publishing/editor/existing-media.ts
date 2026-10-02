export interface ExistingMediaSelection {
  readonly id: string;
  readonly url: string;
  readonly bucketKey: string;
  readonly mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
  readonly originalFilename?: string | null;
  readonly size?: number | null;
  readonly extension?: string | null;
  readonly altText?: string | null;
  readonly createdAt: string | Date;
}

/** Preserve the authoritative database ID when adding library media to a post. */
export const existingMediaFiles = (
  selectedMedia: readonly ExistingMediaSelection[]
) =>
  selectedMedia.map((media) => ({
    id: media.id,
    mediaType: media.mediaType,
    previewUrl: media.url,
    url: media.url,
    bucketKey: media.bucketKey,
    altText: media.altText || undefined,
    size: media.size || undefined,
    extension: media.extension || undefined,
    originalFilename: media.originalFilename || undefined,
    isUploading: false,
  }));
