"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "@/features/publishing/store";
import { PageLoading } from "@/shell/loading";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useResourceAtom } from "@/shell/state/resources";

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { resources } = useApiClient();
  const { workspaceId } = useWorkspace();

  const connections = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: workspaceId !== null,
  });

  useEffect(() => {
    const socialProviders = connections.data?.data;
    if (!socialProviders) {
      return;
    }

    // Rehydrate from localStorage
    useStore.persist.rehydrate();

    // Force reset transient upload state — it may be stuck from a previous session
    useStore.setState({ isMediaUploading: false });

    // Get current state after rehydration
    const state = useStore.getState();

    state.cleanupDeletedProviders(
      socialProviders.map((provider) => provider.id)
    );

    setIsHydrated(true);
  }, [connections.data]);

  if (!isHydrated) {
    return <PageLoading label="Loading editor" />;
  }

  return <>{children}</>;
}
