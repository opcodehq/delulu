import { expect, test } from "@playwright/test";
import { guardFixtureRequests } from "./fixture-guards";

const SCHEDULED = /^Scheduled for /;
const SIGN_IN_HREF = /^\/sign-in\?redirect_url=/;
const SHARE_URL = /\/share\/fixture-share-token$/;
const EXPIRES = /^Expires in \d+ days?/;

guardFixtureRequests();

const signedOut = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => {
    window.fixtureConfig = { signedOut: true };
  });

test("guests see every channel and can leave named feedback", async ({
  page,
}) => {
  await signedOut(page);
  await page.goto("/share/fixture-share");

  await expect(
    page.getByRole("heading", { name: "Post preview" })
  ).toBeVisible();
  await expect(page.getByText("Shared by")).toContainText("Northwind Studio");
  await expect(page.getByText(SCHEDULED)).toBeVisible();
  await expect(page.getByText("Day one: the new composer.")).toBeVisible();

  await page.getByRole("tab", { name: "Northwind Studio" }).click();
  await expect(
    page.getByText("We're kicking off launch week on Monday")
  ).toBeVisible();

  const send = page.getByRole("button", { name: "Send feedback" });
  await page.getByLabel("Your feedback").fill("Add the date?");
  await expect(send).toBeDisabled();
  await page.getByLabel("Your name").fill("Alex");
  await send.click();
  const feedback = page.getByRole("complementary", { name: "Feedback" });
  await expect(feedback.getByText("Add the date?")).toBeVisible();
  await expect(feedback.getByText("Alex")).toBeVisible();
  await expect(page.getByLabel("Your feedback")).toHaveValue("");
});

test("share link failures explain what to do next", async ({ page }) => {
  await signedOut(page);
  for (const [token, heading] of [
    ["members", "Sign in to view this preview"],
    ["expired", "This link has expired"],
    ["missing", "Link not found"],
  ] as const) {
    await page.goto(`/share/${token}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.goto("/share/members");
  await expect(
    page.getByRole("link", { name: "Sign in to view" })
  ).toHaveAttribute("href", SIGN_IN_HREF);
});

test("signed-in outsiders are told the preview is members-only", async ({
  page,
}) => {
  await page.goto("/share/outsider");
  await expect(
    page.getByRole("heading", { name: "You don't have access" })
  ).toBeVisible();
});

test("members create, copy, restrict, and turn off a share link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    window.fixtureConfig = { samplePosts: true };
  });
  await page.goto("/posts");
  await page.getByRole("button", { name: "Post actions" }).first().click();
  await page.getByRole("menuitem", { name: "Share preview" }).click();

  const dialog = page.getByRole("dialog", { name: "Share preview" });
  await expect(
    dialog.getByRole("radio", { name: "Anyone with the link" })
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Create and copy link" }).click();

  const link = dialog.getByRole("textbox", { name: "Share link" });
  await expect(link).toHaveValue(SHARE_URL);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    SHARE_URL
  );
  await expect(dialog.getByText(EXPIRES)).toBeVisible();

  await dialog.getByRole("radio", { name: "Workspace members only" }).click();
  await expect(
    dialog.getByRole("radio", { name: "Workspace members only" })
  ).toBeChecked();

  await dialog.getByRole("button", { name: "Turn off link" }).click();
  await expect(
    dialog.getByRole("button", { name: "Create and copy link" })
  ).toBeVisible();
});

const openShareDialog = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Post actions" }).first().click();
  await page.getByRole("menuitem", { name: "Share preview" }).click();
  return page.getByRole("dialog", { name: "Share preview" });
};

test("team workspaces default new links to members only", async ({ page }) => {
  await page.addInitScript(() => {
    window.fixtureConfig = {
      samplePosts: true,
      team: { role: "editor", publicShareLinks: true },
    };
  });
  await page.goto("/posts");
  const dialog = await openShareDialog(page);
  await expect(
    dialog.getByRole("radio", { name: "Workspace members only" })
  ).toBeChecked();
  await expect(
    dialog.getByRole("radio", { name: "Anyone with the link" })
  ).toBeEnabled();
});

test("admins can turn off public links for the whole workspace", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.fixtureConfig = {
      samplePosts: true,
      team: { role: "admin", publicShareLinks: true },
    };
  });
  await page.goto("/organization");
  const toggle = page.getByRole("switch", { name: "Allow public share links" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await page.locator('a[href="/posts"]:visible').first().click();
  const dialog = await openShareDialog(page);
  const anyone = dialog.getByRole("radio", { name: "Anyone with the link" });
  await expect(anyone).toBeDisabled();
  await expect(
    dialog.getByText("Turned off by a workspace admin")
  ).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: "Workspace members only" })
  ).toBeChecked();
});

test("only owners and admins can change the sharing policy", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.fixtureConfig = {
      team: { role: "editor", publicShareLinks: true },
    };
  });
  await page.goto("/organization");
  await expect(
    page.getByRole("switch", { name: "Allow public share links" })
  ).toBeDisabled();
  await expect(
    page.getByText("Only workspace owners and admins can change this.")
  ).toBeVisible();
});
