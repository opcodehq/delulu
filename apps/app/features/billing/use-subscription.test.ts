import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscription } from "./use-subscription";

const mocks = vi.hoisted(() => ({
  query: {
    data: null as null | {
      id: string;
      billingOwnerUserId: string;
      plan: string;
      status: string;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      billingInterval: string | null;
      currency: string | null;
      recurringAmountMinor: number | null;
      cancelAtPeriodEnd: boolean;
      canManageBilling: boolean;
      addons: Readonly<Record<string, unknown>>;
    },
    error: null as Error | null,
    isPending: false,
    refetch: vi.fn(),
  },
  workspace: {
    workspaceId: "workspace_test",
    isLoading: false,
    error: null as Error | null,
    retry: vi.fn(),
  },
}));

vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: () => ({
    resources: {
      billing: {
        subscription: () => ({
          queryKey: ["billing-subscription"],
          effect: vi.fn(),
        }),
      },
    },
  }),
}));

vi.mock("@/shell/state/resources", () => ({
  useResourceAtom: () => mocks.query,
}));

vi.mock("../../shell/providers/workspace", () => ({
  useWorkspaceSelection: () => mocks.workspace,
}));

describe("useSubscription", () => {
  beforeEach(() => {
    mocks.query.data = null;
    mocks.query.error = null;
    mocks.query.isPending = false;
  });

  it("treats a missing subscription as a settled unpaid state", () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current).toMatchObject({
      subscription: null,
      planType: "FREE",
      isActive: false,
      isFree: true,
      isPaid: false,
      isLoading: false,
      error: null,
    });
  });

  it.each([
    ["inactive", false, false],
    ["cancelled", false, true],
    ["active", true, false],
  ] as const)("normalizes an ECHO subscription with %s status", (status, isPaid, isCancelled) => {
    mocks.query.data = {
      id: "subscription_test",
      billingOwnerUserId: "user_test",
      plan: "ECHO",
      status,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      billingInterval: "MONTHLY",
      currency: "USD",
      recurringAmountMinor: 499,
      cancelAtPeriodEnd: false,
      canManageBilling: true,
      addons: {},
    };

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPaid).toBe(isPaid);
    expect(result.current.isCancelled).toBe(isCancelled);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
