import type { ReactNode } from "react";
import { GoogleAnalytics } from "./google";
import { keys } from "./keys";
import { PostHogProvider } from "./posthog/client";
import { VercelAnalytics } from "./vercel";

interface AnalyticsProviderProps {
  readonly children: ReactNode;
  /** Surface this app runs on (`"app" | "web"`); stamped on every event. */
  readonly platform?: string;
}

const { NEXT_PUBLIC_GA_MEASUREMENT_ID } = keys();

export const AnalyticsProvider = ({
  children,
  platform,
}: AnalyticsProviderProps) =>
  keys().NEXT_PUBLIC_ANALYTICS_DISABLED === "true" ? (
    children
  ) : (
    <PostHogProvider platform={platform}>
      {children}
      <VercelAnalytics />
      {NEXT_PUBLIC_GA_MEASUREMENT_ID && (
        <GoogleAnalytics gaId={NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      )}
    </PostHogProvider>
  );
