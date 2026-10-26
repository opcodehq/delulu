import { codexRequest } from "@delulu/services";
import { Schema } from "effect";
import type { Env } from "./env";

export const codexConfig = (env: Env) => ({
  enabled: env.CODEX_RUNTIME_ENABLED === "true",
  url: env.CODEX_RUNTIME_URL,
  secret: env.CODEX_RUNTIME_SECRET,
});
const Action = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  summary: Schema.String,
  risk: Schema.Literals(["low", "consequential"]),
});
const Usage = Schema.Struct({
  provider: Schema.String,
  model: Schema.String,
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cachedInputTokens: Schema.Number,
  costMicros: Schema.Number,
});
export const CodexJob = Schema.Struct({
  id: Schema.String,
  state: Schema.Literals([
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
  ]),
  events: Schema.Array(
    Schema.Struct({
      sequence: Schema.Number,
      response: Schema.Struct({
        text: Schema.String,
        actions: Schema.optional(Schema.Array(Action)),
        usage: Schema.optional(Usage),
      }),
    })
  ),
  request: Schema.NullOr(
    Schema.Struct({ id: Schema.String, kind: Schema.Literal("context") })
  ),
});
export const ContentActionInput = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("remember"),
    workspaceId: Schema.String,
    value: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal("forget_memory"),
    workspaceId: Schema.String,
    memoryId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("create_draft"),
    workspaceId: Schema.String,
    value: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal("update_draft"),
    workspaceId: Schema.String,
    postId: Schema.String,
    value: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal("schedule"),
    workspaceId: Schema.String,
    postId: Schema.String,
    value: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal("publish"),
    workspaceId: Schema.String,
    postId: Schema.String,
  }),
]);
export const codexCall = (
  env: Env,
  userId: string,
  operation: string,
  input?: unknown
) => codexRequest(codexConfig(env), userId, operation, input);
