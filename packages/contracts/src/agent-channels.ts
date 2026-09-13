import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
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
  .middleware(Authentication);
