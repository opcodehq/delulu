import type { ApiClient } from "../client.js";
import { workspaceKeys } from "../keys.js";
import { mutationEffect, resourceEffect } from "../resource.js";
import { defineResourceEffects, type EndpointPayload } from "./shared.js";

const linkKey = (workspaceId: string, postId: string) =>
  workspaceKeys.detail(workspaceId, "share-link", postId);

export const createShareEffects = defineResourceEffects(({ client }) => {
  const invalidates = (workspaceId: string) => [
    workspaceKeys.resource(workspaceId, "share-link"),
  ];
  return {
    forPost: (workspaceId: string, postId: string) =>
      resourceEffect({
        queryKey: linkKey(workspaceId, postId),
        effect: () =>
          client.shareLinks.get({ params: { workspaceId, postId } }),
      }),
    comments: (workspaceId: string, postId: string) =>
      resourceEffect({
        queryKey: workspaceKeys.detail(workspaceId, "share-comments", postId),
        effect: () =>
          client.shareLinks.comments({ params: { workspaceId, postId } }),
      }),
    create: (workspaceId: string, postId: string) =>
      mutationEffect({
        mutationKey: linkKey(workspaceId, postId),
        invalidates: invalidates(workspaceId),
        effect: (payload: EndpointPayload<ApiClient["shareLinks"]["create"]>) =>
          client.shareLinks.create({
            params: { workspaceId, postId },
            payload,
          }),
      }),
    update: (workspaceId: string, postId: string) =>
      mutationEffect({
        mutationKey: linkKey(workspaceId, postId),
        invalidates: invalidates(workspaceId),
        effect: (payload: EndpointPayload<ApiClient["shareLinks"]["update"]>) =>
          client.shareLinks.update({
            params: { workspaceId, postId },
            payload,
          }),
      }),
    revoke: (workspaceId: string, postId: string) =>
      mutationEffect({
        mutationKey: linkKey(workspaceId, postId),
        invalidates: invalidates(workspaceId),
        effect: () =>
          client.shareLinks.revoke({ params: { workspaceId, postId } }),
      }),
  };
});
