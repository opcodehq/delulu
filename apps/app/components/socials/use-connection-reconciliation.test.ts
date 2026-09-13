import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionIsVisible,
  useConnectionReconciliation,
} from "./use-connection-reconciliation";

const mocks = vi.hoisted(() => ({
  registry: { fetchResource: vi.fn() },
  resources: { connections: { list: vi.fn(() => ({})) } },
}));
vi.mock("@/components/providers/api-client", () => ({
  useApiClient: () => ({ resources: mocks.resources }),
}));
vi.mock("@/state/resources", () => ({
  useResourceRegistry: () => mocks.registry,
}));

const accounts = [
  {
    platform: "LINKEDIN",
    profileId: "urn:li:organization:123",
    username: "company-page",
    displayName: "Company Page",
  },
  {
    platform: "TWITTER",
    profileId: "twitter-1",
    username: "@delulu",
    displayName: "Delulu",
  },
] as const;

describe("connection reconciliation lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits for renewed expiry instead of accepting an already-visible expired account", async () => {
    const stale = { ...accounts[0], expiresAt: "2020-01-01T00:00:00.000Z" };
    const renewed = { ...accounts[0], expiresAt: "2099-01-01T00:00:00.000Z" };
    mocks.registry.fetchResource
      .mockResolvedValueOnce({ data: [stale] })
      .mockResolvedValue({ data: [renewed] });
    const { result } = renderHook(() =>
      useConnectionReconciliation({
        enabled: true,
        provider: "linkedin",
        callbackProfileId: accounts[0].profileId,
        callbackUsername: "Company Page",
        workspaceId: "workspace-1",
      })
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mocks.registry.fetchResource).toHaveBeenCalledTimes(2);
  });

  it("finishes after React replays the effect in Strict Mode", async () => {
    mocks.registry.fetchResource.mockResolvedValue({ data: accounts });
    const { result } = renderHook(
      () =>
        useConnectionReconciliation({
          enabled: true,
          provider: "linkedin",
          callbackProfileId: accounts[0].profileId,
          callbackUsername: "Company Page",
          workspaceId: "workspace-1",
        }),
      { wrapper: StrictMode }
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("ignores a previous workspace request completing after a switch", async () => {
    let finishOld: (value: { data: typeof accounts }) => void = () => undefined;
    mocks.registry.fetchResource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    );
    mocks.registry.fetchResource.mockImplementation(
      () => new Promise(() => undefined)
    );
    const { result, rerender } = renderHook(
      ({ workspaceId }) =>
        useConnectionReconciliation({
          enabled: true,
          provider: "linkedin",
          callbackProfileId: accounts[0].profileId,
          callbackUsername: "Company Page",
          workspaceId,
        }),
      { initialProps: { workspaceId: "workspace-1" } }
    );
    rerender({ workspaceId: "workspace-2" });
    await act(async () => finishOld({ data: accounts }));
    expect(result.current.status).toBe("syncing");
  });
});

describe("connectionIsVisible", () => {
  it("accepts refreshable accounts without a reauthorization deadline", () => {
    expect(
      connectionIsVisible(
        [{ ...accounts[0], expiresAt: null }],
        "linkedin",
        accounts[0].profileId,
        null
      )
    ).toBe(true);
  });

  it("rejects an invalid expiry instead of reporting success", () => {
    expect(
      connectionIsVisible(
        [{ ...accounts[0], expiresAt: "invalid" }],
        "linkedin",
        accounts[0].profileId,
        null
      )
    ).toBe(false);
  });
  it("matches the callback provider and identity without handle punctuation", () => {
    expect(
      connectionIsVisible(accounts, "linkedin", null, "@company-page")
    ).toBe(true);
  });

  it("does not report ready for a different account on the same provider", () => {
    expect(
      connectionIsVisible(accounts, "linkedin", null, "another-page")
    ).toBe(false);
  });

  it("accepts any account for the provider when no identity is returned", () => {
    expect(connectionIsVisible(accounts, "twitter", null, null)).toBe(true);
  });

  it("uses the stable profile id before a potentially duplicate display name", () => {
    expect(
      connectionIsVisible(
        accounts,
        "linkedin",
        "urn:li:organization:456",
        "Company Page"
      )
    ).toBe(false);
  });
});
