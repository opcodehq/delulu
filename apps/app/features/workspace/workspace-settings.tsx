"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Input } from "@delulu/design-system/components/ui/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  OperationsError,
  OperationsLoading,
} from "@/features/workspace/query-state";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";

export function WorkspaceSettings() {
  const { resources } = useApiClient();
  const selected = useWorkspaceSelection();
  const registry = useResourceRegistry();
  const workspaceId = selected.workspaceId ?? "";
  const options = resources.admin.workspace(workspaceId);
  const query = useResourceAtom({
    ...options,
    queryKey: options.queryKey!,
    enabled: !!selected.workspaceId,
  });
  const update = useMutationAtom(resources.admin.updateWorkspace(workspaceId));
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (query.data) {
      setName(query.data.name);
      setSlug(query.data.slug ?? "");
    }
  }, [query.data]);

  if (selected.error || query.error) {
    return (
      <OperationsError
        error={(selected.error ?? query.error)!}
        onRetry={async () => {
          await (selected.error ? selected.retry() : query.refetch());
        }}
      />
    );
  }
  if (selected.isLoading || query.isPending) {
    return <OperationsLoading label="Loading workspace settings" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace settings</CardTitle>
        <CardDescription>
          Update the workspace name and URL slug.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          onChange={(event) => setName(event.target.value)}
          placeholder="Workspace name"
          value={name}
        />
        <Input
          onChange={(event) => setSlug(event.target.value)}
          placeholder="workspace-slug"
          value={slug}
        />
        <Button
          disabled={!name.trim() || update.isPending}
          onClick={async () => {
            try {
              await update.mutateAsync({
                name: name.trim(),
                slug: slug.trim() || null,
              });
              await registry.invalidateResources({
                queryKey: options.queryKey!,
              });
              toast.success("Workspace updated");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Workspace update failed"
              );
            }
          }}
        >
          {update.isPending ? "Saving…" : "Save workspace"}
        </Button>
      </CardContent>
    </Card>
  );
}
