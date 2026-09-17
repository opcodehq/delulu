import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Page from "../app/connect/telegram/page";

const INVITE_ONLY = /currently invite-only/;
const CONFIRM_IN_TELEGRAM = /Return to Telegram and confirm/;
const LOAD_ERROR = /Unable to load your eligible workspaces/;

const mocks = vi.hoisted(() => ({
  signedIn: false,
  token: vi.fn(),
  workspaces: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@delulu/auth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: mocks.signedIn,
    getToken: mocks.token,
  }),
  SignInButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@delulu/client", () => ({
  createApiClient: () => ({ agentChannels: mocks }),
  runEffect: (effect: unknown) => effect,
}));
beforeEach(() => {
  mocks.signedIn = false;
  mocks.workspaces.mockResolvedValue([]);
  mocks.confirm.mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/connect/telegram#test-challenge");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("uses the CLI authorization card with four dotted guide lines before sign-in", () => {
  const { container } = render(<Page />);
  expect(
    screen.getByRole("button", { name: "Sign in to Delulu" })
  ).toBeDefined();
  expect(
    container.querySelectorAll("span[aria-hidden].border-dotted")
  ).toHaveLength(4);
  expect(mocks.workspaces).not.toHaveBeenCalled();
});

it("keeps invite-only access gated", async () => {
  mocks.signedIn = true;
  render(<Page />);
  expect(await screen.findByText(INVITE_ONLY)).toBeDefined();
  expect(
    screen.queryByRole("button", { name: "Connect this workspace" })
  ).toBeNull();
});

it("does not mislabel a loading failure as missing beta access", async () => {
  mocks.signedIn = true;
  mocks.workspaces.mockRejectedValue(new Error("Network unavailable"));
  render(<Page />);
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(screen.getByText(LOAD_ERROR)).toBeDefined();
  expect(screen.queryByText(INVITE_ONLY)).toBeNull();
});

it("connects the selected workspace and requires confirmation back in Telegram", async () => {
  mocks.signedIn = true;
  mocks.workspaces.mockResolvedValue([
    { workspaceId: "workspace_test", name: "Personal" },
  ]);
  render(<Page />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Connect this workspace" })
  );
  await waitFor(() =>
    expect(mocks.confirm).toHaveBeenCalledWith({
      payload: { challenge: "test-challenge", workspaceId: "workspace_test" },
    })
  );
  expect(await screen.findByText(CONFIRM_IN_TELEGRAM)).toBeDefined();
  expect(window.location.hash).toBe("");
});
