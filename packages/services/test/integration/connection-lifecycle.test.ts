import { makeTokenCipher, TokenCipher } from "@delulu/core";
import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect, it } from "vitest";
import {
  AutomationKvNamespace,
  AutomationKvService,
} from "../../src/automation-kv";
import { AutomationSessionService } from "../../src/automation-sessions";
import { AutomationService } from "../../src/automations";
import {
  ConnectionStateConfig,
  ConnectionStateService,
  ConnectionsService,
} from "../../src/connections";
import { IdentityService } from "../../src/identity";
import { JobService } from "../../src/jobs";
import { LifecycleService } from "../../src/lifecycle";

const Pg = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: true,
});

const makeLayer = (cacheMode: "warm" | "cold" | "outage" = "warm") => {
  const cache = new Map<string, string>();
  const Namespace = Layer.succeed(
    AutomationKvNamespace,
    AutomationKvNamespace.of({
      get: async (key) => {
        if (cacheMode === "outage") {
          throw new Error("KV unavailable");
        }
        return cacheMode === "warm" ? (cache.get(key) ?? null) : null;
      },
      put: async (key, value) => {
        cache.set(key, value);
      },
      delete: async (key) => {
        cache.delete(key);
      },
    })
  );
  const Kv = AutomationKvService.layer.pipe(Layer.provide(Namespace));
  const Jobs = Layer.succeed(
    JobService,
    JobService.of({
      enqueue: () => Effect.succeed("test"),
      cancel: () => Effect.void,
    })
  );
  const State = ConnectionStateService.layer.pipe(
    Layer.provide(
      Layer.succeed(
        ConnectionStateConfig,
        ConnectionStateConfig.of({ secret: "lifecycle-test-state" })
      )
    )
  );
  const Connections = ConnectionsService.layer.pipe(
    Layer.provide([
      State,
      Namespace,
      Layer.succeed(
        TokenCipher,
        TokenCipher.of(makeTokenCipher("lifecycle-test-secret"))
      ),
      Layer.succeed(
        LifecycleService,
        LifecycleService.of({
          record: () => Effect.void,
          syncWorkspace: () => Effect.void,
          runScheduled: () => Effect.succeed(null),
        })
      ),
    ])
  );
  return Layer.mergeAll(
    IdentityService.layer,
    Connections,
    Kv,
    AutomationService.layer.pipe(Layer.provide([Kv, Jobs])),
    AutomationSessionService.layer.pipe(Layer.provide(Kv))
  ).pipe(Layer.provideMerge(Pg));
};

const seed = Effect.gen(function* () {
  const identity = yield* IdentityService;
  const connections = yield* ConnectionsService;
  const owner = yield* identity.resolve({ sub: crypto.randomUUID() });
  const workspaceId = owner.personalWorkspace!.id;
  const profileId = crypto.randomUUID();
  const credentials = {
    socialType: "INSTAGRAM" as const,
    profileId,
    accessToken: "provider-token",
  };
  yield* connections.upsertFromOAuth(workspaceId, credentials);
  const connectionId = (yield* connections.list(workspaceId, 10, 0)).data[0]!
    .id;
  return { workspaceId, profileId, connectionId, credentials };
});

const seedAutomation = Effect.gen(function* () {
  const account = yield* seed;
  const automations = yield* AutomationService;
  const sessions = yield* AutomationSessionService;
  const created = [];
  for (const targetMode of ["specific", "all"] as const) {
    created.push(
      yield* automations.create(account.workspaceId, {
        connectionId: account.connectionId,
        platform: "instagram",
        category: "comment",
        name: "Disconnect lifecycle",
        triggers: [
          {
            id: "trigger",
            type: "trigger",
            triggerType: "comment",
            targetMode,
            targetPostIds: targetMode === "specific" ? ["media"] : [],
          },
        ],
        steps: [],
      })
    );
  }
  const session = yield* sessions.start({
    workspaceId: account.workspaceId,
    automationId: created[0]!.id,
    profileId: account.profileId,
    platformUserId: "recipient",
    platformUsername: null,
    currentStepId: "step",
    triggerEventId: "event",
    triggerMediaId: "media",
  });
  return { ...account, session };
});

