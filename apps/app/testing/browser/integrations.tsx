import type { ReactNode } from "react";
export const AnalyticsProvider = ({ children }: { children: ReactNode }) =>
  children;
const analytics = {
  capture() {
    /* Telemetry is intentionally disabled in fixtures. */
  },
  identify() {
    /* Fixture user only. */
  },
  reset() {
    /* No tracking state. */
  },
  register() {
    /* No tracking state. */
  },
};
export const useAnalytics = () => analytics;
export const captureException = console.error;
export const FeatureTour = () => null;
export const PostHogIdentifier = () => null;
export const UserJotIdentifier = () => null;
export const dismissReferralPrompt = async () => ({});
export const saveSurveyAnswer = async () => ({});

export const log = console;
