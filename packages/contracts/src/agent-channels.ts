import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { ChatGPTConnection, ChatGPTModels } from "./chatgpt";
import { ConflictErrorResponse, ForbiddenErrorResponse } from "./errors";
import { Authentication } from "./middleware";

export const InstructionSkillView = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  instructions: Schema.String,
  revision: Schema.Number,
  enabled: Schema.Boolean,
});

export const AgentChannelsGroup = HttpApiGroup.make("agentChannels")
  .add(
    HttpApiEndpoint.get("links", "/v1/agent/channels/telegram", {
      success: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          workspaceId: Schema.String,
          providerUserId: Schema.String,
        })
      ),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.delete("disconnect", "/v1/agent/channels/telegram/:id", {
      params: { id: Schema.String },
      success: Schema.Struct({ updated: Schema.Boolean }),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.patch(
      "selectWorkspace",
      "/v1/agent/channels/telegram/:id/workspace",
      {
        params: { id: Schema.String },
        payload: Schema.Struct({ workspaceId: Schema.String }),
        success: Schema.Struct({ updated: Schema.Boolean }),
        error: [ConflictErrorResponse, ForbiddenErrorResponse],
      }
    )
  )
  .add(
    HttpApiEndpoint.get("workspaces", "/v1/agent/channels/workspaces", {
      success: Schema.Array(
        Schema.Struct({ workspaceId: Schema.String, name: Schema.String })
      ),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.post("confirm", "/v1/agent/channels/telegram/confirm", {
      payload: Schema.Struct({
        challenge: Schema.String,
        workspaceId: Schema.String,
      }),
      success: Schema.Struct({ pendingConfirmation: Schema.Boolean }),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.get("skills", "/v1/workspaces/:workspaceId/agent/skills", {
      params: { workspaceId: Schema.String },
      success: Schema.Array(InstructionSkillView),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.post(
      "saveSkill",
      "/v1/workspaces/:workspaceId/agent/skills",
      {
        params: { workspaceId: Schema.String },
        payload: Schema.Struct({
          id: Schema.optional(Schema.String),
          title: Schema.String,
          instructions: Schema.String,
          revision: Schema.optional(Schema.Number),
          enabled: Schema.Boolean,
        }),
        success: InstructionSkillView,
        error: [ConflictErrorResponse, ForbiddenErrorResponse],
      }
    )
  )
  .add(
    HttpApiEndpoint.delete(
      "deleteSkill",
      "/v1/workspaces/:workspaceId/agent/skills/:id",
      {
        params: { workspaceId: Schema.String, id: Schema.String },
        success: Schema.Struct({ deleted: Schema.Boolean }),
        error: [ConflictErrorResponse, ForbiddenErrorResponse],
      }
    )
  )
  .add(
    HttpApiEndpoint.get("chatGPTStatus", "/v1/agent/chatgpt", {
      success: ChatGPTConnection,
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.post("chatGPTLogin", "/v1/agent/chatgpt/login", {
      success: ChatGPTConnection,
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.post("chatGPTCancel", "/v1/agent/chatgpt/cancel", {
      success: Schema.Struct({ updated: Schema.Boolean }),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.delete("chatGPTDisconnect", "/v1/agent/chatgpt", {
      success: Schema.Struct({ updated: Schema.Boolean }),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.get("chatGPTModels", "/v1/agent/chatgpt/models", {
      success: ChatGPTModels,
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.patch("chatGPTModel", "/v1/agent/chatgpt/model", {
      payload: Schema.Struct({ model: Schema.String }),
      success: Schema.Struct({ updated: Schema.Boolean }),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .add(
    HttpApiEndpoint.patch("chatGPTRuntime", "/v1/agent/chatgpt/runtime", {
      payload: Schema.Struct({ selected: Schema.Boolean }),
      success: Schema.Struct({ updated: Schema.Boolean }),
      error: [ConflictErrorResponse, ForbiddenErrorResponse],
    })
  )
  .middleware(Authentication);
