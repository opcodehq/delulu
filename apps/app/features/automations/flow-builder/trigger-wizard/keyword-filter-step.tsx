"use client";

import { KeywordFilterFields } from "@/features/automations/flow-builder/panels/keyword-filter-fields";
import type { KeywordFilter } from "@/features/automations/flow-builder/utils/flow-types";

interface KeywordFilterStepProps {
  filter: KeywordFilter | undefined;
  onChange: (filter: KeywordFilter | undefined) => void;
}

export function KeywordFilterStep({
  filter,
  onChange,
}: KeywordFilterStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Keyword Filter</h3>
        <p className="text-muted-foreground text-sm">
          Leave this off to respond to every comment.
        </p>
      </div>
      <KeywordFilterFields filter={filter} onChange={onChange} />
    </div>
  );
}
