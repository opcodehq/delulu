import { expect, type Page, test } from "@playwright/test";

interface RequestRecord {
  url: string;
  start: number;
  end?: number;
}
export const records = (page: Page) =>
  page.evaluate(
    () => Reflect.get(window, "fixtureRequests") as RequestRecord[]
  );

/**
 * Applies the theme per project, blocks every non-fixture request and fails
 * the test on unhandled fixture endpoints or overlapping identical reads.
 */
export function guardFixtureRequests() {
  test.beforeEach(async ({ page }, info) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("theme", theme),
      info.project.name === "mobile-dark" ? "dark" : "light"
    );
    // No real provider or API requests, even if a fixture alias accidentally regresses.
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === "http://127.0.0.1:4180"
        ? route.continue()
        : route.abort();
    });
  });
  test.afterEach(async ({ page }, info) => {
    if (info.status === "skipped") {
      return;
    }
    expect(
      await page.evaluate(() => Reflect.get(window, "fixtureUnhandled") ?? [])
    ).toEqual([]);
    const reads = await records(page);
    await info.attach("fixture-requests", {
      body: JSON.stringify(reads, null, 2),
      contentType: "application/json",
    });
    for (let i = 0; i < reads.length; i++) {
      const current = reads[i];
      expect(
        reads
          .slice(i + 1)
          .filter(
            (other) =>
              other.url === current.url &&
              other.start < (current.end ?? Number.POSITIVE_INFINITY)
          ),
        `Overlapping reads: ${current.url}`
      ).toEqual([]);
    }
  });
}
