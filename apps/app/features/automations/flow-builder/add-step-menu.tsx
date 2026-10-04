"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@delulu/design-system/components/ui/popover";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { type ReactNode, useState } from "react";
import {
  ADDABLE_STEP_TYPES,
  type AddableStepType,
  FLOW_NODE_KINDS,
} from "@/features/automations/flow-builder/step-kinds";

interface AddStepMenuProps {
  onAdd: (type: AddableStepType) => void;
  /** The element that opens the menu. */
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}

export function AddStepMenu({
  onAdd,
  children,
  align = "center",
  side = "bottom",
}: AddStepMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-60 p-1"
        // React events bubble out of the portal into canvas nodes; a pick
        // here must not also select the node that opened the menu
        onClick={(event) => event.stopPropagation()}
        side={side}
      >
        {ADDABLE_STEP_TYPES.map((type) => {
          const kind = FLOW_NODE_KINDS[type];
          return (
            <button
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              key={type}
              onClick={() => {
                setOpen(false);
                onAdd(type);
              }}
              type="button"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded",
                  kind.tile
                )}
              >
                <Icon icon={kind.icon} size={13} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-sm">{kind.label}</span>
                <span className="block text-muted-foreground text-xs">
                  {kind.description}
                </span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
