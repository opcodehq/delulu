import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shell/providers/backend", () => ({
  BackendProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@delulu/design-system/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/shell/navigation/sidebar", () => ({
  GlobalSidebar: ({ children }: { children: React.ReactNode }) => (
    <>
      <nav>Navigation</nav>
      {children}
    </>
  ),
}));
vi.mock("@/shell/navigation/mobile-bottom-tabs", () => ({
  MobileBottomTabs: () => null,
}));
vi.mock("@/shell/navigation/posthog-identifier", () => ({
  PostHogIdentifier: () => null,
}));
vi.mock("@/shell/navigation/userjot-identifier", () => ({
  UserJotIdentifier: () => null,
}));
vi.mock("@/features/onboarding/feature-tour", () => ({
  FeatureTour: () => null,
}));
vi.mock("@/shell/state/resources", () => ({
  ResourceBoundary: ({ children }: { children: React.ReactNode }) => children,
  useResourceAtom: () => ({ data: undefined, isPending: true }),
}));
vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({ resources: { connections: { list: () => ({}) } } }),
}));
vi.mock("@/shell/providers/workspace", () => ({
  useWorkspace: () => ({ workspaceId: "a" }),
}));

import { AppShell } from "@/shell/app-shell";

describe("AppShell navigation", () => {
  it("renders ordinary pages while editor connections are still loading", () => {
    render(
      <AppShell>
        <h1>Workspace settings</h1>
      </AppShell>
    );
    expect(screen.getByRole("navigation")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Workspace settings" })
    ).toBeTruthy();
  });
});
