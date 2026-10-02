import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Page from "@/app/(unauthenticated)/sign-in/[[...sign-in]]/page";

vi.mock("@delulu/auth", () => ({
  SignIn: () => <h1>Welcome back</h1>,
}));

test("Sign In Page", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Welcome back",
    })
  ).toBeDefined();
});
