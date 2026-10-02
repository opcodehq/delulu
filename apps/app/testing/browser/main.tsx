import { lazy, Suspense } from "react";
import "../../app/styles.css";
import { DesignSystemProvider } from "@delulu/design-system";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { createRoot } from "react-dom/client";
import { AnalyticsClient } from "@/features/analytics/analytics-client";
import { DashboardClient } from "@/features/dashboard/dashboard-client";
import { CalendarClient } from "@/features/publishing/calendar/calendar-client";
import PostsClient from "@/features/publishing/posts/posts-client";
import { AppShell } from "@/shell/app-shell";
import { PageLoading } from "@/shell/loading";
import { installFixtures, pending, requests } from "./fixtures";
import { navigate, usePathname } from "./navigation";

installFixtures();
document.body.dataset.density = "compact";
document.body.dataset.texture = "dither";
Object.assign(window, { fixtureRequests: requests });
const EngagementChart = lazy(() =>
  import("@/features/analytics/engagement-chart").then((module) => ({
    default: module.EngagementChart,
  }))
);
const chartPoints = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, i + 1)).toISOString(),
  impressions: 80 + i * 12 + (i % 3) * 40,
  reach: 40 + i * 8,
  profileViews: 10 + i * 2,
  engagements: 12 + i,
  followersGained: i % 5,
}));
function ChartPreview() {
  return (
    <main className="space-y-4 p-4">
      <h1 className="font-semibold text-base">Chart fixtures</h1>
      <Suspense fallback={<p>Loading chart</p>}>
        <EngagementChart insights={chartPoints} isLoading={false} />
      </Suspense>
    </main>
  );
}
function App() {
  const route = usePathname();
  return (
    <DesignSystemProvider>
      <NuqsTestingAdapter>
        <AppShell>
          {route === "/__loader" ? (
            <PageLoading label="Loading Delulu" />
          ) : route === "/__charts" ? (
            <ChartPreview />
          ) : route === "/posts" ? (
            <PostsClient />
          ) : route === "/calendar" ? (
            <CalendarClient />
          ) : route === "/analytics" ? (
            <AnalyticsClient />
          ) : (
            <DashboardClient />
          )}
        </AppShell>
      </NuqsTestingAdapter>
    </DesignSystemProvider>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function settled(title: string) {
  const start = performance.now();
  let stable = 0;
  while (performance.now() - start < 15_000) {
    await frame();
    const ready =
      document.querySelector("h1")?.textContent === title &&
      pending === 0 &&
      !document.querySelector('[role="alert"]');
    stable = ready ? stable + 1 : 0;
    if (stable >= 4) {
      return;
    }
  }
  throw new Error(
    `Timed out waiting for ${title}: ${document.body.innerText.slice(-800)}`
  );
}
Object.assign(window, {
  runNavigationBenchmark: async (runs = 10) => {
    const results = [];
    for (let run = 0; run < runs; run++) {
      for (const [route, title, name] of [
        ["/", "Overview", "startup"],
        ["/posts", "Posts", "posts"],
        ["/calendar", "Calendar", "calendar"],
        ["/analytics", "Analytics", "analytics"],
        ["/", "Overview", "return"],
      ]) {
        const before = requests.length;
        const start = performance.now();
        navigate(route);
        if (name === "startup") {
          root.render(<App key={run + Date.now()} />);
        }
        await settled(title);
        results.push({
          run,
          name,
          ms: Math.round(performance.now() - start),
          requests: requests.length - before,
        });
      }
    }
    return results;
  },
});
