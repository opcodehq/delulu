import { makeTokenCipher, TokenCipher } from "@delulu/core";
import { PgClient } from "@effect/sql-pg";
import { Effect, String as EffectString, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect, it } from "vitest";
import { AgentRuntimeProvider } from "../../src/agent-runtime";
import { AgentWorkspaceService } from "../../src/agent-workspaces";
import { IdentityService } from "../../src/identity";

const APPROVAL_REPLY = /Reply APPROVE ([A-Z0-9]+-[A-Z0-9]+) or REJECT/u;
const APPROVAL_CODE = /^[A-Z0-9]+-[A-Z0-9]+$/u;

const Pg = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://delulu:delulu@localhost:5432/delulu"
  ),
  transformQueryNames: EffectString.camelToSnake,
  transformResultNames: EffectString.snakeToCamel,
  transformJson: false,
});

const TestCipher = Layer.succeed(
  TokenCipher,
  TokenCipher.of(makeTokenCipher("agent-channel-integration-secret"))
);
describe("AgentWorkspaceService", () => {
  it("atomically reserves budget across concurrent agent runs", async () => {
    const resolutions: Array<{ actionId: string; decision: string }> = [];
    const Runtime = Layer.succeed(
      AgentRuntimeProvider,
      AgentRuntimeProvider.of({
        configured: true,
        ensureExternalUser: () => Effect.void,
        submitExternalMessage: () =>
          Effect.succeed({ accepted: true, chatPath: "/test/chat" }),
        interruptExternalRun: () => Effect.void,
        resolveExternalAction: ({ actionId, decision }) =>
          Effect.sync(() => resolutions.push({ actionId, decision })),
      })
    );
    const AgentWorkspaces = AgentWorkspaceService.layer.pipe(
      Layer.provide([Runtime, Pg, TestCipher])
    );
    const App = Layer.mergeAll(
      IdentityService.layer,
      Runtime,
      AgentWorkspaces,
      TestCipher
    ).pipe(Layer.provideMerge(Pg));

    const outcomes = await Effect.runPromise(
      Effect.gen(function* () {
        const identity = yield* IdentityService;
        const agents = yield* AgentWorkspaceService;
        const sql = yield* SqlClient.SqlClient;
        const resolved = yield* identity.resolve({
          sub: `agent-budget-${crypto.randomUUID()}`,
        });
        const workspaceId = resolved.personalWorkspace?.id;
        if (!workspaceId) {
          return yield* Effect.die("missing workspace");
        }
        const userId = resolved.user.id;
        yield* sql`UPDATE users SET email = ${`agent-${crypto.randomUUID()}@example.test`}
          WHERE id = ${userId}`;
        const workspace = yield* agents.create({ workspaceId, userId });
        yield* sql`UPDATE agent_workspaces SET daily_budget_micros = 1000000,
          monthly_budget_micros = 1000000, max_concurrent_runs = 10
          WHERE id = ${workspace.id}`;

        const outcomes = yield* Effect.forEach(
          Array.from({ length: 6 }, (_, index) => index),
          (index) =>
            agents
              .run({
                workspaceId,
                userId,
                billingOwnerUserId: userId,
                message: `Concurrent request ${index}`,
                idempotencyKey: `budget-${crypto.randomUUID()}`,
                source: "web",
                threadId: `thread-${index}`,
              })
              .pipe(Effect.result),
          { concurrency: "unbounded" }
        );
        const successfulRun = outcomes.find(
          (outcome) => outcome._tag === "Success"
        );
        if (!successfulRun || successfulRun._tag !== "Success") {
          return yield* Effect.die("missing successful run");
        }
        const response = {
          text: "Draft ready.",
          actions: [
            {
              id: `action-${crypto.randomUUID()}`,
              kind: "publish",
              summary: "Publish the draft",
              risk: "consequential" as const,
            },
          ],
        };
        const firstCallback = yield* agents.completeExternalResponse({
          runId: successfulRun.success.id,
          response,
        });
        const replayCallback = yield* agents.completeExternalResponse({
          runId: successfulRun.success.id,
          response,
        });
        const approvalCode = firstCallback.replyText.match(APPROVAL_REPLY)?.[1];
        if (!approvalCode) {
          return yield* Effect.die("missing approval code");
        }
        const pendingApprovals = yield* agents.listApprovals(
          workspaceId,
          userId,
          successfulRun.success.id
        );
        const approval = yield* agents.resolveApproval({
          workspaceId,
          userId,
          runId: successfulRun.success.id,
          senderAddress: `web:${userId}`,
          code: approvalCode,
          decision: "approved",
        });
        const resolvedRun = yield* agents.getRun(
          workspaceId,
          userId,
          successfulRun.success.id
        );
        const stored = yield* sql<{
          output: string;
          approvalDeliveryCiphertext: string | null;
        }>`SELECT output, approval_delivery_ciphertext
          FROM agent_runs WHERE id = ${successfulRun.success.id}`;
        return {
          outcomes,
          firstCallback,
          replayCallback,
          approval,
          pendingApprovals,
          resolvedRun,
          stored: stored[0]!,
        };
      }).pipe(Effect.provide(App))
    );

    expect(
      outcomes.outcomes.filter((outcome) => outcome._tag === "Success")
    ).toHaveLength(2);
    expect(
      outcomes.outcomes.filter((outcome) => outcome._tag === "Failure")
    ).toHaveLength(4);
    expect(outcomes.firstCallback.replyText).toContain("APPROVE");
    expect(outcomes.replayCallback.replyText).toBe(
      outcomes.firstCallback.replyText
    );
    expect(outcomes.stored.output).toBe("Draft ready.");
    expect(outcomes.stored.approvalDeliveryCiphertext).not.toContain("APPROVE");
    expect(outcomes.pendingApprovals).toMatchObject([
      {
        runId: expect.any(String),
        summary: "Publish the draft",
        code: expect.stringMatching(APPROVAL_CODE),
      },
    ]);
    expect(outcomes.approval.message).toContain("Approved and applied");
    expect(outcomes.resolvedRun.status).toBe("completed");
    expect(resolutions).toEqual([
      { actionId: expect.any(String), decision: "approved" },
    ]);
  });
});
