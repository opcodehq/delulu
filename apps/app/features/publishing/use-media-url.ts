/** Media responses now carry their signed or public URL from the Worker. */
export function useMediaUrl(_bucketKey?: string, url?: string): string {
  return url ?? "";
}
