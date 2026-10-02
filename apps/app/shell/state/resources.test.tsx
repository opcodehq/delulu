import { mutationEffect, resourceEffect } from "@delulu/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Effect } from "effect";
import { useState } from "react";
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

  it.each([
    true,
    false,
  ])("shows errors and recovers on retry (suspense=%s)", async (suspense) => {
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
          : Effect.succeed("recovered").pipe(Effect.delay(30)),
    });
    const Probe = () => {
      const query = useResourceAtom({ ...descriptor, retry: 0, suspense });
      return <div>{query.isPending ? "Retry loading" : query.data}</div>;
    };

    function Parent() {
      const [version, setVersion] = useState(0);
      return (
        <AppStateProvider>
          <button onClick={() => setVersion(version + 1)} type="button">
            Rerender parent
          </button>
          <ResourceBoundary>
            <Probe />
          </ResourceBoundary>
        </AppStateProvider>
      );
    }
    render(<Parent />);

    expect(
      await screen.findByText("You are not a member of this workspace")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rerender parent" }));
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("recovered")).toBeTruthy();
  });
});

it("deduplicates concurrent reads even when observers request different retry policies", async () => {
  const read = vi.fn(() => "shared");
  const descriptor = resourceEffect({
    queryKey: ["test", "concurrent-policies"],
    effect: () => Effect.sleep("20 millis").pipe(Effect.map(read)),
  });
  function Probe({ retry }: { retry: number }) {
    const result = useResourceAtom({ ...descriptor, retry });
    return (
      <div>
        {retry}:{result.data}
      </div>
    );
  }
  render(
    <AppStateProvider>
      <ResourceBoundary>
        <Probe retry={0} />
        <Probe retry={2} />
      </ResourceBoundary>
    </AppStateProvider>
  );
  await screen.findByText("0:shared");
  await screen.findByText("2:shared");
  expect(read).toHaveBeenCalledTimes(1);
});

it("starts independent panel reads together without hiding navigation", async () => {
  const started: string[] = [];
  const resolvers = new Map<string, (value: string) => void>();
  const descriptor = (id: string) =>
    resourceEffect({
      queryKey: ["parallel", id],
      effect: () =>
        Effect.promise(
          () =>
            new Promise<string>((resolve) => {
              started.push(id);
              resolvers.set(id, resolve);
            })
        ),
    });
  function Page() {
    const first = useResourceAtom({ ...descriptor("first"), suspense: false });
    const second = useResourceAtom({
      ...descriptor("second"),
      suspense: false,
    });
    return (
      <>
        <nav>Navigation</nav>
        <div>{first.data ?? "first loading"}</div>
        <div>{second.data ?? "second loading"}</div>
      </>
    );
  }
  render(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  await waitFor(() => expect(started).toEqual(["first", "second"]));
  expect(screen.getByRole("navigation")).toBeTruthy();
  resolvers.get("first")!("first ready");
  resolvers.get("second")!("second ready");
  await screen.findByText("second ready");
});

it("ignores a late response from the previous workspace", async () => {
  let resolveOld: (value: string) => void = () => {
    /* Assigned by the deferred promise below. */
  };
  const old = new Promise<string>((resolve) => {
    resolveOld = resolve;
  });
  function Page({ workspace }: { workspace: string }) {
    const query = useResourceAtom({
      queryKey: ["workspace", workspace, "race"],
      effect: () =>
        workspace === "old"
          ? Effect.promise(() => old)
          : Effect.succeed("new data"),
      suspense: false,
    });
    return <div>{query.data ?? "loading"}</div>;
  }
  const view = render(
    <AppStateProvider>
      <Page workspace="old" />
    </AppStateProvider>
  );
  view.rerender(
    <AppStateProvider>
      <Page workspace="new" />
    </AppStateProvider>
  );
  await screen.findByText("new data");
  resolveOld("old data");
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(screen.queryByText("old data")).toBeNull();
  expect(screen.getByText("new data")).toBeTruthy();
});

it("does not reuse a previous session's data for an identical resource key", async () => {
  function Page({ session }: { session: string }) {
    const query = useResourceAtom({
      queryKey: ["me", "session-isolation"],
      effect: () => Effect.succeed(session),
      suspense: false,
    });
    return <div>{query.data ?? "loading"}</div>;
  }
  const view = render(
    <AppStateProvider key="first">
      <Page session="first session" />
    </AppStateProvider>
  );
  await screen.findByText("first session");
  view.rerender(
    <AppStateProvider key="second">
      <Page session="second session" />
    </AppStateProvider>
  );
  expect(screen.queryByText("first session")).toBeNull();
  await screen.findByText("second session");
});

it("shares callback reconciliation reads with the mounted account list", async () => {
  let resolve!: (value: string) => void;
  const read = vi.fn(() =>
    Effect.promise(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        })
    )
  );
  const descriptor = resourceEffect({
    queryKey: ["callback", "accounts"],
    effect: read,
  });
  function Page() {
    const registry = useResourceRegistry();
    const query = useResourceAtom({ ...descriptor, suspense: false });
    return (
      <>
        <div>{query.data ?? "waiting"}</div>
        <button
          onClick={() => {
            registry.fetchResource(descriptor).catch(() => undefined);
          }}
          type="button"
        >
          reconcile
        </button>
      </>
    );
  }
  render(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("reconcile"));
  await new Promise((done) => setTimeout(done, 20));
  expect(read).toHaveBeenCalledTimes(1);
  resolve("connected");
  await screen.findByText("connected");
});

