"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Icon } from "@delulu/design-system/providers/icon";
import { Settings01Icon } from "@delulu/icons";
import { AppLink as Link } from "@/shell/navigation/app-link";
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

  const selected = workspaces.find((item) => item.workspaceId === workspaceId);
  const switcher = (
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

  if (selected?.isPersonal || !selected?.clerkOrgId) {
    return switcher;
  }

  // Team workspaces: members, roles, and sharing live in organization settings.
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{switcher}</div>
      <Button
        aria-label="Organization settings"
        asChild
        className="shrink-0 text-muted-foreground [@media(pointer:coarse)]:size-11"
        size="icon"
        title="Organization settings"
        variant="ghost"
      >
        <Link href="/organization">
          <Icon icon={Settings01Icon} size={16} />
        </Link>
      </Button>
    </div>
  );
}
