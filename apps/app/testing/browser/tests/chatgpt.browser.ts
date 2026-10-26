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
    await page.evaluate(() => Reflect.get(window, "fixtureUnhandled"))
  ).toEqual([]);
});
test("connects with a device code, selects a model and disconnects", async ({
  page,
}) => {
  await page.goto("/agent/settings");
  await expect(
    page.getByRole("heading", { name: "Agent settings" })
  ).toBeVisible();
  const connect = page.getByRole("button", {
    name: "Connect ChatGPT",
    exact: true,
  });
  await expect(connect).toBeVisible();
  expect((await connect.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await connect.click();
  await expect(page.getByLabel("Device code")).toHaveText("ABCD-1234");
  await expect(
    page.getByRole("link", { name: "Continue to OpenAI" })
  ).toHaveAttribute("href", "https://auth.openai.com/codex/device");
  await expect(
    page.getByText("Connected as person@example.test · plus")
  ).toBeVisible();
  await page.getByLabel("Model", { exact: true }).selectOption("test-model");
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue(
    "test-model"
  );
  await page
    .getByRole("button", { name: "Use Delulu runtime instead" })
    .click();
  await expect(
    page.getByText("Telegram is using the Delulu runtime.", { exact: false })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect ChatGPT", exact: true })
    .click();
  await expect(page.getByText("ChatGPT is not connected.")).toBeVisible();
});
test("cancels sign-in and shows expiry", async ({ page }) => {
  await page.addInitScript(() => {
    window.fixtureConfig = { chatGPT: "expired" };
  });
  await page.goto("/agent/settings");
  await page
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel sign-in" }).click();
  await expect(page.getByLabel("Device code")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Sign-in expired. Try again."
  );
});
test("disabled installation has no connection action", async ({ page }) => {
  await page.addInitScript(() => {
    window.fixtureConfig = { chatGPT: "disabled" };
  });
  await page.goto("/agent/settings");
  await expect(
    page.getByText("ChatGPT connections are not enabled on this installation.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect ChatGPT", exact: true })
  ).toHaveCount(0);
});
test("failed status can be retried", async ({ page }) => {
  await page.addInitScript(() => {
    window.fixtureConfig = { failures: { "/agent/chatgpt": 100 } };
  });
  await page.goto("/agent/settings");
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await page.evaluate(() => {
    window.fixtureConfig!.failures!["/agent/chatgpt"] = 0;
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("button", { name: "Connect ChatGPT", exact: true })
  ).toBeVisible();
});
