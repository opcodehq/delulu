"use client";

import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { cn } from "@delulu/design-system/lib/utils";
import type {
  AutomationConditionOperator,
  KeywordFilter,
} from "../utils/flow-types";

const KEYWORD_OPERATORS: {
  value: AutomationConditionOperator;
  label: string;
}[] = [
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "equals", label: "Equals exactly" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "regex", label: "Matches regex" },
];

interface KeywordFilterStepProps {
  filter: KeywordFilter | undefined;
  onChange: (filter: KeywordFilter | undefined) => void;
}

export function KeywordFilterStep({
  filter,
  onChange,
}: KeywordFilterStepProps) {
  const isFiltering = !!filter && filter.operator !== "always";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Keyword Filter</h3>
        <p className="text-muted-foreground text-sm">
          Should this trigger respond to any comment, or only specific keywords?
        </p>
      </div>

      <div className="grid gap-3">
        <button
          className={cn(
            "rounded-xl border p-4 text-left transition-all",
            isFiltering
              ? "border-border hover:border-primary/50"
              : "border-primary bg-primary/5 ring-1 ring-primary/30"
          )}
          onClick={() => onChange(undefined)}
          type="button"
        >
          <p className="font-medium text-sm">Any comment</p>
          <p className="text-muted-foreground text-xs">
            Trigger on every comment (no filtering)
          </p>
        </button>

        <button
          className={cn(
            "rounded-xl border p-4 text-left transition-all",
            isFiltering
              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
              : "border-border hover:border-primary/50"
          )}
          onClick={() =>
            onChange({ operator: "contains", value: "", caseSensitive: false })
          }
          type="button"
        >
          <p className="font-medium text-sm">Specific keyword</p>
          <p className="text-muted-foreground text-xs">
            Only trigger when the comment matches a keyword or pattern
          </p>
        </button>
      </div>

      {isFiltering && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label>Match type</Label>
            <Select
              onValueChange={(value) =>
                onChange({
                  ...filter,
                  operator: value as AutomationConditionOperator,
                })
              }
              value={filter.operator}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEYWORD_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Keyword</Label>
            <Input
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              placeholder="e.g. FREE, LINK, INFO..."
              value={filter.value || ""}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="kf-case-sensitive">Case sensitive</Label>
            <Switch
              checked={filter.caseSensitive ?? false}
              id="kf-case-sensitive"
              onCheckedChange={(checked) =>
                onChange({ ...filter, caseSensitive: checked })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
