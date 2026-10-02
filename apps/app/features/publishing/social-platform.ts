import {
  type SupportedSocialPlatform,
  socialDisplayNames,
} from "@delulu/design-system/lib/social-config";

/**
 * Connection platform values are stored lowercase (e.g. "instagram") while the
 * icon/config maps are keyed by uppercase `SupportedSocialPlatform`. Normalize
 * once here so every join site agrees.
 */
export function normalizePlatform(
  raw: string | null | undefined
): SupportedSocialPlatform | null {
  if (!raw) {
    return null;
  }
  const upper = raw.toUpperCase();
  const alias: Record<string, SupportedSocialPlatform> = { X: "TWITTER" };
  const candidate = alias[upper] ?? (upper as SupportedSocialPlatform);
  return candidate in socialDisplayNames ? candidate : null;
}

/** Tooltip / label copy for a connection, e.g. "Instagram · @handle". */
export function platformLabel(
  platform: SupportedSocialPlatform | null,
  handle?: string | null
): string {
  const name = platform ? socialDisplayNames[platform] : "Account";
  return handle ? `${name} · @${handle}` : name;
}
