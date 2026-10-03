import { expect, type Page, test } from "@playwright/test";
import { guardFixtureRequests } from "./fixture-guards";

const ADD_VIDEO = /^Add a video\./;
const GOES_OUT = /^Goes out /;
const CUSTOMIZE = /Customize/;

guardFixtureRequests();

const chip = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** The settings rail is inline on desktop and a sheet on small screens. */
async function postSettings(page: Page) {
  const open = page.getByRole("button", { name: "Open post settings" });
  if (await open.isVisible()) {
    await open.click();
    return page.getByRole("dialog", { name: "Post settings" });
  }
  return page.getByRole("complementary", { name: "Post settings" });
}

test("composer explains what each channel needs before publishing", async ({
  page,
}) => {
  await page.goto("/post?accounts");
  await expect(page.getByRole("heading", { name: "Channels" })).toContainText(
    "0 of 5"
  );

  await chip(page, "Swaraj Human").click();
  await expect(chip(page, "Swaraj Human")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: ADD_VIDEO })).toBeVisible();

  let settings = await postSettings(page);
  await expect(settings.getByText("Swaraj Human: Add a video")).toBeVisible();
  await settings.getByRole("button", { name: "Swaraj Human options" }).click();
  await expect(page.getByRole("combobox", { name: "Visibility" })).toHaveText(
    "Public"
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Visibility" })).toBeHidden();
  const sheet = page.getByRole("dialog", { name: "Post settings" });
  if (await sheet.isVisible()) {
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
  }

  await chip(page, "Swaraj Human").click();
  await chip(page, "Swaraj Bachu").click();
  await page
    .getByRole("textbox", { name: "Post content" })
    .fill("Shipping the new composer today.");

  settings = await postSettings(page);
  await expect(settings.getByText("Ready to publish")).toBeVisible();
  await settings.getByRole("radio", { name: "Schedule" }).click();
  await expect(settings.getByText(GOES_OUT)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Schedule post" })
  ).toBeEnabled();

  settings = await postSettings(page);
  await settings.getByRole("radio", { name: "Post now" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Publish post" })
  ).toBeEnabled();
});

test("customizing a channel opens its own clearly labelled version", async ({
  page,
}) => {
  await page.goto("/post?accounts");
  await chip(page, "Swaraj Bachu").click();
  await chip(page, "swaraj").first().click();
  await page
    .getByRole("textbox", { name: "Post content" })
    .fill("Shared announcement");

  await page.getByRole("button", { name: CUSTOMIZE }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "swaraj", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "swaraj", exact: true }).click();

  await expect(
    page.getByText(
      "Custom version for swaraj. Edits here don’t change the other channels."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel").getByRole("textbox", { name: "Post content" })
  ).toHaveValue("Shared announcement");
});
