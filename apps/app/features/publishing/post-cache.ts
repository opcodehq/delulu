import type { createResourceEffects } from "@delulu/client";
import type { PostView } from "@/shared/workspace-views";
import type { ResourceRegistry } from "@/shell/state/resources";

/** Publish the server-confirmed result before navigating; fill the rest in later. */
export function cacheSavedPost(
  registry: ResourceRegistry,
  resources: ReturnType<typeof createResourceEffects>,
  post: PostView
) {
  registry.seedResource(resources.posts.get(post.workspaceId, post.id), post);
  registry.seedResource(
    resources.posts.list(post.workspaceId, { limit: 100, status: post.status }),
    (page) => {
      const existing = page?.data ?? [];
      const data = [post, ...existing.filter((item) => item.id !== post.id)]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 100);
      return {
        data,
        total:
          (page?.total ?? 0) +
          (existing.some((item) => item.id === post.id) ? 0 : 1),
        limit: 100,
        offset: 0,
      };
    },
    { revalidate: true }
  );
}
