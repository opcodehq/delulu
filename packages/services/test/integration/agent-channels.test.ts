import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { expect, it } from "vitest";
import {
  reserveChannelTurn,
  settleChannelTurn,
} from "../../src/agent-channel-budget";
import { AgentChannelService } from "../../src/agent-channels";
import {
  listInstructionSkills,
  saveInstructionSkill,
} from "../../src/agent-knowledge";
import { IdentityService } from "../../src/identity";

const Pg = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: false,
});
const App = Layer.mergeAll(
  AgentChannelService.layer,
  IdentityService.layer
).pipe(Layer.provideMerge(Pg));

it("requires beta membership, connects idempotently, and revokes access without trusting usernames", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const identities = yield* IdentityService;
      const channels = yield* AgentChannelService;
      const sql = yield* SqlClient.SqlClient;
      const user = yield* identities.resolve({
        sub: `channel-${crypto.randomUUID()}`,
        email: `channel-${crypto.randomUUID()}@example.test`,
      });
      const workspaceId = user.personalWorkspace!.id;
      const email = user.user.email!;
      expect(yield* channels.eligible(user.user.id)).toEqual([]);
      yield* sql`INSERT INTO agent_beta_invites (user_id) VALUES (${user.user.id})`;
      expect(
        (yield* channels.eligible(user.user.id)).map((w) => w.workspaceId)
      ).toContain(workspaceId);
      const address = {
        environment: "test",
        channel: "telegram" as const,
        providerAccountId: "42",
        providerUserId: crypto.randomUUID(),
      };
      const input = {
        ...address,
        userId: user.user.id,
        workspaceId,
        verifiedEmail: ` ${email.toUpperCase()} `,
        generation: "generation-1",
      };
      const first = yield* channels.connect(input);
      expect(first.verifiedEmail).toBe(email.toLowerCase());
      expect(
        (yield* channels
          .connect({ ...input, verifiedEmail: "other@example.test" })
          .pipe(Effect.result))._tag
      ).toBe("Failure");
      expect(yield* channels.connect(input)).toEqual(first);
      expect(yield* channels.resolve(address)).toEqual(first);
      expect(
        (yield* channels
          .connect({ ...input, generation: "different" })
          .pipe(Effect.result))._tag
      ).toBe("Failure");
      yield* sql`UPDATE agent_beta_invites SET revoked_at = now() WHERE user_id = ${user.user.id}`;
      expect((yield* channels.resolve(address).pipe(Effect.result))._tag).toBe(
        "Failure"
      );
      yield* channels.disconnect(address, user.user.id);
      expect(yield* channels.resolve(address)).toBeNull();
    }).pipe(Effect.provide(App))
  );
});

it("shares admission across channel connections and versions custom skills", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const identities = yield* IdentityService;
      const channels = yield* AgentChannelService;
      const sql = yield* SqlClient.SqlClient;
      const user = yield* identities.resolve({
        sub: `channel-budget-${crypto.randomUUID()}`,
        email: `budget-${crypto.randomUUID()}@example.test`,
      });
      const workspaceId = user.personalWorkspace!.id;
      yield* sql`INSERT INTO agent_beta_invites (user_id) VALUES (${user.user.id})`;
      const principal = yield* channels.connect({
        environment: "test",
        channel: "telegram",
        providerAccountId: "42",
        providerUserId: crypto.randomUUID(),
        userId: user.user.id,
        workspaceId,
        verifiedEmail: user.user.email!,
        generation: "one",
      });
      const ids = [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ];
      yield* reserveChannelTurn(principal, ids[0]!);
      yield* reserveChannelTurn(principal, ids[0]!);
      yield* reserveChannelTurn(principal, ids[1]!);
      expect(
        (yield* reserveChannelTurn(principal, ids[2]!).pipe(Effect.result))._tag
      ).toBe("Failure");
      yield* sql`UPDATE agent_channel_turns SET expires_at = now() - interval '1 minute' WHERE id = ${ids[0]!}`;
      yield* reserveChannelTurn(principal, ids[2]!);
      const expired = yield* sql<{
        state: string;
      }>`SELECT state FROM agent_channel_turns WHERE id = ${ids[0]!}`;
      expect(expired[0]?.state).toBe("unknown");
      const actualUsage = {
        provider: "test",
        model: "test",
        costMicros: 1000,
        inputTokens: 20,
        outputTokens: 10,
        cachedInputTokens: 0,
      };
      yield* settleChannelTurn(ids[0]!, actualUsage);
      yield* settleChannelTurn(ids[0]!, actualUsage);
      const releases = yield* sql<{
        count: string;
      }>`SELECT count(*)::text AS count FROM agent_usage_ledger WHERE idempotency_key = ${`channel:${ids[0]!}:release`}`;
      expect(releases[0]?.count).toBe("1");
      yield* reserveChannelTurn(principal, ids[2]!);
      const skill = yield* saveInstructionSkill(user.user.id, workspaceId, {
        title: "Concise",
        instructions: "Use short sentences.",
        enabled: true,
      });
      const edited = yield* saveInstructionSkill(user.user.id, workspaceId, {
        ...skill,
        instructions: "Use short sentences and concrete examples.",
      });
      expect(edited.revision).toBe(2);
      expect(
        (yield* saveInstructionSkill(user.user.id, workspaceId, skill).pipe(
          Effect.result
        ))._tag
      ).toBe("Failure");
      expect(
        (yield* listInstructionSkills(user.user.id, workspaceId)).find(
          (s) => s.id === edited.id
        )?.instructions
      ).toBe("Use short sentences and concrete examples.");
    }).pipe(Effect.provide(App))
  );
});
