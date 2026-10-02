"use client";

import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { Cancel01Icon, FilterIcon } from "@delulu/icons";
import type { ConditionStep } from "../utils/flow-types";

const OPERATOR_LABELS: Record<string, string> = {
  always: "Always (any comment)",
  contains: "Contains",
  not_contains: "Does not contain",
  equals: "Equals",
  starts_with: "Starts with",
  ends_with: "Ends with",
  regex: "Regex",
};

interface ConditionStepCardProps {
  step: ConditionStep;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
}

export function ConditionStepCard({
  step,
  isSelected,
  onClick,
  onRemove,
}: ConditionStepCardProps) {
  const label = OPERATOR_LABELS[step.operator] || step.operator;
  const hasValue = step.operator !== "always" && step.value;

  return (
    <button
      className={cn(
        "group relative w-full max-w-xs rounded-xl border px-4 py-3 text-left transition-all",
        isSelected
          ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30"
          : "border-border bg-card hover:border-amber-400/50 hover:bg-amber-500/5"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
          <Icon className="text-amber-500" icon={FilterIcon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Condition</p>
          <p className="truncate text-muted-foreground text-xs">
            {label}
            {hasValue ? `: "${step.value}"` : ""}
          </p>
        </div>
      </div>
      <button
        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-muted opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        type="button"
      >
        <Icon icon={Cancel01Icon} size={10} />
      </button>
    </button>
  );
}
