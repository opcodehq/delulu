import {
  type ComposerPostConnection,
  invalidateWorkspaceResource,
  makeComposerPostWrite,
} from "@delulu/client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/components/providers/api-client";
import { useWorkspace } from "@/components/providers/workspace";
import { useUsageLimit } from "@/hooks/use-usage-limits";
import {
  getPlatformsInDefault,
  shouldDefaultUseMultiPostLayout,
  shouldUseMultiPostLayout,
} from "@/lib/platform-rules";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/state/resources";
import {
  useDateTime,
  usePost,
  useSelectedSocialProviders,
  useStore,
} from "@/store/post";

export function usePostActions() {
  const { date } = useDateTime();
  const post = usePost();
  const selected = useSelectedSocialProviders();
  const providerSettings = useStore((state) => state.providerSettings);
  const { id: postId } = useParams<{ id: string | undefined }>();
  const router = useRouter();
  const registry = useResourceRegistry();
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const connections = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
  });
  const usage = useResourceAtom({
    ...resources.billing.usage(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
  const createPost = useMutationAtom(resources.posts.create(workspaceId ?? ""));
  const updatePost = useMutationAtom(
    resources.posts.update(workspaceId ?? "", postId ?? "")
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const monthlyPostsCount = usage.data?.usage.monthlyPosts ?? 0;
  const monthlyPostsLimit = useUsageLimit("monthlyPosts", monthlyPostsCount);
  const isAtPostLimit = !(
    monthlyPostsLimit.isUnlimited || monthlyPostsLimit.allowed
  );

  const write = async (
    scheduledAt: string | null,
    intent: "draft" | "schedule" | "publish_now"
  ) => {
    const isDraft = intent === "draft";
    if (!workspaceId) {
      throw new Error("Select a workspace before saving a post");
    }
    if (!isDraft && isAtPostLimit) {
      throw new Error("You have reached your monthly post limit");
    }
    const byId = new Map(
      (connections.data?.data ?? []).map((item) => [item.id, item])
    );
    const platformsInDefault = getPlatformsInDefault(
      selected,
      post.alternativeContent
    );
    if (
      !isDraft &&
      post.content.length > 1 &&
      platformsInDefault.length > 0 &&
      !shouldDefaultUseMultiPostLayout(platformsInDefault)
    ) {
      throw new Error(
        "Shared thread content can only be published to X and Threads. Remove the extra posts or create platform-specific content."
      );
    }
    const incompatibleAlternative = post.alternativeContent.find(
      (item) =>
        item.content.length > 1 &&
        !shouldUseMultiPostLayout(item.socialProvider.socialType, [])
    );
    if (!isDraft && incompatibleAlternative) {
      throw new Error(
        `${incompatibleAlternative.socialProvider.name} does not support threaded content. Keep one post for this account.`
      );
    }

    const toSegments = (items: typeof post.content) =>
      [...items]
        .sort((left, right) => left.order - right.order)
        .map((item) => ({
          text: item.text,
          media: item.media.flatMap((media) =>
            media.id
              ? [
                  {
                    id: media.id,
                    altText: media.altText,
                    thumbnailMediaId: media.thumbnailMediaId,
                    thumbnailTimestamp: media.thumbnailTimestamp,
                  },
                ]
              : []
          ),
        }));
    const targets = selected.map((item) => {
      const connection = byId.get(item.socialId);
      if (!connection) {
        throw new Error(`Connection ${item.name} is no longer available`);
      }
      const configured = providerSettings[connection.id];
      const settings =
        configured?.type === connection.platform
          ? ({
              platform: configured.type,
              values: configured.settings,
            } as ComposerPostConnection["settings"])
          : undefined;
      const alternative = post.alternativeContent.find(
        (content) => content.socialProvider.socialId === connection.id
      );
      return {
        id: connection.id,
        platform: connection.platform,
        settings,
        segments: alternative ? toSegments(alternative.content) : undefined,
      };
    });
    const payload = makeComposerPostWrite({
      segments: toSegments(post.content),
      connections: targets,
      intent,
      scheduledAt,
      source: "app",
    });
    const result = postId
      ? await updatePost.mutateAsync(payload)
      : await createPost.mutateAsync(payload);
    await invalidateWorkspaceResource(registry, workspaceId, "posts");
    return result;
  };

  const run = async (
    action: () => Promise<unknown>,
    success: string,
    failure: string,
    destination: string
  ) => {
    try {
      setIsProcessing(true);
      await action();
      toast.success(success);
      router.push(destination);
    } catch (error) {
      toast.error(failure, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    handlePostNow: () =>
      run(
        () => write(null, "publish_now"),
        "Post sent for processing, will be published shortly.",
        "Failed to publish post",
        "/posts?status=publishing"
      ),
    handleSchedulePost: () =>
      date
        ? run(
            () => write(date.toISOString(), "schedule"),
            "Post scheduled successfully",
            "Failed to schedule post",
            "/posts?status=scheduled"
          )
        : Promise.resolve(),
    handleSaveAsDraft: () =>
      run(
        () => write(null, "draft"),
        postId ? "Post updated successfully" : "Post saved successfully",
        postId ? "Failed to update post" : "Failed to save post",
        "/posts?status=draft"
      ),
    isProcessing,
    isAtPostLimit,
    date,
    postId,
  };
}
