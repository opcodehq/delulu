import { AgentWorkspaceService, MaintenanceScheduler } from "@delulu/services";
import { Effect, type Layer } from "effect";

/** Agent expiry recovery only; publishing and lifecycle use JobExecutor. */
export const runMaintenance = (
  layer: Layer.Layer<AgentWorkspaceService | MaintenanceScheduler>
): Promise<void> =>
  Effect.gen(function* () {
    const scheduler = yield* MaintenanceScheduler;
    const agents = yield* AgentWorkspaceService;
    const jobKey = "agent-runtime-maintenance";
    if (!(yield* scheduler.claim({ jobKey }))) {
      return;
    }
    const result = yield* agents.runMaintenance().pipe(Effect.exit);
    if (result._tag === "Success") {
      yield* scheduler.complete({ jobKey, intervalSeconds: 30 });
    } else {
      yield* scheduler.fail({ jobKey });
      yield* Effect.logError("Agent maintenance failed", {
        cause: result.cause,
      });
    }
  }).pipe(Effect.provide(layer), Effect.runPromise);

/** Block even GET callbacks during cutover; the transfer route authenticates itself. */
export function maintenanceResponse(
  request: Request,
  flag: string | undefined
): Response | null {
  if (flag !== "true" || new URL(request.url).pathname === "/internal/jobs") {
    return null;
  }
  return Response.json(
    {
      error: "maintenance",
      message:
        "The API is temporarily paused for maintenance. Please retry shortly.",
    },
    {
      status: 503,
      headers: { "retry-after": "60", "cache-control": "no-store" },
    }
  );
}
