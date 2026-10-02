"use client";

import { PostSelector } from "@/features/automations/post-selector";
import type { AutomationTriggerType } from "../utils/flow-types";

interface PostSelectorStepProps {
  socialProviderId: string;
  targetMode: "specific" | "all";
  selectedPostIds: string[];
  onTargetModeChange: (mode: "specific" | "all") => void;
  onSelectionChange: (postIds: string[]) => void;
  triggerType?: AutomationTriggerType;
}

export function PostSelectorStep({
  socialProviderId,
  targetMode,
  selectedPostIds,
  onTargetModeChange,
  onSelectionChange,
  triggerType,
}: PostSelectorStepProps) {
  const isStory = triggerType === "STORY_REPLY";

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">
          {isStory ? "Select Target Stories" : "Select Target Posts"}
        </h3>
        <p className="text-muted-foreground text-sm">
          {isStory
            ? "Which stories should this trigger monitor for replies?"
            : "Which posts should this trigger monitor for comments?"}
        </p>
      </div>
      <PostSelector
        onSelectionChange={onSelectionChange}
        onTargetModeChange={onTargetModeChange}
        selectedPostIds={selectedPostIds}
        socialProviderId={socialProviderId}
        targetMode={targetMode}
        triggerType={triggerType}
      />
    </div>
  );
}
