"use client";

import { FEATURE_USED, SESSION_STARTED } from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import { useUser } from "@delulu/auth";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

/**
 * Read the first-touch acquisition cookie set on the marketing site
 * (apps/web/components/analytics/capture-attribution.tsx) and shape it into
 * `initial_*` PostHog person properties. Applied via `$set_once` at identify so
 * a person's acquisition source is recorded exactly once — the basis for
 * source→paid analysis.
 */
function readAttribution(): Record<string, unknown> | null {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("dl_attr="));
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      decodeURIComponent(match.slice("dl_attr=".length))
    );
    const initial: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && value !== undefined) {
        initial[`initial_${key}`] = value;
      }
    }
    return Object.keys(initial).length > 0 ? initial : null;
  } catch {
    return null;
  }
}

// Map pathname segments to human-readable feature names for tracking
function getFeatureFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const featureMap: Record<string, string> = {
    post: "post_creator",
    posts: "posts_list",
    socials: "connected_accounts",
    automations: "automations",
    calendar: "calendar",
    settings: "settings",
    affiliates: "affiliates",
    analytics: "analytics_dashboard",
  };
  for (const segment of segments) {
    if (featureMap[segment]) {
      return featureMap[segment];
    }
  }
  return null;
}

function PostHogIdentifierContent() {
  const { user } = useUser();
  const identified = useRef(false);
  const sessionTracked = useRef(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const analytics = useAnalytics();

  useEffect(() => {
    // Track pageviews
    if (pathname && analytics) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }
      analytics.capture("$pageview", {
        $current_url: url,
      });

      // Track feature usage based on navigation
      const feature = getFeatureFromPath(pathname);
      if (feature) {
        analytics.capture(FEATURE_USED, {
          feature,
          path: pathname,
        });
      }
    }
  }, [pathname, searchParams, analytics]);

  useEffect(() => {
    if (!user || identified.current) {
      return;
    }

    analytics.identify(
      user.id,
      {
        email: user.primaryEmailAddress?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        createdAt: user.createdAt,
        avatar: user.imageUrl,
      },
      // First-touch acquisition props ($set_once) carried over from the
      // marketing site via the `dl_attr` cookie.
      readAttribution() ?? undefined
    );

    // Note: `signup_completed` is captured authoritatively server-side from the
    // Clerk `user.created` webhook (see packages/services/src/clerk-sync.ts),
    // which is more reliable than the previous client-side `createdAt < 60s`
    // heuristic and fires exactly once per new user.

    identified.current = true;
  }, [user, analytics]);

  // Track session start (once per page load / app open)
  useEffect(() => {
    if (!(user && analytics) || sessionTracked.current) {
      return;
    }
    sessionTracked.current = true;

    analytics.capture(SESSION_STARTED, {
      returning_user: user.createdAt
        ? Date.now() - new Date(user.createdAt).getTime() > 24 * 60 * 60 * 1000
        : false,
      days_since_signup: user.createdAt
        ? Math.floor(
            (Date.now() - new Date(user.createdAt).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : null,
    });
  }, [user, analytics]);

  return null;
}

export const PostHogIdentifier = () => {
  return (
    <Suspense>
      <PostHogIdentifierContent />
    </Suspense>
  );
};
