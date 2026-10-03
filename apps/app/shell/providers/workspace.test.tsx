import { resourceEffect } from "@delulu/client";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace, WorkspaceProvider } from "@/shell/providers/workspace";
import { AppStateProvider } from "@/shell/state/resources";

vi.mock("@/shell/providers/api-client", () => ({
  useApiClient: vi.fn(),
}));

const clerk = vi.hoisted(() => ({
  orgId: null as string | null,
  setActive: vi.fn(async () => undefined),
}));
vi.mock("@delulu/auth", () => ({
  useAuth: () => ({ isLoaded: true, orgId: clerk.orgId }),
  useClerk: () => ({ setActive: clerk.setActive }),
}));

afterEach(cleanup);

const validWorkspace = {
  workspaceId: "workspace_valid",
  name: "Personal",
  slug: null,
  isPersonal: true,
  role: "owner" as const,
};

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    clerk.orgId = null;
    clerk.setActive.mockClear();
    vi.mocked(useApiClient).mockReturnValue({
      client: {} as ReturnType<typeof useApiClient>["client"],
      resources: {
        me: {
          workspaces: () =>
            resourceEffect({
              queryKey: ["me", "workspaces"] as const,
              effect: () => Effect.succeed({ data: [validWorkspace] }),
            }),
        },
      } as unknown as ReturnType<typeof useApiClient>["resources"],
    });
  });

  it("never exposes a persisted workspace before membership validation", async () => {
    localStorage.setItem("delulu.workspaceId", "workspace_stale");
    const seen: Array<string | null> = [];
    const Probe = () => {
      const { workspaceId } = useWorkspace();
      seen.push(workspaceId);
      return <div>{workspaceId ?? "none"}</div>;
    };

    render(
      <AppStateProvider>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </AppStateProvider>
    );

    await waitFor(() =>
      expect(screen.getByText(validWorkspace.workspaceId)).toBeTruthy()
    );
    expect(seen).not.toContain("workspace_stale");
  });
});

it("restores a valid second workspace without exposing the default workspace first", async () => {
  const second = { ...validWorkspace, workspaceId: "workspace_second" };
  localStorage.setItem("delulu.workspaceId", second.workspaceId);
  vi.mocked(useApiClient).mockReturnValue({
    client: {} as ReturnType<typeof useApiClient>["client"],
    resources: {
      me: {
        workspaces: () =>
          resourceEffect({
            queryKey: ["me", "workspaces"],
            effect: () => Effect.succeed({ data: [validWorkspace, second] }),
          }),
      },
    } as unknown as ReturnType<typeof useApiClient>["resources"],
  });
  const seen: Array<string | null> = [];
  function Probe() {
    const { workspaceId } = useWorkspace();
    seen.push(workspaceId);
    return <div>{workspaceId}</div>;
  }
  render(
    <AppStateProvider>
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    </AppStateProvider>
  );
  await screen.findByText(second.workspaceId);
  expect(seen).not.toContain(validWorkspace.workspaceId);
});

describe("Clerk organization sync", () => {
  const renderWith = (workspaces: unknown[]) => {
    vi.mocked(useApiClient).mockReturnValue({
      client: {} as ReturnType<typeof useApiClient>["client"],
      resources: {
        me: {
          workspaces: () =>
            resourceEffect({
              queryKey: ["me", "workspaces", workspaces.length],
              effect: () => Effect.succeed({ data: workspaces }),
            }),
        },
      } as unknown as ReturnType<typeof useApiClient>["resources"],
    });
    function Probe() {
      return <div>{useWorkspace().workspaceId ?? "none"}</div>;
    }
    render(
      <AppStateProvider>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </AppStateProvider>
    );
  };

  beforeEach(() => {
    localStorage.clear();
    clerk.orgId = null;
    clerk.setActive.mockClear();
  });

  it("activates the selected team workspace's Clerk organization", async () => {
    renderWith([
      {
        ...validWorkspace,
        workspaceId: "workspace_team",
        isPersonal: false,
        clerkOrgId: "org_team",
      },
    ]);
    await screen.findByText("workspace_team");
    await waitFor(() =>
      expect(clerk.setActive).toHaveBeenCalledWith({
        organization: "org_team",
      })
    );
  });

  it("clears the Clerk organization for a personal workspace", async () => {
    clerk.orgId = "org_previous";
    renderWith([{ ...validWorkspace, clerkOrgId: null }]);
    await screen.findByText(validWorkspace.workspaceId);
    await waitFor(() =>
      expect(clerk.setActive).toHaveBeenCalledWith({ organization: null })
    );
  });

  it("leaves Clerk alone when the organization is unknown", async () => {
    clerk.orgId = "org_previous";
    renderWith([
      { ...validWorkspace, workspaceId: "workspace_legacy", isPersonal: false },
    ]);
    await screen.findByText("workspace_legacy");
    expect(clerk.setActive).not.toHaveBeenCalled();
  });
});
