"use client";

import { useAuth, useClerk } from "@delulu/auth";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useApiClient } from "@/shell/providers/api-client";
import { useResourceAtom } from "@/shell/state/resources";

const STORAGE_KEY = "delulu.workspaceId";

interface WorkspaceContextValue {
  readonly workspaceId: string | null;
  readonly workspaces: readonly {
    readonly workspaceId: string;
    readonly name: string;
    readonly slug: string | null;
    readonly isPersonal: boolean;
    readonly role: "owner" | "admin" | "editor" | "viewer";
    /** Clerk organization for team workspaces; null for personal ones. */
    readonly clerkOrgId?: string | null;
  }[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
  readonly selectWorkspace: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { resources } = useApiClient();
  const memberships = useResourceAtom({
    ...resources.me.workspaces(),
    suspense: false,
    throwOnError: false,
    retry: 6,
    retryDelayMs: 100,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const workspaces = memberships.data?.data ?? [];
  const selectedWorkspaceId =
    selected &&
    workspaces.some((workspace) => workspace.workspaceId === selected)
      ? selected
      : null;
  const workspaceId = selectionHydrated
    ? (selectedWorkspaceId ?? workspaces[0]?.workspaceId ?? null)
    : null;

  useEffect(() => {
    const persisted = localStorage.getItem(STORAGE_KEY);
    if (persisted) {
      setSelected(persisted);
    }
    setSelectionHydrated(true);
  }, []);

  useEffect(() => {
    if (!selectionHydrated || workspaces.length === 0) {
      return;
    }
    if (selected && workspaces.some((item) => item.workspaceId === selected)) {
      return;
    }
    const fallback = workspaces[0]?.workspaceId ?? null;
    setSelected(fallback);
    if (fallback) {
      localStorage.setItem(STORAGE_KEY, fallback);
    }
  }, [selected, selectionHydrated, workspaces]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId,
      workspaces,
      isLoading: !selectionHydrated || memberships.isPending,
      isError: memberships.isError,
      error: memberships.error,
      refetch: memberships.refetch,
      selectWorkspace: (workspaceId) => {
        if (!workspaces.some((item) => item.workspaceId === workspaceId)) {
          return;
        }
        localStorage.setItem(STORAGE_KEY, workspaceId);
        setSelected(workspaceId);
      },
    }),
    [
      selectionHydrated,
      memberships.error,
      memberships.isError,
      memberships.isPending,
      memberships.refetch,
      workspaceId,
      workspaces,
    ]
  );

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.workspaceId === workspaceId
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <ClerkOrganizationSync
        clerkOrgId={
          selectedWorkspace?.isPersonal ? null : selectedWorkspace?.clerkOrgId
        }
      />
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Keeps Clerk's active organization on the selected workspace, so Clerk's
 * organization screens and org-role checks describe the same workspace the
 * app is showing. `undefined` means "unknown" (e.g. an older API response or a
 * legacy team without a Clerk org) and leaves Clerk untouched.
 */
function ClerkOrganizationSync({
  clerkOrgId,
}: {
  readonly clerkOrgId: string | null | undefined;
}) {
  const { isLoaded, orgId } = useAuth();
  const { setActive } = useClerk();

  useEffect(() => {
    if (!isLoaded || clerkOrgId === undefined) {
      return;
    }
    if ((orgId ?? null) === clerkOrgId) {
      return;
    }
    setActive({ organization: clerkOrgId }).catch((error: unknown) => {
      console.error("Couldn't switch the active Clerk organization", error);
    });
  }, [clerkOrgId, isLoaded, orgId, setActive]);

  return null;
}

export const useWorkspace = (): WorkspaceContextValue => {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return value;
};

/** One selected-workspace view shared by feature queries and actions. */
export function useWorkspaceSelection() {
  const selected = useWorkspace();
  const workspace = selected.workspaces.find(
    (item) => item.workspaceId === selected.workspaceId
  );
  const error =
    selected.error ??
    (selected.isLoading || workspace
      ? null
      : new Error("Select a workspace to continue"));
  return {
    workspace,
    workspaceId: workspace?.workspaceId,
    isLoading: selected.isLoading,
    isPending: selected.isLoading,
    isError: error !== null,
    error,
    retry: selected.refetch,
    refetch: selected.refetch,
  };
}
