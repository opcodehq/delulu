"use client";

import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import { useMutationAtom, useResourceRegistry } from "@/shell/state/resources";

interface MediaUploadResult {
  bucketKey: string;
  url: string;
  mediaId?: string;
}

export function useMediaStorage() {
  const { workspaceId } = useWorkspaceSelection();
  const { resources } = useApiClient();
  const registry = useResourceRegistry();
  const requestUpload = useMutationAtom(
    resources.media.uploads(workspaceId ?? "")
  );
  const completeUpload = useMutationAtom({
    ...resources.media.complete(workspaceId ?? ""),
    onSuccess: async () => {
      if (!workspaceId) {
        return;
      }
      await registry.invalidateResources({
        queryKey: resources.media.list(workspaceId).queryKey,
      });
    },
  });

  const uploadAndSaveMedia = async (file: File): Promise<MediaUploadResult> => {
    if (!workspaceId) {
      throw new Error("Select a workspace before uploading media");
    }
    const [ticket] = await requestUpload.mutateAsync([
      { filename: file.name, contentType: file.type },
    ]);
    if (!ticket) {
      throw new Error("The API did not return an upload ticket");
    }
    const response = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Media upload failed (${response.status})`);
    }
    const [saved] = await completeUpload.mutateAsync([
      { mediaId: ticket.mediaId },
    ]);
    if (!saved) {
      throw new Error("The uploaded media could not be finalized");
    }
    return { bucketKey: saved.bucketKey, url: saved.url, mediaId: saved.id };
  };

  return {
    uploadAndSaveMedia,
    isLoading: requestUpload.isPending || completeUpload.isPending,
  };
}
