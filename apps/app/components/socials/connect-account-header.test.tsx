import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectAccountDialog } from "./connect-account-header";

vi.mock("@delulu/auth", () => ({
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "member@example.test" } },
  }),
}));
vi.mock("@/components/billing/upgrade-prompt", () => ({
  InlineUpgradePrompt: () => null,
}));
vi.mock("@/hooks/use-active-workspace", () => ({
  useActiveWorkspace: () => ({ workspaceId: "workspace_test" }),
}));
vi.mock("@/hooks/use-usage-limits", () => ({
  useUsageLimit: () => ({ allowed: true }),
}));
vi.mock("@/components/providers/api-client", () => ({
  useApiClient: () => ({
    resources: { connections: { mint: () => ({}), list: () => ({}) } },
  }),
}));
vi.mock("@/state/resources", () => ({
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
