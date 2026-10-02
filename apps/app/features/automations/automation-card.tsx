"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Card, CardContent } from "@delulu/design-system/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@delulu/design-system/components/ui/dropdown-menu";
import { Switch } from "@delulu/design-system/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@delulu/design-system/components/ui/tooltip";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AnalyticsUpIcon,
  Cancel01Icon,
  Comment01Icon,
  Delete01Icon,
  Edit01Icon,
  MailSend01Icon,
  MoreHorizontalIcon,
  TickDouble01Icon,
} from "@delulu/icons";
import { useState } from "react";
import type { AutomationResourceView } from "@/features/automations/automation-resource";
import DeleteAlertDialog from "@/features/publishing/alerts/delete-post";
import { AppLink as Link } from "@/shell/navigation/app-link";

interface AutomationCardProps {
  automation: AutomationResourceView;
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

const triggerTypeIcons: Record<string, typeof Comment01Icon> = {
  COMMENT: Comment01Icon,
  MENTION: Comment01Icon,
  STORY_REPLY: Comment01Icon,
};

function getPrimaryTriggerType(automation: AutomationResourceView): string {
  if (automation.triggers.length === 0) {
    return "COMMENT";
  }
  return automation.triggers[0].triggerType;
}

function formatStepsSummary(automation: AutomationResourceView): string {
  const conditionSteps = automation.steps.filter((s) => s.type === "condition");
  const dmSteps = automation.steps.filter((s) => s.type === "send_dm");

  if (conditionSteps.length === 0 && dmSteps.length === 0) {
    return "No steps configured";
  }

  const parts: string[] = [];
  if (conditionSteps.length > 0) {
    const first = conditionSteps[0];
    if (first.type === "condition") {
      if (first.operator === "always") {
        parts.push("Always trigger");
      } else if (first.value) {
        parts.push(`${first.operator} "${first.value}"`);
      } else {
        parts.push(first.operator);
      }
    }
  }
  if (dmSteps.length > 0) {
    parts.push(`${dmSteps.length} DM${dmSteps.length > 1 ? "s" : ""}`);
  }
  return parts.join(" • ");
}

export function AutomationCard({
  automation,
  canManage,
  viewMode,
  onDelete,
  onToggle,
}: AutomationCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const primaryTriggerType = getPrimaryTriggerType(automation);
  const TriggerIcon = triggerTypeIcons[primaryTriggerType] || Comment01Icon;
  const successRate =
    automation.totalDmsSent + automation.totalFailed > 0
      ? Math.round(
          (automation.totalDmsSent /
            (automation.totalDmsSent + automation.totalFailed)) *
            100
        )
      : 0;

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      await onToggle(automation.id);
    } finally {
      setIsToggling(false);
    }
  };

  // Get DM preview text
  const dmStep = automation.steps.find((s) => s.type === "send_dm");
  const dmPreview =
    dmStep?.type === "send_dm" && dmStep.messageTemplate
      ? dmStep.messageTemplate.slice(0, 60) +
        (dmStep.messageTemplate.length > 60 ? "..." : "")
      : null;

  if (viewMode === "list") {
    return (
      <Card className="group relative gap-0 rounded-none border-x-0 border-t-0 border-b py-2 shadow-none last:border-b-0 hover:bg-muted/30">
        {/* Status dot — absolute top-right */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-2.5 right-3 md:right-4">
                <span
                  className={`block h-2 w-2 rounded-full ${
                    automation.enabled ? "bg-green-500" : "bg-red-400"
                  }`}
                />
                {automation.enabled && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-green-500 opacity-40" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {automation.enabled ? "Active" : "Inactive"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <CardContent className="px-3 py-1.5 pr-8 md:px-4 md:py-2.5 md:pr-10">
          <div className="flex items-center gap-2.5 md:gap-4">
            {/* Main Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium text-foreground text-xs md:text-sm">
                  {dmPreview || automation.name}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-6 w-6 shrink-0 md:h-8 md:w-8 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                      size="icon"
                      variant="ghost"
                    >
                      <Icon icon={MoreHorizontalIcon} size={14} />
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
                        <Icon
                          className="mr-2"
                          icon={AnalyticsUpIcon}
                          size={16}
                        />
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
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground md:text-xs">
                {triggerTypeLabels[primaryTriggerType]}
                {automation.triggers[0]?.targetPostIds?.length
                  ? ` • ${automation.triggers[0].targetPostIds.length} post(s)`
                  : ""}
                {" • "}
                {formatStepsSummary(automation)}
              </p>
            </div>

            {/* Stats + toggle — desktop only */}
            <div className="hidden items-center gap-6 md:flex">
              <div className="text-center">
                <p className="font-medium text-foreground text-sm">
                  {automation.totalDmsSent}
                </p>
                <p className="text-muted-foreground text-xs">DMs Sent</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground text-sm">
                  {successRate}%
                </p>
                <p className="text-muted-foreground text-xs">Success</p>
              </div>
              <Switch
                checked={automation.enabled}
                disabled={isToggling || !canManage}
                onCheckedChange={handleToggle}
              />
            </div>
          </div>
        </CardContent>
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
      </Card>
    );
  }

  // Grid View
  return (
    <Card className="group background-blue-sm relative flex h-full flex-col transition-all duration-200 hover:bg-card/80">
      {/* Status dot — absolute top-right */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-3 right-3">
              <span
                className={`block h-2 w-2 rounded-full ${
                  automation.enabled ? "bg-green-500" : "bg-red-400"
                }`}
              />
              {automation.enabled && (
                <span className="absolute inset-0 animate-ping rounded-full bg-green-500 opacity-40" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {automation.enabled ? "Active" : "Inactive"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CardContent className="flex flex-1 flex-col p-4">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="text-primary" icon={TriggerIcon} size={20} />
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="w-8" size="icon" variant="ghost">
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
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="mb-1 font-medium text-foreground">
            {automation.name}
          </h3>
          <p className="mb-2 text-muted-foreground text-sm">
            {triggerTypeLabels[primaryTriggerType]}
          </p>
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {formatStepsSummary(automation)}
          </p>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-border border-t pt-4">
          <div className="flex items-center gap-1.5">
            <Icon className="text-green-500" icon={MailSend01Icon} size={14} />
            <span className="text-foreground text-sm">
              {automation.totalDmsSent}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon className="text-red-500" icon={Cancel01Icon} size={14} />
            <span className="text-foreground text-sm">
              {automation.totalFailed}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon className="text-blue-500" icon={TickDouble01Icon} size={14} />
            <span className="text-foreground text-sm">{successRate}%</span>
          </div>
        </div>

        {/* Toggle */}
        <div className="mt-4 flex items-center justify-between border-border border-t pt-4">
          <span className="text-muted-foreground text-sm">
            {automation.enabled ? "Enabled" : "Disabled"}
          </span>
          <Switch
            checked={automation.enabled}
            disabled={isToggling || !canManage}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
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
    </Card>
  );
}
