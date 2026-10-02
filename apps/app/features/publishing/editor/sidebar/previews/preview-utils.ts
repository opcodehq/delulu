"use client";

import type { SupportedSocialPlatform } from "@delulu/design-system/lib/social-config";
import {
  usePost,
  useSelectedSocialProviders,
} from "@/features/publishing/store";
import { useMediaUrl } from "@/features/publishing/use-media-url";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

export function formatNumber(num: number) {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Preview data hook. When `postData` is provided, derives preview data from the
 * post object (used in review flow). Otherwise reads from the Zustand store
 * (used in the post editor).
 */
export function usePreviewData(
  socialType: SupportedSocialPlatform,
  postData?: {
    content: Array<{
      text: string;
      media: Array<{
        url?: string;
        bucketKey?: string;
        mediaType: "IMAGE" | "VIDEO" | "DOCUMENT";
        altText?: string;
      }>;
    }>;
    socialProviders?: Array<{
      _id: string;
      socialType: string;
      username?: string;
      fullName?: string;
      profileImage?: string;
    }>;
  }
) {
  const storePost = usePost();
  const selectedProviders = useSelectedSocialProviders();
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const connections = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
  });
  const connectedAccounts = (connections.data?.data ?? []).map(
    (connection) => ({
      ...connection,
      _id: connection.id,
      fullName:
        connection.displayName ?? connection.username ?? connection.profileId,
      profileImage: undefined as string | undefined,
    })
  );

  // When post data is passed, derive from it instead of the store
  if (postData) {
    const content = postData.content[0];
    const media = content?.media?.[0];
    const mediaUrl = useMediaUrl(media?.bucketKey, media?.url);
    const hasVideo = media?.mediaType === "VIDEO";
    const hasImage = media?.mediaType === "IMAGE";
    const allMedia = content?.media ?? [];

    const provider = postData.socialProviders?.find(
      (p) => p.socialType === socialType
    );

    return {
      content,
      media,
      mediaUrl,
      hasVideo,
      hasImage,
      allMedia,
      provider: provider
        ? (connectedAccounts.find((a) => a.id === provider._id) ?? provider)
        : undefined,
    };
  }

  const selectedProvider = selectedProviders.find(
    (provider) => provider.socialType === socialType
  );

  const provider = connectedAccounts.find(
    (account) => account.id === selectedProvider?.socialId
  );

  const content = storePost.content[0];
  const media = content?.media?.[0];
  const mediaUrl = useMediaUrl(media?.bucketKey, media?.url);
  const hasVideo = media?.mediaType === "VIDEO";
  const hasImage = media?.mediaType === "IMAGE";
  const allMedia = content?.media ?? [];

  return {
    content,
    media,
    mediaUrl,
    hasVideo,
    hasImage,
    allMedia,
    provider,
  };
}
