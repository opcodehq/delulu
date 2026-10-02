import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ workspaceId: "a", reads: [] as string[] }));
vi.mock("@/shell/providers/workspace", () => ({
  useWorkspaceSelection: () => ({
    workspaceId: state.workspaceId,
    isLoading: false,
  }),
}));
vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({
    resources: {
      connections: { list: () => ({ queryKey: ["connections"] }) },
      analytics: {
        insights: (_: string, id: string) => ({ queryKey: ["insights", id] }),
      },
    },
  }),
}));
vi.mock("@/shell/state/resources", () => ({
  useResourceAtom: (options: { queryKey: string[]; enabled: boolean }) => {
    if (options.queryKey[0] === "connections") {
      return {
        data: {
          data: [{ id: `account_${state.workspaceId}`, platform: "instagram" }],
        },
      };
    }
    if (options.enabled) {
      state.reads.push(options.queryKey[1]);
    }
    return {};
  },
}));
vi.mock("@/shell/feature-gate", () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./analytics-content", () => ({ AnalyticsContent: () => null }));

import { AnalyticsClient } from "./analytics-client";

afterEach(cleanup);
it("never requests the previous workspace's connection after switching", async () => {
  state.workspaceId = "a";
  state.reads = [];
  const view = render(<AnalyticsClient />);
  await waitFor(() => expect(state.reads).toContain("account_a"));
  state.reads = [];
  state.workspaceId = "b";
  view.rerender(<AnalyticsClient />);
  await waitFor(() => expect(state.reads).toContain("account_b"));
  expect(state.reads).not.toContain("account_a");
});
