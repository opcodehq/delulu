import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

export interface MaintenanceClaimInput {
  readonly jobKey: string;
  readonly leaseSeconds?: number;
}

export interface MaintenanceCompletionInput {
  readonly jobKey: string;
  readonly intervalSeconds: number;
}

export interface MaintenanceFailureInput {
  readonly jobKey: string;
  readonly retrySeconds?: number;
}

/** Coordinates periodic work across Worker invocations and Node replicas. */
export class MaintenanceScheduler extends Context.Service<
  MaintenanceScheduler,
  {
    readonly claim: (input: MaintenanceClaimInput) => Effect.Effect<boolean>;
    readonly complete: (
      input: MaintenanceCompletionInput
    ) => Effect.Effect<void>;
    readonly fail: (input: MaintenanceFailureInput) => Effect.Effect<void>;
  }
>()("@delulu/services/MaintenanceScheduler") {
  static readonly layer = Layer.effect(
    MaintenanceScheduler,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const claim = Effect.fn("MaintenanceScheduler.claim")(function* (
        input: MaintenanceClaimInput
      ) {
        const leaseSeconds = input.leaseSeconds ?? 300;
        const rows = yield* sql<{ jobKey: string }>`
          INSERT INTO maintenance_schedules
            (job_key, next_run_at, locked_until, last_started_at)
          VALUES (${input.jobKey}, now(),
            now() + (${leaseSeconds} * interval '1 second'), now())
          ON CONFLICT (job_key) DO UPDATE SET
            locked_until = now() + (${leaseSeconds} * interval '1 second'),
            last_started_at = now()
          WHERE maintenance_schedules.next_run_at <= now()
            AND (maintenance_schedules.locked_until IS NULL
              OR maintenance_schedules.locked_until <= now())
          RETURNING job_key`.pipe(Effect.orDie);
        return rows.length > 0;
      });

      const complete = Effect.fn("MaintenanceScheduler.complete")(function* (
        input: MaintenanceCompletionInput
      ) {
        yield* sql`UPDATE maintenance_schedules SET
            next_run_at = now() + (${input.intervalSeconds} * interval '1 second'),
            locked_until = NULL,
            last_completed_at = now()
            WHERE job_key = ${input.jobKey}`.pipe(Effect.orDie);
      });

      const fail = Effect.fn("MaintenanceScheduler.fail")(function* (
        input: MaintenanceFailureInput
      ) {
        const retrySeconds = input.retrySeconds ?? 300;
        yield* sql`UPDATE maintenance_schedules SET
          next_run_at = now() + (${retrySeconds} * interval '1 second'),
          locked_until = NULL,
          last_failed_at = now()
          WHERE job_key = ${input.jobKey}`.pipe(Effect.orDie);
      });

      return MaintenanceScheduler.of({ claim, complete, fail });
    })
  );
}
