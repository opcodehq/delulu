import { AnalyticsClient } from "@/features/analytics/analytics-client";

export const metadata = {
  title: "Analytics | Delulu Social",
  description: "Track your social media performance and engagement",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
