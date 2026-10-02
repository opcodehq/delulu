"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AnalyticsUpIcon,
  Delete01Icon,
  Edit01Icon,
  MoreHorizontalIcon,
} from "@delulu/icons";
import { useState } from "react";
import { AutomationCard } from "@/features/automations/automation-card";
import type { AutomationResourceView } from "@/features/automations/automation-resource";
import DeleteAlertDialog from "@/features/publishing/alerts/delete-post";
import { AppLink as Link } from "@/shell/navigation/app-link";

interface AutomationListProps {
  automations: AutomationResourceView[];
  viewMode: "grid" | "list";
  canManage: boolean;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
}

const triggerTypeLabels: Record<string, string> = {
  COMMENT: "Comment",
  MENTION: "Mention",
  STORY_REPLY: "Story Reply",
};

function getPrimaryTriggerType(automation: AutomationResourceView): string {
  if (automation.triggers.length === 0) {
    return "COMMENT";
  }
  return automation.triggers[0].triggerType;
}

function AutomationRow({
  automation,
  canManage,
  onDelete,
  onToggle,
}: {
  automation: AutomationResourceView;
  canManage: boolean;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const primaryTriggerType = getPrimaryTriggerType(automation);
  const postCount = automation.triggers[0]?.targetPostIds?.length ?? 0;

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      await onToggle(automation.id);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <span className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "block size-2.5 rounded-full",
            automation.enabled ? "bg-green-500" : "bg-red-400"
          )}
        />
        {automation.enabled && (
          <span className="absolute inset-0 animate-ping rounded-full bg-green-500 opacity-40" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{automation.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <Badge size="sm" variant={automation.enabled ? "green" : "zinc"}>
            {automation.enabled ? "Enabled" : "Disabled"}
          </Badge>
          <span className="truncate text-muted-foreground text-xs">
            {triggerTypeLabels[primaryTriggerType]}
            {postCount ? ` · ${postCount} post${postCount > 1 ? "s" : ""}` : ""}
            {` · ${automation.totalDmsSent} DMs sent`}
          </span>
        </div>
      </div>
      <Switch
        checked={automation.enabled}
        disabled={isToggling || !canManage}
        onCheckedChange={handleToggle}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="size-8 shrink-0 text-muted-foreground"
            size="icon"
            variant="ghost"
          >
            <Icon icon={MoreHorizontalIcon} size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/automations/${automation.id}`}>
              <Icon className="mr-2" icon={Edit01Icon} size={16} />
              Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/automations/${automation.id}/analytics`}>
              <Icon className="mr-2" icon={AnalyticsUpIcon} size={16} />
              View Analytics
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Icon className="mr-2" icon={Delete01Icon} size={16} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAlertDialog
        description="Are you sure you want to delete this automation? This action cannot be undone."
        isLoading={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          await onDelete(automation.id).finally(() => {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
          });
        }}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title="Delete Automation"
      />
    </div>
  );
}

export function AutomationList({
  automations,
  canManage,
  viewMode,
  onDelete,
  onToggle,
}: AutomationListProps) {
  if (automations.length === 0) {
    return (
      <Card className="items-center justify-center gap-2 py-16 text-center">
        <h3 className="font-medium text-foreground text-lg">
          No automations yet
        </h3>
        <p className="max-w-sm text-muted-foreground text-sm">
          Create your first automation to automatically reply to Instagram
          comments
        </p>
      </Card>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automations.map((automation) => (
          <AutomationCard
            automation={automation}
            canManage={canManage}
            key={automation.id}
            onDelete={onDelete}
            onToggle={onToggle}
            viewMode={viewMode}
          />
        ))}
      </div>
    );
  }

  return (
    <Card className="divide-y divide-border/60 p-0">
      {automations.map((automation) => (
        <AutomationRow
          automation={automation}
          canManage={canManage}
          key={automation.id}
          onDelete={onDelete}
          onToggle={onToggle}
        />
      ))}
    </Card>
  );
}
