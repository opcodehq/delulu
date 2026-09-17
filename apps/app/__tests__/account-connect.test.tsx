import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Page from "../app/connect/account/page";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  token: vi.fn(),
  workspaces: vi.fn(),
  mint: vi.fn(),
}));
vi.mock("@delulu/auth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: mocks.signedIn,
    userId: "user_test",
    getToken: mocks.token,
  }),
  SignInButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@delulu/client", () => ({
  createApiClient: () => ({ agentChannels: mocks, connections: mocks }),
  runEffect: (effect: unknown) => effect,
}));
beforeEach(() => {
  mocks.signedIn = true;
  mocks.workspaces.mockResolvedValue([
    { workspaceId: "workspace_test", name: "Personal" },
  ]);
  mocks.mint.mockRejectedValue(new Error("Provider unavailable"));
  window.history.replaceState(
    null,
    "",
    "/connect/account?workspaceId=workspace_test&platform=LINKEDIN"
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires sign-in without starting authorization", () => {
  mocks.signedIn = false;
  render(<Page />);
  expect(
    screen.getByRole("button", { name: "Sign in to Delulu" })
  ).toBeDefined();
  expect(mocks.workspaces).not.toHaveBeenCalled();
  expect(mocks.mint).not.toHaveBeenCalled();
});

it("requires explicit confirmation and uses the existing connection endpoint", async () => {
  render(<Page />);
  const button = await screen.findByRole("button", {
    name: "Continue to LinkedIn",
  });
  expect(mocks.mint).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(mocks.mint).toHaveBeenCalledWith({
      params: { workspaceId: "workspace_test", platform: "LINKEDIN" },
      payload: { includeInsights: true, client: "cli" },
    })
  );
  expect(await screen.findByRole("alert")).toBeDefined();
});

it("rejects a workspace outside the eligible membership list", async () => {
  mocks.workspaces.mockResolvedValue([]);
  render(<Page />);
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(
    screen.queryByRole("button", { name: "Continue to LinkedIn" })
  ).toBeNull();
  expect(mocks.mint).not.toHaveBeenCalled();
});

it("rejects unsupported platforms before reading workspace data", async () => {
  window.history.replaceState(
    null,
    "",
    "/connect/account?workspaceId=workspace_test&platform=UNKNOWN"
  );
  render(<Page />);
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(mocks.workspaces).not.toHaveBeenCalled();
});
