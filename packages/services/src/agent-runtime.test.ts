import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  AgentRuntimeProvider,
  agentMemoryRequiresConfirmation,
  deriveAgentRoute,
  parseAgentApprovalCommand,
} from "./agent-runtime";

describe("agent runtime protocol", () => {
  it("derives stable, channel-scoped workspace and chat keys", () => {
    expect(
      deriveAgentRoute({
        workspaceId: "workspace_123",
        channel: "external",
        adapterId: "channel-adapter",
        connectionId: "channel_456",
        conversationId: "conversation_789",
      })
    ).toEqual({
      gadgetKey: "workspace:workspace_123",
      chatKey: "external:channel-adapter:channel_456:conversation_789",
    });
  });

  it.each([
    ["APPROVE Blue-7", { decision: "approved", code: "BLUE-7" }],
    [" reject blue-7 ", { decision: "rejected", code: "BLUE-7" }],
    ["approve", null],
    ["/write publish this", null],
  ])("parses explicit approval commands: %s", (input, expected) => {
    expect(parseAgentApprovalCommand(input)).toEqual(expected);
  });

  it("deduplicates external submissions and delivers one callback", async () => {
    const replies: string[] = [];
    const program = Effect.gen(function* () {
      const runtime = yield* AgentRuntimeProvider;
      const input = {
        correlationId: "agent_run_123",
        callerEmail: "owner@example.com",
        displayName: "Owner",
        gadgetKey: "workspace:workspace_123",
        chatKey: "external:channel-adapter:channel_456:conversation_789",
        messageKey: "message_123",
        gadgetTitle: "Content HQ",
        prompt: "Draft a launch post",
        responseTarget: {
          onGadgetResponse: (response: { text: string }) => {
            replies.push(response.text);
            return Promise.resolve();
          },
        },
      };

      yield* runtime.ensureExternalUser({
        email: input.callerEmail,
        displayName: input.displayName,
      });
      const first = yield* runtime.submitExternalMessage(input);
      const duplicate = yield* runtime.submitExternalMessage(input);
      return { first, duplicate };
    }).pipe(
      Effect.provide(
        AgentRuntimeProvider.memoryLayer({ response: { text: "Draft ready" } })
      )
    );

    await expect(Effect.runPromise(program)).resolves.toEqual({
      first: {
        accepted: true,
        chatPath:
          "/workspace/workspace%3Aworkspace_123/chat/external%3Achannel-adapter%3Achannel_456%3Aconversation_789",
      },
      duplicate: {
        accepted: true,
        chatPath:
          "/workspace/workspace%3Aworkspace_123/chat/external%3Achannel-adapter%3Achannel_456%3Aconversation_789",
      },
    });
    expect(replies).toEqual(["Draft ready"]);
  });

  it("only auto-applies high-confidence low-risk writing preferences", () => {
    expect(
      agentMemoryRequiresConfirmation({
        category: "preference",
        confidence: 0.92,
        requiresConfirmation: false,
      })
    ).toBe(false);
    expect(
      agentMemoryRequiresConfirmation({
        category: "brand_fact",
        confidence: 0.99,
        requiresConfirmation: false,
      })
    ).toBe(true);
    expect(
      agentMemoryRequiresConfirmation({
        category: "preference",
        confidence: 0.5,
        requiresConfirmation: false,
      })
    ).toBe(true);
  });
});
