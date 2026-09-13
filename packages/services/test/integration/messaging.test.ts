import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { beforeAll, describe, expect, it } from "vitest";
import { JobService } from "../../src/jobs";
import {
  LifecycleProvider,
  MessagingService,
  TransactionalEmailProvider,
} from "../../src/messaging";

const Pg = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: true,
});

let AppLayer: Layer.Layer<MessagingService | PgClient.PgClient>;

beforeAll(() => {
  const Providers = Layer.mergeAll(
    Layer.succeed(
      LifecycleProvider,
      LifecycleProvider.of({
        name: "noop",
        identify: () => Effect.void,
        track: () => Effect.void,
      })
    ),
    Layer.succeed(
      TransactionalEmailProvider,
      TransactionalEmailProvider.of({
        name: "noop",
        send: () => Effect.succeed({}),
      })
    )
  );
  const Jobs = Layer.succeed(JobService, {
    enqueue: () => Effect.succeed("test-message-job"),
    cancel: () => Effect.void,
  });
  const Messaging = MessagingService.layer.pipe(
    Layer.provide([Providers, Jobs])
  );
  AppLayer = Messaging.pipe(Layer.provideMerge(Pg));
});

const createUser = Effect.fn("test.createMessagingUser")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const id = `messaging_${crypto.randomUUID()}`;
  yield* sql`INSERT INTO users (id, external_id, email)
    VALUES (${id}, ${`external_${id}`}, ${`${id}@example.test`})`;
  return id;
});

describe("MessagingService", () => {
  it("does not persist suppressed payloads and reports transactional work as queued", async () => {
    const program = Effect.gen(function* () {
      const messaging = yield* MessagingService;
      const sql = yield* SqlClient.SqlClient;
      const userId = yield* createUser();
      yield* sql`INSERT INTO email_preferences
        (user_id, product_lifecycle_enabled)
        VALUES (${userId}, false)`;

      yield* messaging.track({
        userId,
        email: `${userId}@example.test`,
        event: "weekly_usage_digest",
        idempotencyKey: `suppressed:${userId}`,
      });
      const queued = yield* messaging.sendTransactional({
        userId,
        email: `${userId}@example.test`,
        messageType: "receipt",
        subject: "Receipt",
        html: "<p>Receipt</p>",
        text: "Receipt",
        idempotencyKey: `transactional:${userId}`,
      });
      const rows = yield* sql<{
        idempotencyKey: string;
        status: string;
      }>`SELECT idempotency_key, status FROM message_deliveries
        WHERE user_id = ${userId} ORDER BY idempotency_key`;
      return { queued, rows };
    });

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(AppLayer))
    );

    expect(result.queued).toEqual({ status: "queued" });
    expect(result.rows).toEqual([
      {
        idempotencyKey: expect.stringContaining("transactional:"),
        status: "queued",
      },
    ]);
  });
});