it("retains cached content when a background refresh fails", async () => {
  let failed = false;
  const descriptor = resourceEffect({
    queryKey: ["background", "failure"],
    effect: () =>
      failed
        ? Effect.fail(new Error("offline"))
        : Effect.succeed("cached posts"),
  });
  function Page() {
    const registry = useResourceRegistry();
    const query = useResourceAtom({ ...descriptor, suspense: false, retry: 0 });
    return (
      <>
        <div>{query.data}</div>
        <button
          onClick={() => {
            failed = true;
            registry.invalidateResources({
              queryKey: descriptor.queryKey,
            });
          }}
          type="button"
        >
          refresh cached
        </button>
      </>
    );
  }
  render(
    <AppStateProvider>
      <ResourceBoundary>
        <Page />
      </ResourceBoundary>
    </AppStateProvider>
  );
  await screen.findByText("cached posts");
  fireEvent.click(screen.getByText("refresh cached"));
  await new Promise((done) => setTimeout(done, 30));
  expect(screen.queryByText("cached posts")).not.toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows a saved post before an unvisited list finishes loading", async () => {
  let resolve!: (value: readonly string[]) => void;
  const descriptor = resourceEffect({
    queryKey: ["workspace", "seed", "posts", "list"],
    effect: () =>
      Effect.promise(
        () =>
          new Promise<readonly string[]>((done) => {
            resolve = done;
          })
      ),
  });
  function List() {
    const query = useResourceAtom({ ...descriptor, suspense: false });
    return <div>{query.data?.join(",") ?? "empty"}</div>;
  }
  function Page() {
    const registry = useResourceRegistry();
    const [visible, setVisible] = useState(false);
    return (
      <>
        <button
          onClick={() => {
            registry.seedResource(descriptor, ["saved"], { revalidate: true });
            setVisible(true);
          }}
          type="button"
        >
          save post
        </button>
        {visible && <List />}
      </>
    );
  }
  render(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  fireEvent.click(screen.getByText("save post"));
  await screen.findByText("saved");
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  expect(screen.queryByText("empty")).toBeNull();
  resolve(["saved", "older"]);
  await screen.findByText("saved,older");
});

it("does not retain cached private data after authorization is revoked", async () => {
  let revoked = false;
  const descriptor = resourceEffect({
    queryKey: ["access", "revoked"],
    effect: () =>
      revoked
        ? Effect.fail({ _tag: "ForbiddenError", message: "Access revoked" })
        : Effect.succeed("private data"),
  });
  function Page() {
    const registry = useResourceRegistry();
    const query = useResourceAtom({
      ...descriptor,
      suspense: false,
      retry: 0,
      throwOnError: false,
    });
    return (
      <>
        <div>{query.data ?? "no data"}</div>
        <button
          onClick={() => {
            revoked = true;
            registry.invalidateResources({ queryKey: descriptor.queryKey });
          }}
          type="button"
        >
          revoke access
        </button>
      </>
    );
  }
  render(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  await screen.findByText("private data");
  fireEvent.click(screen.getByText("revoke access"));
  await screen.findByText("no data");
  expect(screen.queryByText("private data")).toBeNull();
});

it("refreshes processing data without overlapping reads and stops when unmounted", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  let active = 0;
  let maximum = 0;
  let reads = 0;
  const descriptor = resourceEffect({
    queryKey: ["processing", "poll"],
    effect: () =>
      Effect.promise(async () => {
        reads++;
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((done) => setTimeout(done, 25));
        active--;
        return "processing";
      }),
  });
  function Page() {
    const query = useResourceAtom({
      ...descriptor,
      suspense: false,
      refetchInterval: 10,
    });
    return <div>{query.data}</div>;
  }
  const page = render(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  await waitFor(() => expect(reads).toBeGreaterThanOrEqual(3));
  expect(maximum).toBe(1);
  page.unmount();
  const previous = reads;
  await new Promise((done) => setTimeout(done, 60));
  expect(reads).toBe(previous);
});

it("keeps a pending mutation in its initiating workspace", async () => {
  let release!: () => void;
  const before = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  function Page({ workspace }: { workspace: string }) {
    const mutation = useMutationAtom({
      mutationKey: ["workspace", workspace, "posts"],
      effect: () =>
        Effect.sync(() => {
          writes.push(workspace);
          return workspace;
        }),
      onMutate: () => before,
    });
    return (
      <button onClick={() => mutation.mutate(undefined)} type="button">
        save in workspace
      </button>
    );
  }
  const page = render(
    <AppStateProvider>
      <Page workspace="first" />
    </AppStateProvider>
  );
  fireEvent.click(screen.getByText("save in workspace"));
  page.rerender(
    <AppStateProvider>
      <Page workspace="second" />
    </AppStateProvider>
  );
  release();
  await waitFor(() => expect(writes).toEqual(["first"]));
});

it("revalidates a stale retained page on return without hiding its cached content", async () => {
  const started = Date.now();
  let resolve!: (value: string) => void;
  let reads = 0;
  const descriptor = resourceEffect({
    queryKey: ["return", "stale"],
    effect: () => {
      reads++;
      return reads === 1
        ? Effect.succeed("cached content")
        : Effect.promise(
            () =>
              new Promise<string>((done) => {
                resolve = done;
              })
          );
    },
  });
  function Page() {
    const query = useResourceAtom({
      ...descriptor,
      suspense: false,
      staleTime: 1000,
    });
    return <div>{query.data ?? "loading"}</div>;
  }
  const app = render(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  await screen.findByText("cached content");
  app.rerender(
    <AppStateProvider>
      <div>other page</div>
    </AppStateProvider>
  );
  vi.spyOn(Date, "now").mockReturnValue(started + 60_000);
  app.rerender(
    <AppStateProvider>
      <Page />
    </AppStateProvider>
  );
  expect(screen.getByText("cached content")).toBeTruthy();
  await waitFor(() => expect(reads).toBe(2));
  expect(screen.queryByText("loading")).toBeNull();
  resolve("updated content");
  await screen.findByText("updated content");
});
