import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem("theme", theme),
    info.project.name === "mobile-dark" ? "dark" : "light"
  );
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:4180"
      ? route.continue()
      : route.abort()
  );
});
test.afterEach(async ({ page }) => {
  expect(
    await page.evaluate(() => Reflect.get(window, "fixtureUnhandled") ?? [])
  ).toEqual([]);
});

test("X quote settings persist, validate URLs, and retain reply restrictions", async ({
  page,
}) => {
  await page.goto("/__twitter");
  await page.getByRole("button", { name: "X settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Post to quote").fill("https://evil.test/post/123");
  await expect(dialog.getByRole("alert")).toContainText("valid X post ID");
  await dialog
    .getByLabel("Post to quote")
    .fill("https://x.com/wiz/status/1234567890123456789");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByLabel("Who can reply").click();
  await page.getByRole("option", { name: "Only accounts you mention" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "X settings" }).click();
  await expect(dialog.getByLabel("Post to quote")).toHaveValue(
    "https://x.com/wiz/status/1234567890123456789"
  );
  await expect(dialog.getByLabel("Who can reply")).toContainText(
    "Only accounts you mention"
  );
  await expect(page.getByTestId("twitter-settings")).toContainText(
    '"replyRestriction":"mentioned"'
  );
});

test("X Article settings require a title and remove the tweet counter", async ({
  page,
}, info) => {
  await page.goto("/__twitter");
  await expect(page.getByLabel("Characters remaining")).toHaveText("265");
  await page.getByRole("button", { name: "X settings" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Format", { exact: true }).click();
  await page.getByRole("option", { name: "Article", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Add a title");
  await dialog.getByLabel("Article title").fill("My native X Article");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByLabel("Post to quote")).toHaveCount(0);
  const size = await dialog.getByLabel("Format", { exact: true }).boundingBox();
  expect(size?.height).toBeGreaterThanOrEqual(
    info.project.name === "mobile-dark" ? 44 : 32
  );
  if (info.project.name === "mobile-dark") {
    const closeSize = await dialog
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox();
    expect(closeSize?.height).toBeGreaterThanOrEqual(44);
    expect(closeSize?.width).toBeGreaterThanOrEqual(44);
  }
  await dialog.screenshot({
    path: `../../.context/twitter-article-${info.project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("twitter-settings")).toContainText(
    '"format":"article"'
  );
  await expect(page.getByLabel("Characters remaining")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add another post to thread" })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "X settings" }).click();
  await expect(dialog.getByLabel("Article title")).toHaveValue(
    "My native X Article"
  );
});
