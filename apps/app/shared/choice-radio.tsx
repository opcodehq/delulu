"use client";

import { RadioGroupItem } from "@delulu/design-system/components/ui/radio-group";
import { cn } from "@delulu/design-system/lib/utils";
import type { ReactNode } from "react";

interface ChoiceRadioProps {
  /** Unique within the page; used to link the label to its radio. */
  id: string;
  value: string;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}

/** A borderless radio row with a label and one line of help text. */
export function ChoiceRadio({
  id,
  value,
  label,
  description,
  disabled = false,
}: ChoiceRadioProps) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/50",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-muted/60"
      )}
      htmlFor={id}
    >
      <RadioGroupItem
        aria-label={label}
        disabled={disabled}
        id={id}
        value={value}
      />
      <span className="min-w-0">
        <span className="block font-medium text-sm">{label}</span>
        {description && (
          <span className="block truncate text-muted-foreground text-xs">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
