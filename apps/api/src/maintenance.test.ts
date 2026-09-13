import { AgentWorkspaceService, MaintenanceScheduler } from "@delulu/services";
import { Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";
import { maintenanceResponse, runMaintenance } from "./maintenance";

it.each([
  true,
  false,
])("runs agent recovery only when its lease is acquired: %s", async (due) => {
  const run = vi.fn(() =>
    Effect.succeed({ approvalsExpired: 0, runsTimedOut: 0 })
  );
  const complete = vi.fn(() => Effect.void);
  await runMaintenance(
    Layer.mergeAll(
      Layer.succeed(AgentWorkspaceService, { runMaintenance: run } as never),
      Layer.succeed(MaintenanceScheduler, {
        claim: () => Effect.succeed(due),
        complete,
        fail: () => Effect.void,
      })
    )
  );
  expect(run).toHaveBeenCalledTimes(due ? 1 : 0);
  expect(complete).toHaveBeenCalledTimes(due ? 1 : 0);
  if (due) {
    expect(complete).toHaveBeenCalledWith({
      jobKey: "agent-runtime-maintenance",
      intervalSeconds: 30,
    });
  }
});

it("releases the recovery lease after failure", async () => {
  const fail = vi.fn(() => Effect.void);
  const complete = vi.fn(() => Effect.void);
  await runMaintenance(
    Layer.mergeAll(
      Layer.succeed(AgentWorkspaceService, {
        runMaintenance: () => Effect.die("test failure"),
      } as never),
      Layer.succeed(MaintenanceScheduler, {
        claim: () => Effect.succeed(true),
        complete,
        fail,
      })
    )
  );
  expect(fail).toHaveBeenCalledWith({ jobKey: "agent-runtime-maintenance" });
  expect(complete).not.toHaveBeenCalled();
});

describe("API cutover maintenance", () => {
  it.each([
    undefined,
    "false",
    "",
  ])("does not affect normal traffic (%s)", (flag) => {
    expect(
      maintenanceResponse(new Request("https://api.test/v1/posts"), flag)
    ).toBeNull();
  });

  it.each([
    "/v1/posts",
    "/v1/connections/callback/linkedin?code=test",
    "/health",
    "/internal/jobs/",
    "/internal/jobs/other",
  ])("blocks %s without invoking application handlers", async (path) => {
    const response = maintenanceResponse(
      new Request(`https://api.test${path}`),
      "true"
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe("60");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({
      error: "maintenance",
      message:
        "The API is temporarily paused for maintenance. Please retry shortly.",
    });
  });

  it("leaves the exact transfer endpoint to its existing authentication handler", () => {
    expect(
      maintenanceResponse(
        new Request("https://api.test/internal/jobs", { method: "POST" }),
        "true"
      )
    ).toBeNull();
  });
});
