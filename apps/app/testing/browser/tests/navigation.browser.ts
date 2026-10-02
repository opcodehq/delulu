import { expect, type Page, test } from "@playwright/test";

interface RequestRecord {
  url: string;
  start: number;
  end?: number;
}
const records = (page: Page) =>
  page.evaluate(
    () => Reflect.get(window, "fixtureRequests") as RequestRecord[]
  );
async function ready(page: Page, title: string) {
  await expect(
    page.getByRole("heading", { name: title, exact: true })
  ).toBeVisible();
  await expect
    .poll(async () => (await records(page)).every((r) => r.end !== undefined))
    .toBe(true);
}
async function go(page: Page, path: string) {
  await page.locator(`a[href="${path}"]:visible`).first().click();
}

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

test("navigation retains fresh cached data on return", async ({ page }) => {
  await page.goto("/");
  await ready(page, "Overview");
  await expect(page.locator('a[href="/agent"]')).toHaveCount(0);
  await expect(
    page.locator('[data-slot="button"][data-variant="default"]').first()
  ).toHaveCSS("background-image", "none");
  await go(page, "/posts");
  await ready(page, "Posts");
  const before = (await records(page)).length;
  await go(page, "/");
  await ready(page, "Overview");
  expect((await records(page)).length).toBe(before);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("failed page recovers through Retry without losing navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.fixtureConfig = { failures: { "/posts": 100 }, latency: 30 };
  });
  await page.goto("/posts");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator('a[href="/"]:visible').first()).toBeVisible();
  await page.evaluate(() => {
    window.fixtureConfig!.failures = {};
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready(page, "Posts");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("delayed data keeps shell available", async ({ page }) => {
  await page.goto("/");
  await ready(page, "Overview");
  await page.evaluate(() => {
    window.fixtureConfig!.latency = 1500;
  });
  await go(page, "/posts");
  await expect(
    page.getByRole("heading", { name: "Posts", exact: true })
  ).toBeVisible();
  expect(
    (await records(page)).some(
      (r) => r.url.includes("/posts?") && r.end === undefined
    )
  ).toBe(true);
  await expect(page.getByText("No posts found.", { exact: true })).toHaveCount(
    0
  );
  await expect(page.locator('a[href="/"]:visible').first()).toBeVisible();
  await ready(page, "Posts");
});

test("loader respects reduced motion and viewport width", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/__loader");
  await expect(page.locator("html")).toHaveClass(
    info.project.name === "mobile-dark" ? "dark" : "light"
  );
  if (info.project.name === "mobile-dark") {
    for (const name of ["Home", "Posts", "Create", "Accounts"]) {
      const bounds = await page
        .getByRole("link", { name, exact: true })
        .boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(
    page.getByRole("status", { name: "Loading Delulu" })
  ).toBeVisible();
  await expect(page.locator(".logo-loader-trace")).toHaveCSS(
    "animation-name",
    "none"
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test("desktop route sequence and workspace selection", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Calendar and analytics use the desktop sidebar"
  );
  await page.goto("/");
  await ready(page, "Overview");
  for (const [path, title] of [
    ["/posts", "Posts"],
    ["/calendar", "Calendar"],
    ["/analytics", "Analytics"],
  ]) {
    await go(page, path);
    await ready(page, title);
  }
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("combobox").filter({ hasText: "Workspace A" }).click();
  await page
    .getByRole("option", { name: "Workspace B (Personal)", exact: true })
    .click();
  await ready(page, "Analytics");
  expect(
    await page.evaluate(() => localStorage.getItem("delulu.workspaceId"))
  ).toBe("workspace_b");
  expect((await records(page)).some((r) => r.url.includes("workspace_b"))).toBe(
    true
  );
});

test("late workspace response cannot replace the selected workspace", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Uses the desktop workspace switcher"
  );
  await page.addInitScript(() => {
    window.fixtureConfig = {
      totalPosts: { workspace_a: 111, workspace_b: 222 },
      workspaceLatency: { workspace_b: 1500 },
    };
  });
  await page.goto("/");
  await ready(page, "Overview");
  await expect(page.getByText("111", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const switcher = page.getByRole("combobox").filter({ hasText: "Workspace" });
  await switcher.click();
  await page
    .getByRole("option", { name: "Workspace B (Personal)", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await records(page)).some(
        (r) => r.url.includes("workspace_b") && r.end === undefined
      )
    )
    .toBe(true);
  await expect(page.getByText("111", { exact: true })).toHaveCount(0);
  await switcher.click();
  await page
    .getByRole("option", { name: "Workspace A (Personal)", exact: true })
    .click();
  await expect(page.getByText("111", { exact: true })).toBeVisible();
  // Observe every DOM update until B completes, not just the final screenshot.
  await page.evaluate(() => {
    const flashes: string[] = [];
    const observer = new MutationObserver(() => {
      if (document.body.innerText.includes("222")) {
        flashes.push("Workspace B flashed");
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    Object.assign(window, {
      fixtureFlashes: flashes,
      fixtureObserver: observer,
    });
  });
  await ready(page, "Overview");
  expect(
    await page.evaluate(() => {
      Reflect.get(window, "fixtureObserver").disconnect();
      return Reflect.get(window, "fixtureFlashes");
    })
  ).toEqual([]);
  await expect(page.getByText("111", { exact: true })).toBeVisible();
  await expect(page.getByText("222", { exact: true })).toHaveCount(0);
});

test("dashboard recovery is neutral with a ghost retry action", async ({
  page,
}) => {
  await page.goto("/?warnings");
  await ready(page, "Overview");
  await expect(
    page.getByText("1 post failed to publish", { exact: true })
  ).toBeVisible();
  const edit = page.getByRole("button", { name: "Edit post", exact: true });
  const hitArea = await edit.boundingBox();
  expect(hitArea?.width).toBeGreaterThanOrEqual(44);
  expect(hitArea?.height).toBeGreaterThanOrEqual(44);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toHaveAttribute("data-variant", "ghost");
  await expect(retry).toHaveCSS("background-image", "none");
  await expect(retry).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator('a[href="/agent"]')).toHaveCount(0);
});
