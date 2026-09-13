import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LinkedInAccountSelect } from "./linkedin-account-select";

const navigation = vi.hoisted(() => ({ query: "selection=test&state=signed" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.query = "selection=test&state=signed";
});

it("offers personal and Page destinations after authorization", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        targets: [
          { id: "member", name: "Test Member", type: "member" },
          {
            id: "urn:li:organization:123",
            name: "Test Page",
            type: "organization",
          },
        ],
      })
    )
  );
  render(<LinkedInAccountSelect />);
  expect(
    await screen.findByRole("radio", { name: "Test Page LinkedIn Page" })
  ).toBeTruthy();
  expect(
    screen.getByRole("radio", { name: "Test Member Personal profile" })
  ).toBeTruthy();
});

it.each([
  ["", "LinkedIn returned no eligible Pages"],
  ["&pages=unavailable", "We couldn't load your LinkedIn Pages"],
])("explains missing Pages without silently completing the profile (%s)", async (query, message) => {
  navigation.query += query;
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      targets: [{ id: "member", name: "Test Member", type: "member" }],
    })
  );
  vi.stubGlobal("fetch", fetcher);
  render(<LinkedInAccountSelect />);
  expect(await screen.findByText(message, { exact: false })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Connect destination" })
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Back to Connected Accounts" })
      .getAttribute("href")
  ).toBe("/socials");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
