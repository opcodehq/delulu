import { expect, type Page, test } from "@playwright/test";
import { guardFixtureRequests, records } from "./fixture-guards";

interface WrittenStep {
  id: string;
  type: "send_dm" | "condition";
  messageTemplate?: string;
  nextStepId?: string;
  yesStepId?: string | null;
  noStepId?: string;
}
interface AutomationWrite {
  method: string;
  body: {
    enabled?: boolean;
    triggers: { nextStepId?: string }[];
    steps: WrittenStep[];
  };
}

const COMMENTS = /Post or Reel Comments/;
const ANY_POST = /Any current or future post/;
const CONDITION_OPTION = /^Condition/;
const SEND_DM_OPTION = /^Send DM/;

guardFixtureRequests();

test.beforeEach(async ({ page }, info) => {
  // Phones get the step-list editor instead of the canvas
  test.skip(info.project.name !== "desktop", "Canvas editor is desktop-only");
  await page.addInitScript(() => {
    window.fixtureConfig = { connections: true };
  });
});

const writes = (page: Page) =>
  page.evaluate(
    () => (window.fixtureConfig?.automationWrites ?? []) as AutomationWrite[]
  );
/** Saving refetches the automation; let that finish before the guards run. */
const settled = (page: Page) =>
  expect
    .poll(async () => (await records(page)).every((r) => r.end !== undefined))
    .toBe(true);
const inspector = (page: Page, title: string) =>
  page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test("builds a connected branching DM flow from scratch", async ({ page }) => {
  await page.goto("/automations/new");

  // The only Instagram account is chosen for the user
  const wizard = page.getByRole("dialog");
  await expect(
    wizard.getByRole("heading", { name: "Choose Trigger Type" })
  ).toBeVisible();
  await expect(wizard.getByText("Select Instagram Account")).toHaveCount(0);
  await wizard.getByRole("button", { name: COMMENTS }).click();
  await wizard.getByRole("button", { name: "Continue" }).click();
  await wizard.getByRole("switch", { name: ANY_POST }).click();
  await wizard.getByRole("button", { name: "Continue" }).click();
  await wizard.getByRole("button", { name: "Add Trigger" }).click();

  // The first DM opens ready to write
  const firstDm = inspector(page, "Send DM");
  await expect(firstDm).toBeVisible();
  await firstDm
    .getByPlaceholder("Type your message...")
    .fill("Thanks for commenting!");

  await firstDm.getByRole("button", { name: "Add next step" }).click();
  await page.getByRole("button", { name: CONDITION_OPTION }).click();
  await inspector(page, "Condition")
    .getByRole("button", { name: "Close" })
    .click();

  await page
    .getByRole("button", { name: "Add step to the No path of Condition" })
    .click();
  await page.getByRole("button", { name: SEND_DM_OPTION }).click();
  const secondDm = inspector(page, "Send DM");
  await expect(secondDm.getByPlaceholder("Type your message...")).toHaveValue(
    ""
  );

  // A live automation with an empty DM is not saved
  await expect(page.getByRole("button", { name: "1 to fix" })).toBeVisible();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(
    page.getByText("All Send DM steps must have a message")
  ).toBeVisible();
  expect(await writes(page)).toEqual([]);

  await secondDm
    .getByPlaceholder("Type your message...")
    .fill("Follow us to unlock it");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect.poll(async () => (await writes(page)).length).toBe(1);

  const [{ method, body }] = await writes(page);
  expect(method).toBe("POST");
  expect(body.enabled).toBe(true);
  const byId = new Map(body.steps.map((step) => [step.id, step]));
  const first = byId.get(body.triggers[0].nextStepId ?? "");
  expect(first).toMatchObject({
    type: "send_dm",
    messageTemplate: "Thanks for commenting!",
  });
  const check = byId.get(first?.nextStepId ?? "");
  expect(check?.type).toBe("condition");
  expect(check?.yesStepId ?? null).toBeNull();
  expect(byId.get(check?.noStepId ?? "")).toMatchObject({
    type: "send_dm",
    messageTemplate: "Follow us to unlock it",
  });
  expect(body.steps).toHaveLength(3);
  await expect(page.getByText("Automation created")).toBeVisible();
  await settled(page);
});

test("palette steps attach below the selected step", async ({ page }) => {
  await page.goto("/automations/automation_fixture");
  await page.getByText("Here is the guide you asked for!").click();
  await expect(inspector(page, "Send DM")).toBeVisible();
  await expect(
    page.getByText("New steps connect below Send DM.")
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Steps" })
    .getByRole("button", { name: "Add Condition" })
    .click();
  await expect(inspector(page, "Condition")).toBeVisible();

  // The inspector does not block the canvas or the toolbar
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  const [{ method, body }] = await writes(page);
  expect(method).toBe("PATCH");
  const link = body.steps.find((step) => step.id === "step_link");
  const added = body.steps.find((step) => step.id === link?.nextStepId);
  expect(added).toMatchObject({ type: "condition" });
  await expect(page.getByText("Automation saved")).toBeVisible();
  await settled(page);
});
