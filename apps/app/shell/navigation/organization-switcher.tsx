"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { useWorkspace } from "@/shell/providers/workspace";

export function OrganizationSwitcher() {
  const { workspaceId, workspaces, isLoading, error, selectWorkspace } =
    useWorkspace();

  if (isLoading) {
    return <div className="h-9 animate-pulse rounded-md bg-sidebar-accent" />;
  }

  if (error || !workspaceId) {
    return (
      <div className="rounded-md border border-destructive/30 p-2 text-destructive text-xs">
        Workspaces unavailable
      </div>
    );
  }

  return (
    <Select
      onValueChange={(next) => {
        selectWorkspace(next);
      }}
      value={workspaceId}
    >
      <SelectTrigger className="w-full bg-sidebar">
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.workspaceId} value={workspace.workspaceId}>
            {workspace.name}
            {workspace.isPersonal ? " (Personal)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
