"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { AtIcon, Comment01Icon, UserStoryIcon } from "@delulu/icons";
import type { AutomationTriggerType } from "../utils/flow-types";

interface TriggerOption {
  type: AutomationTriggerType;
  title: string;
  description: string;
  icon: typeof Comment01Icon;
  enabled: boolean;
}

const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    type: "COMMENT",
    title: "Post or Reel Comments",
    description: "User comments on your Post or Reel",
    icon: Comment01Icon,
    enabled: true,
  },
  {
    type: "MENTION",
    title: "Mentions",
    description: "User mentions you in their post or story",
    icon: AtIcon,
    enabled: false,
  },
  {
    type: "STORY_REPLY",
    title: "Story Replies",
    description: "User replies to your Instagram story",
    icon: UserStoryIcon,
    enabled: true,
  },
];

interface TriggerTypeStepProps {
  selectedType: AutomationTriggerType | null;
  onSelect: (type: AutomationTriggerType) => void;
}

export function TriggerTypeStep({
  selectedType,
  onSelect,
}: TriggerTypeStepProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Choose Trigger Type</h3>
        <p className="text-muted-foreground text-sm">
          What event should start this automation?
        </p>
      </div>
      <div className="grid gap-3">
        {TRIGGER_OPTIONS.map((option) => (
          <button
            className={cn(
              "flex items-center gap-4 rounded-xl border p-4 text-left transition-all",
              !option.enabled && "cursor-not-allowed opacity-60",
              option.enabled && selectedType === option.type
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border",
              option.enabled &&
                selectedType !== option.type &&
                "hover:border-primary/50"
            )}
            disabled={!option.enabled}
            key={option.type}
            onClick={() => option.enabled && onSelect(option.type)}
            type="button"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
              <Icon className="text-white" icon={option.icon} size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{option.title}</p>
                {!option.enabled && (
                  <Badge className="text-[10px]" variant="secondary">
                    COMING SOON
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {option.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
