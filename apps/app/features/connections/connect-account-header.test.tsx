import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectAccountDialog } from "@/features/connections/connect-account-header";

vi.mock("@delulu/auth", () => ({
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "member@example.test" } },
  }),
}));
vi.mock("@/features/billing/upgrade-prompt", () => ({
  InlineUpgradePrompt: () => null,
}));
vi.mock("@/shell/providers/workspace", () => ({
  useWorkspaceSelection: () => ({ workspaceId: "workspace_test" }),
}));
vi.mock("@/features/billing/use-usage-limits", () => ({
  useUsageLimit: () => ({ allowed: true }),
}));
vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({
    resources: { connections: { mint: () => ({}), list: () => ({}) } },
  }),
}));
vi.mock("@/shell/state/resources", () => ({
  ResourceBoundary: ({ children }: { children: React.ReactNode }) => children,
  useResourceAtom: () => ({ data: { total: 0 } }),
  useMutationAtom: () => ({ isPending: false }),
}));

afterEach(cleanup);

it("offers LinkedIn profiles and Pages alongside Twitter to ordinary members", () => {
  render(<ConnectAccountDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Connect Account" }));

  expect(
    screen.getByRole("button", {
      name: "LinkedIn Connect your profile or a Page",
    })
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "X (Twitter) Connect your X account" })
  ).toBeTruthy();
});
