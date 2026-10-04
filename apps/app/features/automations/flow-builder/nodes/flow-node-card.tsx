"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Alert02Icon } from "@delulu/icons";
import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { AddStepMenu } from "@/features/automations/flow-builder/add-step-menu";
import { useFlowActions } from "@/features/automations/flow-builder/flow-actions";
import {
  FLOW_NODE_KINDS,
  type FlowNodeKind,
} from "@/features/automations/flow-builder/step-kinds";
import { NODE_WIDTH } from "@/features/automations/flow-builder/utils/auto-layout";
import type { StepBranch } from "@/features/automations/flow-builder/utils/step-helpers";

export interface NodeSource {
  id: string;
  /** Horizontal position along the bottom edge, in percent. */
  left: number;
  className?: string;
}

export interface NodeSlot {
  branch: StepBranch;
  /** Horizontal position along the bottom edge, in percent. */
  left: number;
  label?: string;
}

interface FlowNodeCardProps {
  id: string;
  kind: Exclude<FlowNodeKind, "note">;
  title: string;
  description?: string;
  /** Short label for what is missing; marks the node as needing attention. */
  issue?: string;
  badge?: string;
  /** Let long titles (DM previews) wrap onto a second line. */
  wrapTitle?: boolean;
  selected: boolean;
  hasTarget?: boolean;
  sources: NodeSource[];
  /** Open branches, rendered as "+" buttons that insert a step there. */
  slots: NodeSlot[];
  children?: ReactNode;
}

export function FlowNodeCard({
  id,
  kind,
  title,
  description,
  issue,
  badge,
  wrapTitle = false,
  selected,
  hasTarget = true,
  sources,
  slots,
  children,
}: FlowNodeCardProps) {
  const style = FLOW_NODE_KINDS[kind];
  const actions = useFlowActions();

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card p-0.5 shadow-xs transition-[border-color,box-shadow]",
        selected ? style.selected : cn(style.border, "hover:shadow-sm")
      )}
      data-issue={issue ? "true" : undefined}
      style={{ width: NODE_WIDTH }}
    >
      {hasTarget && (
        <Handle
          className={cn("!size-2 !border-2 !border-card", style.handle)}
          position={Position.Top}
          type="target"
        />
      )}
      <div className="flex h-6 items-center gap-1.5 px-1.5">
        <Icon className={style.text} icon={style.icon} size={13} />
        <span className={cn("font-medium text-xs", style.text)}>
          {style.label}
        </span>
        {issue ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 font-medium text-amber-700 text-xs leading-5 dark:text-amber-400">
            <Icon icon={Alert02Icon} size={11} />
            {issue}
          </span>
        ) : badge ? (
          <span className="ml-auto rounded-full bg-muted px-1.5 font-medium text-muted-foreground text-xs leading-5">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="rounded-md bg-muted/60 px-2 py-1.5">
        <p
          className={cn(
            "font-medium text-xs leading-4",
            wrapTitle ? "line-clamp-2 break-words" : "truncate"
          )}
        >
          {title}
        </p>
        {description ? (
          <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground text-xs leading-4">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {sources.map((source) => (
        <Handle
          className={cn(
            "!size-2 !border-2 !border-card",
            source.className ?? style.handle
          )}
          id={source.id}
          key={source.id}
          position={Position.Bottom}
          style={{ left: `${source.left}%` }}
          type="source"
        />
      ))}
      {actions &&
        slots.map((slot) => (
          <div
            className="nodrag nopan absolute top-full flex -translate-x-1/2 flex-col items-center"
            key={slot.branch}
            style={{ left: `${slot.left}%` }}
          >
            <div className="h-3 w-px bg-border" />
            {slot.label ? (
              <>
                <span className="rounded-full border bg-background px-1.5 font-medium text-muted-foreground text-xs leading-4">
                  {slot.label}
                </span>
                <div className="h-1.5 w-px bg-border" />
              </>
            ) : null}
            <AddStepMenu
              onAdd={(type) =>
                actions.addStep({ parentId: id, branch: slot.branch }, type)
              }
            >
              <Button
                aria-label={
                  slot.label
                    ? `Add step to the ${slot.label} path of ${style.label}`
                    : `Add step after ${style.label}`
                }
                className="rounded-full border-dashed bg-background"
                // Opening the menu should not also select this node
                onClick={(event) => event.stopPropagation()}
                size="icon-sm"
                variant="outline"
              >
                <Icon icon={Add01Icon} size={13} />
              </Button>
            </AddStepMenu>
          </div>
        ))}
    </div>
  );
}
