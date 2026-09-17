"use client";

import type { PostHog } from "posthog-js";
import posthog from "posthog-js";
import { PostHogProvider as PostHogProviderRaw } from "posthog-js/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { keys } from "../keys";

interface PostHogProviderProps {
  readonly children: ReactNode;
  /**
   * Surface this provider runs on (`"app" | "web"`). Registered as a PostHog
   * super-property so every client event is attributable to its surface — the
   * client-side counterpart to `platform: "api" | "worker" | "cli"` set by the
   * server, worker, and CLI. This is what makes app-vs-web-vs-CLI comparisons
   * possible.
   */
  readonly platform?: string;
}

export const PostHogProvider = ({
  platform,
  ...properties
}: Omit<PostHogProviderProps, "client">) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (keys().NEXT_PUBLIC_ANALYTICS_DISABLED === "true") {
      return;
    }
    const initPostHog = async () => {
      const posthogKey = keys().NEXT_PUBLIC_POSTHOG_KEY;
      let apiHost = keys().NEXT_PUBLIC_POSTHOG_HOST;
      const proxyHost = keys().NEXT_PUBLIC_POSTHOG_PROXY_HOST;

      // Smart fallback: Try direct PostHog host first, fallback to proxy if blocked
      if (proxyHost) {
        try {
          await fetch(apiHost, { method: "HEAD", mode: "no-cors" });
        } catch (_error) {
          // Direct host blocked, use Cloudflare proxy
          apiHost = proxyHost;
        }
      }

      posthog.init(posthogKey, {
        api_host: apiHost,
        ui_host: keys().NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: "identified_only",
        capture_pageview: false, // Disable automatic pageview capture, as we capture manually
        capture_pageleave: true, // Overrides the `capture_pageview` setting
      }) as PostHog;

      setIsInitialized(true);
    };

    if (!isInitialized) {
      initPostHog();
    }
  }, [isInitialized]);

  // Stamp the surface on every subsequent event. `register` persists the
  // super-property, so it survives reloads and applies to the global singleton
  // regardless of how many providers mount.
  useEffect(() => {
    if (isInitialized && platform) {
      posthog.register({ platform });
    }
  }, [isInitialized, platform]);

  return <PostHogProviderRaw client={posthog} {...properties} />;
};

export { posthog } from "posthog-js";
export { usePostHog as useAnalytics } from "posthog-js/react";
