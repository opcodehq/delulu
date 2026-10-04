"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowDown01Icon } from "@delulu/icons";
import { useState } from "react";
import {
  type AddableStepType,
  FLOW_NODE_KINDS,
  type FlowNodeKind,
} from "@/features/automations/flow-builder/step-kinds";

interface PaletteItem {
  kind: FlowNodeKind;
  onSelect: () => void;
}

interface StepPaletteProps {
  onAddTrigger: () => void;
  onAddStep: (type: AddableStepType) => void;
  onAddNote: () => void;
  /** Label of the node new steps attach to, when there is one. */
  insertTargetLabel?: string;
}

export function StepPalette({
  onAddTrigger,
  onAddStep,
  onAddNote,
  insertTargetLabel,
}: StepPaletteProps) {
  const [expanded, setExpanded] = useState(true);
  const sections: { title: string; items: PaletteItem[] }[] = [
    {
      title: "Start",
      items: [{ kind: "trigger", onSelect: onAddTrigger }],
    },
    {
      title: "Messages",
      items: [{ kind: "send_dm", onSelect: () => onAddStep("send_dm") }],
    },
    {
      title: "Logic",
      items: [{ kind: "condition", onSelect: () => onAddStep("condition") }],
    },
    {
      title: "Canvas",
      items: [{ kind: "note", onSelect: onAddNote }],
    },
  ];

  return (
    <section
      aria-label="Steps"
      className="pointer-events-auto flex max-h-full w-48 flex-col overflow-hidden rounded-lg border bg-background shadow-xs"
    >
      <div className="flex items-center justify-between border-b py-0.5 pr-0.5 pl-2.5">
        <h2 className="font-medium text-xs">Steps</h2>
        <Button
          aria-controls="flow-step-palette"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse steps" : "Expand steps"}
          onClick={() => setExpanded((value) => !value)}
          size="icon-sm"
          variant="ghost"
        >
          <Icon
            className={cn("transition-transform", !expanded && "-rotate-90")}
            icon={ArrowDown01Icon}
            size={16}
          />
        </Button>
      </div>
      {expanded && (
        <div className="min-h-0 overflow-y-auto p-1" id="flow-step-palette">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-1.5 pt-1.5 pb-0.5 text-muted-foreground text-xs">
                {section.title}
              </p>
              {section.items.map((item) => {
                const kind = FLOW_NODE_KINDS[item.kind];
                return (
                  <button
                    aria-label={`Add ${kind.label}`}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    key={item.kind}
                    onClick={item.onSelect}
                    type="button"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded",
                        kind.tile
                      )}
                    >
                      <Icon icon={kind.icon} size={12} />
                    </span>
                    <span className="truncate text-sm">{kind.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <p className="mt-1 border-t px-1.5 pt-1.5 pb-0.5 text-muted-foreground text-xs">
            {insertTargetLabel
              ? `New steps connect below ${insertTargetLabel}.`
              : "Add a trigger to start the flow."}
          </p>
        </div>
      )}
    </section>
  );
}
