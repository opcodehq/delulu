import type {
  AlternativeContentType,
  ContentType,
  SocialProviderType,
} from "@delulu/core/publishing/post";

/**
 * A channel's own copy of the shared content. Copies every segment and its
 * media so later edits on either side never share references.
 */
export function customContentFor(
  provider: SocialProviderType,
  content: readonly ContentType[]
): AlternativeContentType[number] {
  return {
    socialProvider: provider,
    content: content.map((item, index) => ({
      id: "",
      order: index,
      name: provider.name,
      media: item.media.map((media) => ({
        mediaType: media.mediaType,
        url: media.url,
        bucketKey: media.bucketKey,
        bucketUrl: media.bucketUrl,
        altText: media.altText,
        thumbnailBucketUrl: media.thumbnailBucketUrl,
        thumbnailBucketKey: media.thumbnailBucketKey,
        thumbnailMediaId: media.thumbnailMediaId,
        thumbnailTimestamp: media.thumbnailTimestamp,
      })),
      text: item.text,
      title: item.title,
      tags: [...(item.tags ?? [])],
      socialId: provider.socialId,
    })),
  };
}

/** Folds a thread into one segment: paragraphs in order, media combined. */
export function foldThread<T extends { text: string; media: unknown[] }>(
  items: readonly T[]
): T[] {
  const [first] = items;
  if (first === undefined || items.length === 1) {
    return [...items];
  }
  return [
    {
      ...first,
      text: items
        .map((item) => item.text.trim())
        .filter(Boolean)
        .join("\n\n"),
      media: items.flatMap((item) => item.media),
    },
  ];
}
