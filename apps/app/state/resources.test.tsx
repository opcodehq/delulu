import { mutationEffect, resourceEffect } from "@delulu/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppStateProvider,
  type MutationAtomResult,
  ResourceBoundary,
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "./resources";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Effect Atom resources", () => {
  it("publishes fetched data to every retry-policy variant", async () => {
    let value = "expired";
    const descriptor = resourceEffect({
      queryKey: ["test", "policy-variants"] as const,
      effect: () => Effect.sync(() => value),
    });
    const Probe = ({ retry }: { retry: number }) => {
      const query = useResourceAtom({
        ...descriptor,
        retry,
        staleTime: Number.POSITIVE_INFINITY,
      });
      return (
        <div>
          {retry}:{query.data}
        </div>
      );
    };
    const Refresh = () => {
      const registry = useResourceRegistry();
      return (
        <button
          onClick={async () => {
            value = "renewed";
            await registry.fetchResource(descriptor);
          }}
          type="button"
        >
          refresh all
        </button>
      );
    };
    render(
      <AppStateProvider>
        <ResourceBoundary fallback={<div>loading</div>}>
          <Probe retry={0} />
          <Probe retry={2} />
          <Refresh />
        </ResourceBoundary>
      </AppStateProvider>
    );
    await screen.findByText("0:expired");
    await screen.findByText("2:expired");
    fireEvent.click(screen.getByText("refresh all"));
    await screen.findByText("0:renewed");
    await screen.findByText("2:renewed");
  });
  it("suspends an initial read and renders its value", async () => {
    const descriptor = resourceEffect({
      queryKey: ["test", "read"] as const,
      effect: () => Effect.sleep("10 millis").pipe(Effect.as("ready")),
    });
    const Probe = () => {
      const query = useResourceAtom(descriptor);
      return <div>{query.data}</div>;
    };

    render(
      <AppStateProvider>
        <ResourceBoundary fallback={<div>loading</div>}>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    expect(screen.getByText("loading")).toBeTruthy();
    expect(await screen.findByText("ready")).toBeTruthy();
  });

  it("invalidates matching resources after a successful mutation", async () => {
    let reads = 0;
    const query = resourceEffect({
      queryKey: ["workspace", "one", "posts", "list"] as const,
      effect: () => Effect.sync(() => ++reads),
    });
    const mutation = mutationEffect({
      mutationKey: ["workspace", "one", "posts"] as const,
      effect: (_: undefined) => Effect.void,
    });
    const Probe = () => {
      const value = useResourceAtom(query);
      const write = useMutationAtom(mutation);
      return (
        <button onClick={() => write.mutate(undefined)} type="button">
          {value.data}
        </button>
      );
    };

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    const button = await screen.findByRole("button", { name: "1" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toBe("2")
    );
  });

  it("refetch bypasses stale data and resolves with the fresh response", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    let serverValue = "before transfer";
    let reads = 0;
    const query = resourceEffect({
      queryKey: ["workspace", "one", "connections", "list"] as const,
      effect: () =>
        Effect.sync(() => {
          reads += 1;
          return serverValue;
        }),
    });
    const Probe = () => {
      const value = useResourceAtom({ ...query, staleTime: 1 });
      return (
        <button
          onClick={async () => {
            serverValue = "connected account";
            await value.refetch();
          }}
          type="button"
        >
          {value.data}
        </button>
      );
    };

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    const button = await screen.findByRole("button", {
      name: "before transfer",
    });
    now.mockReturnValue(10);
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toBe("connected account")
    );
    expect(reads).toBe(2);
  });

  it("coalesces duplicate mutation attempts while a write is in flight", async () => {
    let writes = 0;
    let release: (() => void) | undefined;
    const mutation = mutationEffect({
      effect: (_: undefined) =>
        Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              writes += 1;
              release = resolve;
            })
        ),
    });
    const Probe = () => {
      const write = useMutationAtom(mutation);
      return (
        <button onClick={() => write.mutate(undefined)} type="button">
          write
        </button>
      );
    };

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    const button = screen.getByRole("button", { name: "write" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(writes).toBe(1));
    release?.();
  });

  it("allows concurrent mutation inputs that are not duplicates", async () => {
    const writes: string[] = [];
    const mutation = mutationEffect({
      effect: (value: string) =>
        Effect.sleep("10 millis").pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              writes.push(value);
            })
          )
        ),
    });
    let run: MutationAtomResult<void, string> | undefined;
    const Probe = () => {
      run = useMutationAtom(mutation);
      return null;
    };

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    await Promise.all([run?.mutateAsync("first"), run?.mutateAsync("second")]);
    expect(writes.sort()).toEqual(["first", "second"]);
  });

  it("deduplicates structurally identical reads", async () => {
    let reads = 0;
    const descriptor = resourceEffect({
      queryKey: ["workspace", "one", "deduplicated"] as const,
      effect: () =>
        Effect.sleep("10 millis").pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              reads += 1;
            })
          ),
          Effect.as("shared")
        ),
    });
    const Probe = () => <div>{useResourceAtom(descriptor).data}</div>;

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    expect((await screen.findAllByText("shared")).length).toBe(2);
    expect(reads).toBe(1);
  });

  it("retries typed failures using the declared policy", async () => {
    let attempts = 0;
    const descriptor = resourceEffect({
      queryKey: ["workspace", "one", "retry"] as const,
      effect: () =>
        Effect.suspend(() => {
          attempts += 1;
          return attempts === 1
            ? Effect.fail("temporary")
            : Effect.succeed("ok");
        }),
    });
    const Probe = () => (
      <div>{useResourceAtom({ ...descriptor, retry: 1 }).data}</div>
    );

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    expect(await screen.findByText("ok")).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("keeps provisioning failures behind the loading state until retry succeeds", async () => {
    let provisioned = false;
    setTimeout(() => {
      provisioned = true;
    }, 25);
    const descriptor = resourceEffect({
      queryKey: ["me", "workspaces", "provisioning"] as const,
      effect: () =>
        Effect.suspend(() =>
          provisioned
            ? Effect.succeed("ready")
            : Effect.fail(new Error("Workspace is still being provisioned"))
        ),
    });
    const Probe = () => (
      <div>
        {
          useResourceAtom({
            ...descriptor,
            retry: 4,
            retryDelayMs: 10,
          }).data
        }
      </div>
    );

    render(
      <AppStateProvider>
        <ResourceBoundary
          fallback={<div>preparing</div>}
          renderError={() => <div>setup error</div>}
        >
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    expect(screen.getByText("preparing")).toBeTruthy();
    expect(await screen.findByText("ready")).toBeTruthy();
    expect(screen.queryByText("setup error")).toBeNull();
  });

  it("refreshes mounted resources after reconnect", async () => {
    let reads = 0;
    const descriptor = resourceEffect({
      queryKey: ["workspace", "one", "online"] as const,
      effect: () => Effect.sync(() => ++reads),
    });
    const Probe = () => (
      <div>{useResourceAtom({ ...descriptor, staleTime: 60_000 }).data}</div>
    );

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    expect(await screen.findByText("1")).toBeTruthy();
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
  });

  it("shows the resource error message and a retry action", async () => {
    let shouldFail = true;
    const descriptor = resourceEffect({
      queryKey: ["test", "forbidden"] as const,
      effect: () =>
        shouldFail
          ? Effect.fail(
              Object.assign(
                new Error("You are not a member of this workspace"),
                {
                  _tag: "ForbiddenError",
                }
              )
            )
          : Effect.succeed("recovered"),
    });
    const Probe = () => {
      const query = useResourceAtom({ ...descriptor, retry: 0 });
      return <div>{query.data}</div>;
    };

    render(
      <AppStateProvider>
        <ResourceBoundary>
          <Probe />
        </ResourceBoundary>
      </AppStateProvider>
    );

    expect(
      await screen.findByText("You are not a member of this workspace")
    ).toBeTruthy();
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("recovered")).toBeTruthy();
  });
});
