import { expect, test } from "@playwright/test";
import { guardFixtureRequests } from "./fixture-guards";

guardFixtureRequests();

test("team workspaces open Clerk organization settings with Delulu's sharing page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.fixtureConfig = { team: { role: "admin", publicShareLinks: true } };
  });
  // The switcher (and its settings button) shows in the expanded sidebar.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("link", { name: "Organization settings" }).click();
  await expect(page.getByTestId("clerk-organization-profile")).toBeVisible();
  const sharing = page.getByRole("region", { name: "Sharing" });
  await expect(
    sharing.getByRole("switch", { name: "Allow public share links" })
  ).toBeChecked();
});

test("personal workspaces have no organization settings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Organization settings" })
  ).toHaveCount(0);
  await page.goto("/organization");
  await expect(
    page.getByText("This is your personal workspace", { exact: false })
  ).toBeVisible();
  await expect(page.getByTestId("clerk-organization-profile")).toHaveCount(0);
});
