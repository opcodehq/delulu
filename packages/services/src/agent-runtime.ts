import { ProviderUnavailableError } from "@delulu/contracts";
import { Context, Effect, Layer } from "effect";

export interface AgentRuntimeUsage {
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: number;
}

export interface AgentRuntimeAction {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly risk: "low" | "consequential";
}

export type AgentMemoryCategory =
  | "voice"
  | "audience"
  | "goal"
  | "preference"
  | "rejected_pattern"
  | "platform_insight"
  | "brand_fact";

export interface AgentRuntimeMemoryProposal {
  readonly category: AgentMemoryCategory;
  readonly value: unknown;
  readonly provenance: string;
  readonly confidence: number;
  readonly requiresConfirmation?: boolean;
}

export interface AgentRuntimeResponse {
  readonly text: string;
  readonly usage?: AgentRuntimeUsage;
  readonly actions?: readonly AgentRuntimeAction[];
  readonly memoryProposals?: readonly AgentRuntimeMemoryProposal[];
}

export interface AgentRuntimeResponseTarget {
  readonly onGadgetResponse: (response: AgentRuntimeResponse) => Promise<void>;
}

export interface SubmitExternalAgentMessageInput {
  readonly correlationId: string;
  readonly callerEmail: string;
  readonly displayName: string;
  readonly gadgetKey: string;
  readonly chatKey: string;
  readonly messageKey: string;
  readonly gadgetTitle: string;
  readonly prompt: string;
  readonly responseTarget: AgentRuntimeResponseTarget;
}

export type SubmitExternalAgentMessageResult =
  | { readonly accepted: true; readonly chatPath: string }
  | { readonly accepted: false; readonly message: string };

export type AgentApprovalDecision = "approved" | "rejected";

export class AgentRuntimeProvider extends Context.Service<
  AgentRuntimeProvider,
  {
    readonly configured: boolean;
    readonly ensureExternalUser: (input: {
      readonly email: string;
      readonly displayName: string;
    }) => Effect.Effect<void, ProviderUnavailableError>;
    readonly submitExternalMessage: (
      input: SubmitExternalAgentMessageInput
    ) => Effect.Effect<
      SubmitExternalAgentMessageResult,
      ProviderUnavailableError
    >;
    readonly interruptExternalRun: (input: {
      readonly callerEmail: string;
      readonly gadgetKey: string;
      readonly chatKey: string;
      readonly messageKey: string;
    }) => Effect.Effect<void, ProviderUnavailableError>;
    readonly resolveExternalAction: (input: {
      readonly callerEmail: string;
      readonly gadgetKey: string;
      readonly actionId: string;
      readonly decision: AgentApprovalDecision;
    }) => Effect.Effect<void, ProviderUnavailableError>;
  }
>()("@delulu/services/AgentRuntimeProvider") {
  static memoryLayer(input?: {
    readonly response?: AgentRuntimeResponse;
    readonly onActionResolved?: (input: {
      readonly actionId: string;
      readonly decision: AgentApprovalDecision;
    }) => void;
  }) {
    const users = new Set<string>();
    const messages = new Map<string, SubmitExternalAgentMessageResult>();
    const unavailable = (message: string) =>
      new ProviderUnavailableError({
        message,
        provider: "agent-runtime",
        retryable: false,
      });

    return Layer.succeed(
      AgentRuntimeProvider,
      AgentRuntimeProvider.of({
        configured: true,
        ensureExternalUser: ({ email }) =>
          Effect.sync(() => {
            users.add(email.toLowerCase());
          }),
        submitExternalMessage: Effect.fn(
          "AgentRuntimeProvider.memory.submitExternalMessage"
        )(function* (message) {
          if (!users.has(message.callerEmail.toLowerCase())) {
            return yield* unavailable("Agent runtime user is not provisioned");
          }
          const existing = messages.get(message.messageKey);
          if (existing) {
            return existing;
          }
          const result = {
            accepted: true as const,
            chatPath: `/workspace/${encodeURIComponent(message.gadgetKey)}/chat/${encodeURIComponent(message.chatKey)}`,
          };
          messages.set(message.messageKey, result);
          yield* Effect.tryPromise({
            try: () =>
              message.responseTarget.onGadgetResponse({
                text: input?.response?.text ?? "Done.",
                usage: input?.response?.usage,
                actions: input?.response?.actions,
                memoryProposals: input?.response?.memoryProposals,
              }),
            catch: () => unavailable("Agent response callback failed"),
          });
          return result;
        }),
        interruptExternalRun: () => Effect.void,
        resolveExternalAction: ({ actionId, decision }) =>
          Effect.sync(() => input?.onActionResolved?.({ actionId, decision })),
      })
    );
  }
}

export const agentMemoryRequiresConfirmation = (proposal: {
  readonly category: AgentMemoryCategory;
  readonly confidence: number;
  readonly requiresConfirmation?: boolean;
}): boolean =>
  proposal.requiresConfirmation !== false ||
  proposal.category !== "preference" ||
  proposal.confidence < 0.8;

export const deriveAgentRoute = (input: {
  readonly workspaceId: string;
  readonly channel: "external" | "web" | "ritual";
  readonly adapterId?: string;
  readonly connectionId?: string;
  readonly conversationId?: string;
  readonly threadId?: string;
  readonly ritualId?: string;
}) => {
  const gadgetKey = `workspace:${input.workspaceId}`;
  switch (input.channel) {
    case "external":
      if (!(input.adapterId && input.connectionId && input.conversationId)) {
        throw new Error(
          "External routing requires adapter, connection, and conversation IDs"
        );
      }
      return {
        gadgetKey,
        chatKey: `external:${input.adapterId}:${input.connectionId}:${input.conversationId}`,
      };
    case "web":
      if (!input.threadId) {
        throw new Error("Web routing requires a thread ID");
      }
      return { gadgetKey, chatKey: `web:${input.threadId}` };
    case "ritual":
      if (!input.ritualId) {
        throw new Error("Ritual routing requires a ritual ID");
      }
      return { gadgetKey, chatKey: `ritual:${input.ritualId}` };
    default:
      throw new Error("Unsupported agent channel");
  }
};

const APPROVAL_COMMAND = /^(APPROVE|REJECT)\s+([A-Z0-9][A-Z0-9-]{2,31})$/i;

export const parseAgentApprovalCommand = (
  input: string
): {
  readonly decision: AgentApprovalDecision;
  readonly code: string;
} | null => {
  const match = APPROVAL_COMMAND.exec(input.trim());
  if (!match) {
    return null;
  }
  return {
    decision: match[1]?.toUpperCase() === "APPROVE" ? "approved" : "rejected",
    code: match[2]!.toUpperCase(),
  };
};
