"use client";

import { useEffect } from "react";

/**
 * First-touch acquisition capture for the marketing site.
 *
 * Persists where a visitor came from (channel + UTM + ad click-ids + referrer)
 * into a first-party cookie on `.delulu.social` so it survives the cross-domain
 * hop to the app, where the user actually signs up. The app reads this cookie at
 * identify time and applies it as `$set_once` PostHog person properties (see
 * apps/app/shell/navigation/posthog-identifier.tsx). Because "became paid" is a
 * server event attached to the same person, this is what lets us answer "which
 * sources produce paying users" as a PostHog breakdown.
 *
 * First-touch semantics: the cookie is written only if not already present, so
 * the very first source that brought the visitor is preserved for 90 days.
 */

const COOKIE = "dl_attr";
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** Referrer host → channel. Ordered; first match wins. */
const CHANNEL_HOSTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "twitter"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(google\.|bing\.com|duckduckgo\.com)/, "search"],
];

/** Known `utm_source` values → channel. */
const CHANNEL_SOURCES: Record<string, string> = {
  ig: "instagram",
  instagram: "instagram",
  twitter: "twitter",
  x: "twitter",
  tiktok: "tiktok",
  tt: "tiktok",
  youtube: "youtube",
  yt: "youtube",
  facebook: "facebook",
  fb: "facebook",
  linkedin: "linkedin",
  reddit: "reddit",
  google: "search",
  bing: "search",
  newsletter: "email",
  email: "email",
};

function classifyChannel(
  utmSource: string | null,
  clickIds: Record<string, string>,
  referrer: string
): string {
  if (utmSource && CHANNEL_SOURCES[utmSource.toLowerCase()]) {
    return CHANNEL_SOURCES[utmSource.toLowerCase()];
  }
  if (clickIds.gclid) {
    return "google_ads";
  }
  if (clickIds.fbclid) {
    return "facebook";
  }
  if (clickIds.ttclid) {
    return "tiktok";
  }
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      for (const [pattern, channel] of CHANNEL_HOSTS) {
        if (pattern.test(host)) {
          return channel;
        }
      }
      return "referral";
    } catch {
      // Malformed referrer — fall through.
    }
  }
  if (utmSource) {
    return "other";
  }
  return "direct";
}

export const CaptureAttribution = () => {
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) {
      return; // First-touch already recorded.
    }

    const params = new URLSearchParams(window.location.search);
    const param = (key: string) => params.get(key)?.slice(0, 200) ?? null;

    const clickIds: Record<string, string> = {};
    for (const key of ["gclid", "fbclid", "ttclid", "gbraid", "wbraid"]) {
      const value = param(key);
      if (value) {
        clickIds[key] = value;
      }
    }

    const referrer = document.referrer;
    const utmSource = param("utm_source");
    const channel = classifyChannel(utmSource, clickIds, referrer);

    const attribution = {
      channel,
      utm_source: utmSource,
      utm_medium: param("utm_medium"),
      utm_campaign: param("utm_campaign"),
      utm_term: param("utm_term"),
      utm_content: param("utm_content"),
      referrer: referrer || null,
      landing_page: window.location.pathname,
      ...clickIds,
    };

    // Scope the cookie to the apex domain so app.delulu.social can read it. On
    // localhost/preview hosts we omit the domain (host-only cookie).
    const host = window.location.hostname;
    const domain = host.endsWith("delulu.social")
      ? "; domain=.delulu.social"
      : "";
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    const value = encodeURIComponent(JSON.stringify(attribution));
    // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is required for a domain-scoped (.delulu.social) first-party cookie; the Cookie Store API lacks Safari support.
    document.cookie = `${COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${domain}${secure}`;
  }, []);

  return null;
};
