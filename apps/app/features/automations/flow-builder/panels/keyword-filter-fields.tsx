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
import { useId } from "react";
import type {
  AutomationConditionOperator,
  KeywordFilter,
} from "@/features/automations/flow-builder/utils/flow-types";

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

interface KeywordFilterFieldsProps {
  filter: KeywordFilter | undefined;
  onChange: (filter: KeywordFilter | undefined) => void;
}

/** Keyword filter for a trigger: off means every comment or reply counts. */
export function KeywordFilterFields({
  filter,
  onChange,
}: KeywordFilterFieldsProps) {
  const id = useId();
  const isFiltering = filter !== undefined && filter.operator !== "always";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-enabled`}>Only when it contains a keyword</Label>
        <Switch
          checked={isFiltering}
          id={`${id}-enabled`}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? { operator: "contains", value: "", caseSensitive: false }
                : undefined
            )
          }
        />
      </div>
      {isFiltering ? (
        <>
          <div className="flex gap-2">
            <Select
              onValueChange={(value) =>
                onChange({
                  ...filter,
                  operator: value as AutomationConditionOperator,
                })
              }
              value={filter.operator}
            >
              <SelectTrigger aria-label="Match" className="w-36 shrink-0">
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
            <Input
              aria-label="Keyword"
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              placeholder="e.g. GUIDE"
              value={filter.value || ""}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label
              className="font-normal text-muted-foreground text-xs"
              htmlFor={`${id}-case`}
            >
              Match case
            </Label>
            <Switch
              checked={filter.caseSensitive ?? false}
              id={`${id}-case`}
              onCheckedChange={(checked) =>
                onChange({ ...filter, caseSensitive: checked })
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
