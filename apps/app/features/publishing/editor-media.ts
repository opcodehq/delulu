import type { MediaType } from "@delulu/core/publishing/post";

export interface EditorMediaReference {
  readonly id: string;
  readonly altText?: string;
  readonly thumbnailMediaId?: string;
  readonly thumbnailTimestamp?: number;
}

export interface EditorMediaDetail {
  readonly id: string;
  readonly url: string;
  readonly bucketKey: string;
  readonly mediaType: "image" | "video" | "document";
  readonly thumbnails: readonly string[];
  readonly altText: string | null;
}

/** Hydrate saved references with authoritative media metadata from the API. */
export const hydrateEditorMedia = (
  references: readonly EditorMediaReference[],
  details: ReadonlyMap<string, EditorMediaDetail>
): MediaType[] =>
  references.map((reference) => {
    const media = details.get(reference.id);
    if (!media) {
      throw new Error(`Media ${reference.id} could not be loaded`);
    }
    const thumbnail = reference.thumbnailMediaId
      ? details.get(reference.thumbnailMediaId)
      : undefined;
    if (reference.thumbnailMediaId && !thumbnail) {
      throw new Error(
        `Thumbnail ${reference.thumbnailMediaId} could not be loaded`
      );
    }
    return {
      id: media.id,
      url: media.url,
      bucketKey: media.bucketKey,
      mediaType: media.mediaType.toUpperCase() as MediaType["mediaType"],
      altText: reference.altText ?? media.altText ?? undefined,
      thumbnailMediaId: reference.thumbnailMediaId,
      thumbnailBucketUrl: thumbnail?.url ?? media.thumbnails[0],
      thumbnailBucketKey: thumbnail?.bucketKey,
      thumbnailTimestamp: reference.thumbnailTimestamp,
    };
  });
