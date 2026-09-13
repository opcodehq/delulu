import { Api, ConflictError } from "@delulu/contracts";
import { CurrentAuth } from "@delulu/core";
import {
  AgentWorkspaceService,
  WorkspaceAccessService,
  WorkspaceFileService,
} from "@delulu/services";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AuthenticationLive } from "./auth-middleware";

export const AgentHandlers = HttpApiBuilder.group(
  Api,
  "agent",
  Effect.fnUntraced(function* (handlers) {
    const agents = yield* AgentWorkspaceService;
    const workspaces = yield* WorkspaceAccessService;
    const access = (
      workspaceId: string,
      scope: "computer:read" | "computer:write"
    ) =>
      Effect.gen(function* () {
        const auth = yield* CurrentAuth;
        return {
          auth,
          workspace: yield* workspaces.require({ workspaceId, auth, scope }),
        };
      });
    const validateRun = (message: string, idempotencyKey: string) => {
      const trimmed = message.trim();
      if (
        trimmed.length < 1 ||
        trimmed.length > 20_000 ||
        idempotencyKey.length < 1 ||
        idempotencyKey.length > 200
      ) {
        return null;
      }
      return trimmed;
    };
    return handlers
      .handle("getWorkspace", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.get(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("createWorkspace", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.create({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
          });
        })
      )
      .handle("updateWorkspace", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.updateSettings({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            ...payload,
          });
        })
      )
      .handle("deleteWorkspace", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          yield* agents.remove(
            context.workspace.workspaceId,
            context.auth.userId
          );
          return { deleted: true };
        })
      )
      .handle("listRuns", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listRuns(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("run", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          const message = validateRun(payload.message, payload.idempotencyKey);
          if (!message) {
            return yield* new ConflictError({
              message: "Agent run limits are invalid",
              resource: "agent-run",
            });
          }
          return yield* agents.run({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            billingOwnerUserId: context.workspace.billingOwnerUserId,
            source: "web",
            threadId: payload.threadId ?? payload.idempotencyKey,
            message,
            idempotencyKey: payload.idempotencyKey,
          });
        })
      )
      .handle("getRun", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.getRun(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      )
      .handle("listRunEvents", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listRunEvents(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      )
      .handle("interruptRun", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.interrupt(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      )
      .handle("resolveApproval", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.resolveApproval({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            runId: params.id,
            senderAddress: `web:${context.auth.userId}`,
            code: payload.code,
            decision: payload.decision,
          });
        })
      )
      .handle("listApprovals", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listApprovals(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      )
      .handle("listRituals", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listRituals(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("createRitual", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.createRitual({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            kind: payload.kind,
            name: payload.name,
            prompt: payload.prompt,
            timezone: payload.timezone,
            schedule: payload.schedule,
            deliveryChannels: payload.deliveryChannels ?? ["web"],
          });
        })
      )
      .handle("updateRitual", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.updateRitual({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            id: params.id,
            ...payload,
          });
        })
      )
      .handle("usage", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.usage(
            context.workspace.workspaceId,
            context.auth.userId,
            context.workspace.billingOwnerUserId
          );
        })
      )
      .handle("listMemories", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listMemories(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("resolveMemory", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.resolveMemory({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            id: params.id,
            status: payload.status,
          });
        })
      );
  })
).pipe(Layer.provide(AuthenticationLive));

export const AgentComputerHandlers = HttpApiBuilder.group(
  Api,
  "agentComputer",
  Effect.fnUntraced(function* (handlers) {
    const agents = yield* AgentWorkspaceService;
    const workspaces = yield* WorkspaceAccessService;
    const access = (
      workspaceId: string,
      scope: "computer:read" | "computer:write"
    ) =>
      Effect.gen(function* () {
        const auth = yield* CurrentAuth;
        return {
          auth,
          workspace: yield* workspaces.require({ workspaceId, auth, scope }),
        };
      });
    return handlers
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.get(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("enable", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.create({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
          });
        })
      )
      .handle("remove", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          yield* agents.remove(
            context.workspace.workspaceId,
            context.auth.userId
          );
          return { deleted: true };
        })
      )
      .handle("listTasks", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listRuns(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("runAgent", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          const message = payload.message.trim();
          if (
            message.length < 1 ||
            message.length > 20_000 ||
            payload.idempotencyKey.length < 1 ||
            payload.idempotencyKey.length > 200
          ) {
            return yield* new ConflictError({
              message: "Agent run limits are invalid",
              resource: "agent-task",
            });
          }
          return yield* agents.run({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            billingOwnerUserId: context.workspace.billingOwnerUserId,
            message,
            idempotencyKey: payload.idempotencyKey,
            source: "web",
            threadId: payload.threadId,
          });
        })
      )
      .handle("getRun", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.getRun(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      )
      .handle("listRunEvents", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:read");
          return yield* agents.listRunEvents(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      )
      .handle("interruptRun", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "computer:write");
          return yield* agents.interrupt(
            context.workspace.workspaceId,
            context.auth.userId,
            params.id
          );
        })
      );
  })
).pipe(Layer.provide(AuthenticationLive));

export const WorkspaceFileHandlers = HttpApiBuilder.group(
  Api,
  "workspaceFiles",
  Effect.fnUntraced(function* (handlers) {
    const files = yield* WorkspaceFileService;
    const workspaces = yield* WorkspaceAccessService;
    const access = (workspaceId: string, scope: "files:read" | "files:write") =>
      Effect.gen(function* () {
        const auth = yield* CurrentAuth;
        return {
          auth,
          workspace: yield* workspaces.require({ workspaceId, auth, scope }),
        };
      });
    return handlers
      .handle("list", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "files:read");
          return yield* files.list(
            context.workspace.workspaceId,
            context.auth.userId
          );
        })
      )
      .handle("get", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "files:read");
          return yield* files.get(
            context.workspace.workspaceId,
            params.id,
            context.auth.userId
          );
        })
      )
      .handle("createUpload", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "files:write");
          return yield* files.createUpload({
            workspaceId: context.workspace.workspaceId,
            userId: context.auth.userId,
            logicalPath: payload.logicalPath,
            filename: payload.filename,
            mimeType: payload.mimeType,
            sizeBytes: payload.sizeBytes,
            sha256: payload.sha256,
            visibility: payload.visibility ?? "private",
            source: "upload",
          });
        })
      )
      .handle("completeUpload", ({ params, payload }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "files:write");
          return yield* files.completeUpload(
            context.workspace.workspaceId,
            params.id,
            payload.versionId,
            context.auth.userId,
            context.workspace.billingOwnerUserId
          );
        })
      )
      .handle("download", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "files:read");
          return yield* files.download(
            context.workspace.workspaceId,
            params.id,
            context.auth.userId
          );
        })
      )
      .handle("remove", ({ params }) =>
        Effect.gen(function* () {
          const context = yield* access(params.workspaceId, "files:write");
          yield* files.remove(
            context.workspace.workspaceId,
            params.id,
            context.auth.userId,
            context.workspace.billingOwnerUserId
          );
          return { deleted: true };
        })
      );
  })
).pipe(Layer.provide(AuthenticationLive));
