import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Page from "../app/(unauthenticated)/sign-up/[[...sign-up]]/page";

vi.mock("@delulu/auth", () => ({
  SignUp: () => <h1>Create an account</h1>,
}));

afterEach(() => vi.unstubAllGlobals());

test("Sign Up Page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ registrationEnabled: true }))
  );
  render(await Page());
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Create an account",
    })
  ).toBeDefined();
});
