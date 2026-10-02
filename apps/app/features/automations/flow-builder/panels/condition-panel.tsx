"use client";

import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import type {
  AutomationConditionOperator,
  ConditionStep,
} from "../utils/flow-types";

const OPERATORS = [
  { value: "is_follower", label: "User follows you" },
  { value: "has_email", label: "User is a contact" },
];

function getConditionDescription(operator: string): string {
  switch (operator) {
    case "is_follower":
      return "Check if the user follows your Instagram account. The Yes path runs if they follow you, the No path runs otherwise.";
    case "has_email":
      return "Check if we have an email address stored for this user. The Yes path runs if email is known, the No path runs otherwise.";
    default:
      return "The Yes path runs when the condition matches. The No path runs otherwise.";
  }
}

interface ConditionPanelProps {
  step: ConditionStep;
  onChange: (step: ConditionStep) => void;
}

export function ConditionPanel({ step, onChange }: ConditionPanelProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="font-semibold text-sm">Condition</h3>
        <p className="text-muted-foreground text-xs">
          Route the flow based on a condition check.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Condition type</Label>
        <Select
          onValueChange={(value) =>
            onChange({
              ...step,
              operator: value as AutomationConditionOperator,
              value: undefined,
            })
          }
          value={step.operator}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-muted-foreground text-xs">
          {getConditionDescription(step.operator)}
        </p>
      </div>
    </div>
  );
}
