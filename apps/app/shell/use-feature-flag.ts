"use client";

import { useUser } from "@delulu/auth";

// Comma-separated admin allowlist, configured via env (keep in sync with the
// server-side ADMIN_EMAILS configuration).
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

type FeatureFlag = "affiliates" | "twitter" | "analytics";

const FLAG_CONFIG: Record<FeatureFlag, { adminOnly: boolean }> = {
  affiliates: { adminOnly: true },
  twitter: { adminOnly: false },
  analytics: { adminOnly: true },
};

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { user } = useUser();
  const config = FLAG_CONFIG[flag];

  if (!config) {
    return false;
  }

  if (config.adminOnly) {
    const email = user?.primaryEmailAddress?.emailAddress;
    return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
  }

  return true;
}

export function useIsAdmin(): boolean {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
