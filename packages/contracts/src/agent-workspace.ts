import {
  AgentComputerState,
  AgentNetworkPolicy,
  AgentTaskStatus,
  WorkspaceFileSource,
  WorkspaceFileStatus,
  WorkspaceFileVisibility,
} from "@delulu/core";
import { Schema } from "effect";
import {
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "effect/unstable/httpapi";
import {
  ConflictErrorResponse,
  ForbiddenErrorResponse,
  NotFoundErrorResponse,
  ProviderUnavailableErrorResponse,
  QuotaExceededErrorResponse,
  ValidationErrorResponse,
} from "./errors";
import { Authentication } from "./middleware";

const WorkspacePath = { workspaceId: Schema.String };
const ResourcePath = { workspaceId: Schema.String, id: Schema.String };
const Errors = [
  NotFoundErrorResponse,
  ForbiddenErrorResponse,
  ValidationErrorResponse,
  ConflictErrorResponse,
  ProviderUnavailableErrorResponse,
  QuotaExceededErrorResponse,
];

export const AgentComputerView = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  state: AgentComputerState,
  networkPolicy: AgentNetworkPolicy,
  environmentVersion: Schema.Number,
  lastActivityAt: Schema.String,
  failureReason: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const AgentTaskView = Schema.Struct({
  id: Schema.String,
  computerId: Schema.String,
  workspaceId: Schema.String,
  objective: Schema.String,
  status: AgentTaskStatus,
  networkPolicy: AgentNetworkPolicy,
  exitCode: Schema.NullOr(Schema.Number),
  output: Schema.String,
  outputTruncated: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  completedAt: Schema.NullOr(Schema.String),
});

export const AgentWorkspaceView = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  state: Schema.Literals(["active", "disabled"]),
  accessTier: Schema.Literals(["trial", "beta", "addon", "community"]),
  trialTurnsRemaining: Schema.Number,
  monthlyBudgetMicros: Schema.String,
  dailyBudgetMicros: Schema.String,
  maxConcurrentRuns: Schema.Number,
  maxRunSeconds: Schema.Number,
  ritualsEnabled: Schema.Boolean,
  externalWritesEnabled: Schema.Boolean,
  advancedCodeEnabled: Schema.Boolean,
  runtimePath: Schema.NullOr(Schema.String),
  lastActivityAt: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const AgentRunView = Schema.Struct({
  id: Schema.String,
  agentWorkspaceId: Schema.String,
  workspaceId: Schema.String,
  source: Schema.Literals([
    "web",
    "whatsapp",
    "external",
    "ritual",
    "migration",
  ]),
  chatKey: Schema.String,
  objective: Schema.String,
  status: Schema.Literals([
    "queued",
    "submitted",
    "running",
    "waiting_approval",
    "completed",
    "interrupting",
    "interrupted",
    "failed",
    "timed_out",
  ]),
  runtimeChatPath: Schema.NullOr(Schema.String),
  output: Schema.String,
  provider: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  inputTokens: Schema.String,
  outputTokens: Schema.String,
  cachedInputTokens: Schema.String,
  costMicros: Schema.String,
  error: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  completedAt: Schema.NullOr(Schema.String),
});

export const AgentRunEventView = Schema.Struct({
  id: Schema.String,
  runId: Schema.String,
  sequence: Schema.Number,
  type: Schema.String,
  role: Schema.Literals(["system", "user", "assistant", "tool"]),
  content: Schema.String,
  payload: Schema.Record(Schema.String, Schema.Unknown),
  occurredAt: Schema.String,
});

export const AgentApprovalView = Schema.Struct({
  id: Schema.String,
  runId: Schema.String,
  kind: Schema.String,
  summary: Schema.String,
  risk: Schema.Literals(["low", "consequential"]),
  code: Schema.String,
  expiresAt: Schema.String,
});

export const AgentUsageView = Schema.Struct({
  accessTier: Schema.Literals(["trial", "beta", "addon", "community"]),
  trialTurnsRemaining: Schema.Number,
  dailyUsedMicros: Schema.String,
  dailyBudgetMicros: Schema.String,
  monthlyUsedMicros: Schema.String,
  monthlyBudgetMicros: Schema.String,
  activeRuns: Schema.Number,
  maxConcurrentRuns: Schema.Number,
});

export const AgentRitualView = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  kind: Schema.Literals([
    "morning_brief",
    "draft_ideas",
    "daily_performance",
    "weekly_plan",
    "custom",
  ]),
  name: Schema.String,
  prompt: Schema.String,
  timezone: Schema.String,
  schedule: Schema.Record(Schema.String, Schema.Unknown),
  deliveryChannels: Schema.Array(Schema.String),
  enabled: Schema.Boolean,
  perRunBudgetMicros: Schema.String,
  lastRunAt: Schema.NullOr(Schema.String),
  nextRunAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const AgentMemoryView = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  category: Schema.Literals([
    "voice",
    "audience",
    "goal",
    "preference",
    "rejected_pattern",
    "platform_insight",
    "brand_fact",
  ]),
  value: Schema.Unknown,
  provenance: Schema.String,
  confidence: Schema.Number,
  status: Schema.Literals(["proposed", "confirmed", "rejected"]),
  requiresConfirmation: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const RitualKind = Schema.Literals([
  "morning_brief",
  "draft_ideas",
  "daily_performance",
  "weekly_plan",
  "custom",
]);

export const AgentGroup = HttpApiGroup.make("agent")
  .add(
    HttpApiEndpoint.get("getWorkspace", "/workspace", {
      params: WorkspacePath,
      success: Schema.NullOr(AgentWorkspaceView),
      error: Errors,
    }),
    HttpApiEndpoint.post("createWorkspace", "/workspace", {
      params: WorkspacePath,
      success: AgentWorkspaceView,
      error: Errors,
    }),
    HttpApiEndpoint.patch("updateWorkspace", "/workspace", {
      params: WorkspacePath,
      payload: Schema.Struct({
        runtimeEnabled: Schema.optional(Schema.Boolean),
        ritualsEnabled: Schema.optional(Schema.Boolean),
        externalWritesEnabled: Schema.optional(Schema.Boolean),
        advancedCodeEnabled: Schema.optional(Schema.Boolean),
      }),
      success: AgentWorkspaceView,
      error: Errors,
    }),
    HttpApiEndpoint.delete("deleteWorkspace", "/workspace", {
      params: WorkspacePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: Errors,
    }),
    HttpApiEndpoint.get("listRuns", "/runs", {
      params: WorkspacePath,
      success: Schema.Array(AgentRunView),
      error: Errors,
    }),
    HttpApiEndpoint.post("run", "/runs", {
      params: WorkspacePath,
      payload: Schema.Struct({
        message: Schema.String,
        idempotencyKey: Schema.String,
        threadId: Schema.optional(Schema.String),
      }),
      success: AgentRunView,
      error: Errors,
    }),
    HttpApiEndpoint.get("getRun", "/runs/:id", {
      params: ResourcePath,
      success: AgentRunView,
      error: Errors,
    }),
    HttpApiEndpoint.get("listRunEvents", "/runs/:id/events", {
      params: ResourcePath,
      success: Schema.Array(AgentRunEventView),
      error: Errors,
    }),
    HttpApiEndpoint.post("interruptRun", "/runs/:id/interrupt", {
      params: ResourcePath,
      success: AgentRunView,
      error: Errors,
    }),
    HttpApiEndpoint.post("resolveApproval", "/runs/:id/approval", {
      params: ResourcePath,
      payload: Schema.Struct({
        code: Schema.String,
        decision: Schema.Literals(["approved", "rejected"]),
      }),
      success: Schema.Struct({
        runId: Schema.String,
        message: Schema.String,
      }),
      error: Errors,
    }),
    HttpApiEndpoint.get("listApprovals", "/runs/:id/approvals", {
      params: ResourcePath,
      success: Schema.Array(AgentApprovalView),
      error: Errors,
    }),
    HttpApiEndpoint.get("listRituals", "/rituals", {
      params: WorkspacePath,
      success: Schema.Array(AgentRitualView),
      error: Errors,
    }),
    HttpApiEndpoint.post("createRitual", "/rituals", {
      params: WorkspacePath,
      payload: Schema.Struct({
        kind: RitualKind,
        name: Schema.String,
        prompt: Schema.String,
        timezone: Schema.String,
        schedule: Schema.Record(Schema.String, Schema.Unknown),
        deliveryChannels: Schema.optional(Schema.Array(Schema.String)),
      }),
      success: AgentRitualView,
      error: Errors,
    }),
    HttpApiEndpoint.patch("updateRitual", "/rituals/:id", {
      params: ResourcePath,
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        prompt: Schema.optional(Schema.String),
        timezone: Schema.optional(Schema.String),
        schedule: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
        deliveryChannels: Schema.optional(Schema.Array(Schema.String)),
        enabled: Schema.optional(Schema.Boolean),
      }),
      success: AgentRitualView,
      error: Errors,
    }),
    HttpApiEndpoint.get("usage", "/usage", {
      params: WorkspacePath,
      success: AgentUsageView,
      error: Errors,
    }),
    HttpApiEndpoint.get("listMemories", "/memories", {
      params: WorkspacePath,
      success: Schema.Array(AgentMemoryView),
      error: Errors,
    }),
    HttpApiEndpoint.patch("resolveMemory", "/memories/:id", {
      params: ResourcePath,
      payload: Schema.Struct({
        status: Schema.Literals(["confirmed", "rejected"]),
      }),
      success: AgentMemoryView,
      error: Errors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/agent")
  .annotate(OpenApi.Title, "Agent workspace");

export const AgentComputerGroup = HttpApiGroup.make("agentComputer")
  .add(
    HttpApiEndpoint.get("get", "/", {
      params: WorkspacePath,
      success: Schema.NullOr(AgentWorkspaceView),
      error: Errors,
    }),
    HttpApiEndpoint.post("enable", "/", {
      params: WorkspacePath,
      payload: Schema.Struct({}),
      success: AgentWorkspaceView,
      error: Errors,
    }),
    HttpApiEndpoint.delete("remove", "/", {
      params: WorkspacePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: Errors,
    }),
    HttpApiEndpoint.get("listTasks", "/runs", {
      params: WorkspacePath,
      success: Schema.Array(AgentRunView),
      error: Errors,
    }),
    HttpApiEndpoint.post("runAgent", "/runs", {
      params: WorkspacePath,
      payload: Schema.Struct({
        message: Schema.String,
        idempotencyKey: Schema.String,
        threadId: Schema.optional(Schema.String),
      }),
      success: AgentRunView,
      error: Errors,
    }),
    HttpApiEndpoint.get("getRun", "/runs/:id", {
      params: ResourcePath,
      success: AgentRunView,
      error: Errors,
    }),
    HttpApiEndpoint.get("listRunEvents", "/runs/:id/events", {
      params: ResourcePath,
      success: Schema.Array(AgentRunEventView),
      error: Errors,
    }),
    HttpApiEndpoint.post("interruptRun", "/runs/:id/interrupt", {
      params: ResourcePath,
      success: AgentRunView,
      error: Errors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/agent/computer")
  .annotate(OpenApi.Title, "Agent computer");

export const WorkspaceFileView = Schema.Struct({
  id: Schema.String,
  workspaceId: Schema.String,
  logicalPath: Schema.String,
  filename: Schema.String,
  visibility: WorkspaceFileVisibility,
  source: WorkspaceFileSource,
  status: WorkspaceFileStatus,
  versionId: Schema.NullOr(Schema.String),
  mimeType: Schema.NullOr(Schema.String),
  sizeBytes: Schema.NullOr(Schema.String),
  sha256: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const WorkspaceFilesGroup = HttpApiGroup.make("workspaceFiles")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: WorkspacePath,
      success: Schema.Array(WorkspaceFileView),
      error: Errors,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: ResourcePath,
      success: WorkspaceFileView,
      error: Errors,
    }),
    HttpApiEndpoint.post("createUpload", "/uploads", {
      params: WorkspacePath,
      payload: Schema.Struct({
        logicalPath: Schema.String,
        filename: Schema.String,
        mimeType: Schema.String,
        sizeBytes: Schema.Number,
        sha256: Schema.String,
        visibility: Schema.optional(WorkspaceFileVisibility),
      }),
      success: Schema.Struct({
        file: WorkspaceFileView,
        versionId: Schema.String,
        uploadUrl: Schema.String,
        uploadHeaders: Schema.Record(Schema.String, Schema.String),
      }),
      error: Errors,
    }),
    HttpApiEndpoint.post("completeUpload", "/:id/complete", {
      params: ResourcePath,
      payload: Schema.Struct({ versionId: Schema.String }),
      success: WorkspaceFileView,
      error: Errors,
    }),
    HttpApiEndpoint.get("download", "/:id/download", {
      params: ResourcePath,
      success: Schema.Struct({
        url: Schema.String,
        expiresInSeconds: Schema.Number,
      }),
      error: Errors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: ResourcePath,
      success: Schema.Struct({ deleted: Schema.Boolean }),
      error: Errors,
    })
  )
  .middleware(Authentication)
  .prefix("/v1/workspaces/:workspaceId/files")
  .annotate(OpenApi.Title, "Workspace files");
