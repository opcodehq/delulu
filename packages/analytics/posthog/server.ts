import "server-only";
import { PostHog } from "posthog-node";
import { keys } from "../keys";

export const analytics = new PostHog(keys().NEXT_PUBLIC_POSTHOG_KEY, {
  disabled: keys().NEXT_PUBLIC_ANALYTICS_DISABLED === "true",
  host: keys().NEXT_PUBLIC_POSTHOG_HOST,

  // Don't batch events and flush immediately - we're running in a serverless environment
  flushAt: 1,
  flushInterval: 0,
});
