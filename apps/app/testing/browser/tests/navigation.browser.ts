import { expect, type Page, test } from "@playwright/test";

const LONG_CHOICE = /^A longer choice/;

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

test("connection choices contain their icons and descriptions", async ({
  page,
}, info) => {
  if (info.project.name === "mobile-dark") {
    await page.setViewportSize({ width: 320, height: 640 });
  }
  await page.goto("/socials");
  await ready(page, "Connected Accounts");
  await page
    .getByRole("button", { name: "Connect Account", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const choices = dialog
    .getByRole("button")
    .filter({ hasText: "Connect your" });
  await expect(choices).toHaveCount(7);
  for (const choice of await choices.all()) {
    await choice.scrollIntoViewIfNeeded();
    const overflow = await choice.evaluate((button) => {
      const outer = button.getBoundingClientRect();
      return [...button.querySelectorAll("div, span, svg")].some((child) => {
        const inner = child.getBoundingClientRect();
        return (
          inner.top < outer.top ||
          inner.bottom > outer.bottom ||
          inner.left < outer.left ||
          inner.right > outer.right
        );
      });
    });
    expect(overflow, await choice.innerText()).toBe(false);
    expect((await choice.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Account", exact: true }).first()
  ).toBeFocused();
});

test("button density preserves variants and content sizing", async ({
  page,
}, info) => {
  await page.goto("/__controls");
  const mobile = info.project.name === "mobile-dark";
  const sizes = [
    ["Standard", 32, 36],
    ["Small", 28, 32],
    ["Extra small", 28, 28],
    ["Large", 36, 40],
    ["Icon", 32, 36],
    ["Small icon", 32, 32],
    ["Dialog trigger", 32, 36],
    ["Custom height", 56, 56],
  ] as const;
  for (const [name, compact] of sizes) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCSS(
      "height",
      `${mobile ? Math.max(44, compact) : compact}px`
    );
  }
  const content = page.getByRole("button", { name: LONG_CHOICE });
  expect(
    await content.evaluate((el) => el.scrollHeight <= el.clientHeight)
  ).toBe(true);
  expect((await content.boundingBox())?.height).toBeGreaterThan(44);
  const customIcon = page.getByRole("button", {
    name: "Custom icon",
    exact: true,
  });
  await expect(customIcon).toHaveCSS("width", mobile ? "44px" : "24px");
  await expect(customIcon).toHaveCSS("height", mobile ? "44px" : "24px");
  await page.evaluate(() => delete document.body.dataset.density);
  for (const [name, , normal] of sizes) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCSS(
      "height",
      `${normal}px`
    );
  }
});

test("LinkedIn destinations use the authorization frame and compact choices", async ({
  page,
}) => {
  await page.goto("/linkedin-account-select?selection=fixture&state=fixture");
  await expect(page.locator('[data-slot="authorization-guide"]')).toHaveCount(
    4
  );
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.first()).toBeChecked();
  for (const choice of await page
    .locator('[data-slot="account-choice"]')
    .all()) {
    const box = await choice.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeLessThanOrEqual(58);
    expect(
      await choice.evaluate((el) => el.scrollWidth <= el.clientWidth)
    ).toBe(true);
    const dot = await choice.getByRole("radio").boundingBox();
    expect(dot!.height).toBe(dot!.width);
  }
  await radios.first().focus();
  await page.keyboard.down("ArrowDown");
  await expect(radios.last()).toBeFocused();
  await expect(radios.last()).toBeChecked();
  await page.keyboard.up("ArrowDown");
  await expect(
    page.getByRole("button", { name: "Connect destination" })
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});

test("authorization frame stays present for invalid LinkedIn links and extension success", async ({
  page,
}) => {
  await page.goto("/linkedin-account-select");
  await expect(page.getByRole("alert")).toHaveText(
    "This LinkedIn connection attempt is invalid. Start again."
  );
  await expect(page.locator('[data-slot="authorization-guide"]')).toHaveCount(
    4
  );
  await expect(
    page.getByRole("button", { name: "Connect destination" })
  ).toBeDisabled();
  await page.goto("/extension-auth-success");
  await expect(page.locator('[data-slot="authorization-guide"]')).toHaveCount(
    4
  );
  await expect(
    page.getByRole("link", { name: "Go to Delulu Social" })
  ).toHaveAttribute("href", "/");
});

test("LinkedIn loading and unavailable Pages keep the same frame", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.fixtureConfig = {
      latency: 1000,
      linkedInTargets: [{ id: "member", name: "Alex Morgan", type: "member" }],
    };
  });
  await page.goto(
    "/linkedin-account-select?selection=fixture&state=fixture&pages=unavailable"
  );
  await expect(page.getByRole("status")).toHaveText(
    "Loading LinkedIn destinations…"
  );
  await expect(page.locator('[data-slot="authorization-guide"]')).toHaveCount(
    4
  );
  await expect(page.getByRole("radio")).toBeChecked();
  await expect(
    page.getByText("We couldn't load your LinkedIn Pages.", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect destination" })
  ).toBeEnabled();
  await expect(page.locator('[data-slot="authorization-guide"]')).toHaveCount(
    4
  );
});
