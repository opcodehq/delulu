"use client";

/**
 * UserJot Analytics Component
 *
 * Loads UserJot SDK for user feedback and analytics.
 * Uses Next.js Script component with afterInteractive strategy
 * to avoid blocking page rendering.
 *
 * Consent Gating:
 * - Only loads if user has granted analytics consent
 * - Checks localStorage for 'analytics-consent' flag
 * - TODO: Integrate with full consent management system when implemented
 */

import Script from "next/script";
import { useEffect, useState } from "react";

export function UserJot() {
  const [hasConsent, setHasConsent] = useState(true);

  useEffect(() => {
    // Check if user has granted analytics consent
    // Default to true for now (opt-out model)
    // TODO: Change to opt-in model when consent banner is implemented
    const consent = localStorage.getItem("analytics-consent");
    setHasConsent(consent !== "false");
  }, []);

  // Don't load UserJot if consent not granted
  if (!hasConsent) {
    return null;
  }

  return (
    <>
      {/* UserJot SDK - Initialize global proxy */}
      <Script
        dangerouslySetInnerHTML={{
          __html:
            "window.$ujq=window.$ujq||[];window.uj=window.uj||new Proxy({},{get:(_,p)=>(...a)=>window.$ujq.push([p,...a])});",
        }}
        id="userjot-init"
        strategy="lazyOnload"
      />
      {/* UserJot SDK - Load main module */}
      <Script
        src="https://cdn.userjot.com/sdk/v2/uj.js"
        strategy="lazyOnload"
        type="module"
      />
    </>
  );
}
