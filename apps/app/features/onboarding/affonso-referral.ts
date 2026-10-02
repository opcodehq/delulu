/**
 * Read the Affonso affiliate referral ID.
 *
 * The `affonso_referral` cookie is set by the Affonso tracking pixel when a
 * visitor arrives via an affiliate link. Because the marketing site (delulu.social)
 * and the app (solulu.delulu.social) may live on different domains, we also check
 * the `aff` URL search parameter as a cross-domain hand-off mechanism. The
 * marketing site appends `?aff=<referral>` when linking to the app.
 *
 * Priority: cookie > URL parameter (cookie is the canonical source).
 */
export function getAffonsoReferral(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  // 1. Try the first-party cookie set by the Affonso pixel
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("affonso_referral="));
  if (match) {
    return match.slice(match.indexOf("=") + 1) || null;
  }

  // 2. Fall back to a URL parameter (cross-domain hand-off)
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("aff") || params.get("affonso_referral");
  } catch {
    return null;
  }
}
