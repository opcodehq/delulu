import type { ApiClient } from "../client.js";
import { workspaceKeys } from "../keys.js";
import { mutationEffect, resourceEffect } from "../resource.js";
import { defineResourceEffects, type EndpointPayload } from "./shared.js";

const params = (workspaceId: string) => ({ workspaceId });

export const createAgentEffects = defineResourceEffects(({ client }) => ({
  workspace: (workspaceId: string) =>
    resourceEffect({
      queryKey: workspaceKeys.resource(workspaceId, "agent-workspace"),
      effect: () => client.agent.getWorkspace({ params: params(workspaceId) }),
    }),
  runs: (workspaceId: string) =>
    resourceEffect({
      queryKey: workspaceKeys.resource(workspaceId, "agent-runs"),
      effect: () => client.agent.listRuns({ params: params(workspaceId) }),
    }),
  run: (workspaceId: string, id: string) =>
    resourceEffect({
      queryKey: workspaceKeys.detail(workspaceId, "agent-runs", id),
      effect: () => client.agent.getRun({ params: { workspaceId, id } }),
    }),
  events: (workspaceId: string, id: string) =>
    resourceEffect({
      queryKey: workspaceKeys.detail(workspaceId, "agent-events", id),
      effect: () => client.agent.listRunEvents({ params: { workspaceId, id } }),
    }),
  approvals: (workspaceId: string, id: string) =>
    resourceEffect({
      queryKey: workspaceKeys.detail(workspaceId, "agent-approvals", id),
      effect: () => client.agent.listApprovals({ params: { workspaceId, id } }),
    }),
  usage: (workspaceId: string) =>
    resourceEffect({
      queryKey: workspaceKeys.resource(workspaceId, "agent-usage"),
      effect: () => client.agent.usage({ params: params(workspaceId) }),
    }),
  rituals: (workspaceId: string) =>
    resourceEffect({
      queryKey: workspaceKeys.resource(workspaceId, "agent-rituals"),
      effect: () => client.agent.listRituals({ params: params(workspaceId) }),
    }),
  memories: (workspaceId: string) =>
    resourceEffect({
      queryKey: workspaceKeys.resource(workspaceId, "agent-memories"),
      effect: () => client.agent.listMemories({ params: params(workspaceId) }),
    }),
  createWorkspace: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-workspace"),
      effect: () =>
        client.agent.createWorkspace({ params: params(workspaceId) }),
    }),
  resolveApproval: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-approvals"),
      effect: (input: {
        id: string;
        payload: EndpointPayload<ApiClient["agent"]["resolveApproval"]>;
      }) =>
        client.agent.resolveApproval({
          params: { workspaceId, id: input.id },
          payload: input.payload,
        }),
    }),
  runAgent: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-runs"),
      effect: (payload: EndpointPayload<ApiClient["agent"]["run"]>) =>
        client.agent.run({ params: params(workspaceId), payload }),
    }),
  interrupt: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-runs"),
      effect: (id: string) =>
        client.agent.interruptRun({ params: { workspaceId, id } }),
    }),
  createRitual: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-rituals"),
      effect: (payload: EndpointPayload<ApiClient["agent"]["createRitual"]>) =>
        client.agent.createRitual({ params: params(workspaceId), payload }),
    }),
  updateRitual: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-rituals"),
      effect: (input: {
        id: string;
        payload: EndpointPayload<ApiClient["agent"]["updateRitual"]>;
      }) =>
        client.agent.updateRitual({
          params: { workspaceId, id: input.id },
          payload: input.payload,
        }),
    }),
  resolveMemory: (workspaceId: string) =>
    mutationEffect({
      mutationKey: workspaceKeys.resource(workspaceId, "agent-memories"),
      effect: (input: {
        id: string;
        payload: EndpointPayload<ApiClient["agent"]["resolveMemory"]>;
      }) =>
        client.agent.resolveMemory({
          params: { workspaceId, id: input.id },
          payload: input.payload,
        }),
    }),
}));