const cacheModes = ["warm", "cold", "outage"] as const;
describe.each(cacheModes)("%s KV", (cacheMode) => {
  it("blocks specific and all-post triggers", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const account = yield* seedAutomation;
        const automations = yield* AutomationService;
        const connections = yield* ConnectionsService;
        expect(
          yield* automations.findForTrigger(account.profileId, "media")
        ).toHaveLength(2);
        yield* connections.remove(account.workspaceId, account.connectionId);
        expect(
          yield* automations.findForTrigger(account.profileId, "media")
        ).toEqual([]);
        yield* connections.upsertFromOAuth(
          account.workspaceId,
          account.credentials
        );
        expect(
          yield* automations.findForTrigger(account.profileId, "media")
        ).toHaveLength(2);
      }).pipe(Effect.provide(makeLayer(cacheMode)))
    );
  });

  it("blocks existing sessions", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const account = yield* seedAutomation;
        const sessions = yield* AutomationSessionService;
        const connections = yield* ConnectionsService;
        expect(
          (yield* sessions.findActive(account.profileId, "recipient"))?.id
        ).toBe(account.session.id);
        yield* connections.remove(account.workspaceId, account.connectionId);
        expect(
          yield* sessions.findActive(account.profileId, "recipient")
        ).toBeNull();
        yield* connections.upsertFromOAuth(
          account.workspaceId,
          account.credentials
        );
        expect(
          (yield* sessions.findActive(account.profileId, "recipient"))?.id
        ).toBe(account.session.id);
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE automations SET enabled = false WHERE id = ${account.session.automationId}`;
        expect(
          yield* sessions.findActive(account.profileId, "recipient")
        ).toBeNull();
      }).pipe(Effect.provide(makeLayer(cacheMode)))
    );
  });
});

describe("connection transfer lifecycle", () => {
  it("rejects stale session keys and old-workspace automations", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const account = yield* seedAutomation;
        const sessions = yield* AutomationSessionService;
        const kv = yield* AutomationKvService;
        const automations = yield* AutomationService;
        const connections = yield* ConnectionsService;
        const identity = yield* IdentityService;
        for (const [profileId, platformUserId] of [
          ["other-profile", "recipient"],
          [account.profileId, "other-recipient"],
        ]) {
          yield* kv.putSession({
            profileId,
            platformUserId,
            automationId: account.session.automationId,
            sessionId: account.session.id,
          });
          expect(
            yield* sessions.findActive(profileId, platformUserId)
          ).toBeNull();
        }
        const destination = yield* identity.resolve({
          sub: crypto.randomUUID(),
        });
        yield* connections.confirmTransfer({
          connectionId: account.connectionId,
          sourceWorkspaceId: account.workspaceId,
          destinationWorkspaceId: destination.personalWorkspace!.id,
        });
        expect(
          yield* sessions.findActive(account.profileId, "recipient")
        ).toBeNull();
        expect(
          yield* automations.findForTrigger(account.profileId, "media")
        ).toEqual([]);
      }).pipe(Effect.provide(makeLayer()))
    );
  });

  const methods = ["oauth", "direct"] as const;
  it.each(methods)("%s rejects cleared tokens", async (method) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const account = yield* seed;
        const identity = yield* IdentityService;
        const connections = yield* ConnectionsService;
        const sql = yield* SqlClient.SqlClient;
        const destination = yield* identity.resolve({
          sub: crypto.randomUUID(),
        });
        const destinationWorkspaceId = destination.personalWorkspace!.id;
        const auth = {
          userId: destination.user.id,
          credential: "session" as const,
          scopes: "full" as const,
        };
        const authorize = () =>
          connections.upsertFromOAuth(
            destinationWorkspaceId,
            account.credentials,
            `u:${destination.user.id}`
          );
        const grant = yield* authorize();
        if (!(grant.status === "transfer_required" && grant.transferToken)) {
          throw new Error("Expected a pending transfer grant");
        }
        yield* connections.remove(account.workspaceId, account.connectionId);
        const rejected = yield* (
          method === "oauth"
            ? connections.confirmOAuthTransfer({
                connectionId: account.connectionId,
                destinationWorkspaceId,
                auth,
                transferToken: grant.transferToken,
              })
            : connections.confirmTransfer({
                connectionId: account.connectionId,
                sourceWorkspaceId: account.workspaceId,
                destinationWorkspaceId,
              })
        ).pipe(Effect.result);
        expect(rejected).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "ConflictError" },
        });
        const rows = yield* sql<{
          workspaceId: string;
          accessToken: string;
          disconnectedAt: Date | null;
        }>`
        SELECT workspace_id, access_token, disconnected_at FROM connections WHERE id = ${account.connectionId}`;
        expect(rows[0]).toMatchObject({
          workspaceId: account.workspaceId,
          accessToken: "",
        });
        expect(rows[0]?.disconnectedAt).toBeInstanceOf(Date);
        expect(
          (yield* connections.list(destinationWorkspaceId, 10, 0)).total
        ).toBe(0);
        const missing = yield* connections
          .confirmTransfer({
            connectionId: "missing",
            sourceWorkspaceId: account.workspaceId,
            destinationWorkspaceId,
          })
          .pipe(Effect.result);
        expect(missing).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "NotFoundError" },
        });
        const fresh = yield* authorize();
        if (!(fresh.status === "transfer_required" && fresh.transferToken)) {
          throw new Error("Expected a fresh transfer grant");
        }
        yield* connections.confirmOAuthTransfer({
          connectionId: account.connectionId,
          destinationWorkspaceId,
          auth,
          transferToken: fresh.transferToken,
        });
        expect(
          (yield* connections.list(destinationWorkspaceId, 10, 0)).data[0]?.id
        ).toBe(account.connectionId);
      }).pipe(Effect.provide(makeLayer()))
    );
  });
});
