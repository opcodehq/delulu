import { resourceEffect } from "@delulu/client";
import { render, screen, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider } from "@/shell/state/resources";
import { useApiClient } from "./api-client";
import { useWorkspace, WorkspaceProvider } from "./workspace";

vi.mock("./api-client", () => ({
  useApiClient: vi.fn(),
}));

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
