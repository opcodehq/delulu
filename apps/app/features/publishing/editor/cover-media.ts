/**
 * An Article cover is one image. Keeps the first image from a pick or drop and
 * reports whether anything was left out, so the caller can tell the user.
 */
export function pickCoverImage<T>(
  items: readonly T[],
  mediaType: (item: T) => string
): { readonly cover: T[]; readonly dropped: boolean } {
  const image = items.find((item) => mediaType(item) === "IMAGE");
  return {
    cover: image === undefined ? [] : [image],
    dropped: items.length > (image === undefined ? 0 : 1),
  };
}
