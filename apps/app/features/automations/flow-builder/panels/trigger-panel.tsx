"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger as SelectTriggerUI,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Separator } from "@delulu/design-system/components/ui/separator";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AtIcon,
  Comment01Icon,
  InstagramIcon,
  UserStoryIcon,
} from "@delulu/icons";
import { CommentReplyEditor } from "@/features/automations/flow-builder/panels/comment-reply-editor";
import type {
  AutomationConditionOperator,
  AutomationTriggerType,
  CommentReply,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";
import { PostSelector } from "@/features/automations/post-selector";

interface SocialProvider {
  _id: string;
  username?: string;
  fullName?: string;
  profileImageUrl?: string;
}

interface TriggerPanelProps {
  trigger: TriggerStep;
  socialProviderId: string;
  instagramProviders: SocialProvider[];
  onSocialProviderChange: (id: string) => void;
  onChange: (trigger: TriggerStep) => void;
}

const TRIGGER_TYPE_OPTIONS: {
  type: AutomationTriggerType;
  label: string;
  description: string;
  icon: typeof Comment01Icon;
  enabled: boolean;
}[] = [
  {
    type: "COMMENT",
    label: "Post or Reel Comments",
    description: "Fires when a user comments on your post or reel",
    icon: Comment01Icon,
    enabled: true,
  },
  {
    type: "MENTION",
    label: "Mentions",
    description: "Fires when a user mentions you",
    icon: AtIcon,
    enabled: false,
  },
  {
    type: "STORY_REPLY",
    label: "Story Replies",
    description: "Fires when a user replies to your story",
    icon: UserStoryIcon,
    enabled: true,
  },
];

export function TriggerPanel({
  trigger,
  socialProviderId,
  instagramProviders,
  onSocialProviderChange,
  onChange,
}: TriggerPanelProps) {
  return (
    <div className="space-y-6">
      {/* Instagram Account */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Instagram Account</Label>
          <p className="text-muted-foreground text-xs">
            Which account runs this automation?
          </p>
        </div>
        <div className="grid gap-2">
          {instagramProviders.map((provider) => (
            <button
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                socialProviderId === provider._id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/50"
              )}
              key={provider._id}
              onClick={() => onSocialProviderChange(provider._id)}
              type="button"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                <Icon className="text-white" icon={InstagramIcon} size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-xs">
                  @{provider.username || provider.fullName}
                </p>
                <p className="text-[11px] text-muted-foreground">Instagram</p>
              </div>
            </button>
          ))}
          {instagramProviders.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No Instagram accounts connected.
            </p>
          )}
        </div>
      </div>

      {/* Trigger Type */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Trigger Type</Label>
          <p className="text-muted-foreground text-xs">
            What event should fire this trigger?
          </p>
        </div>
        <div className="grid gap-2">
          {TRIGGER_TYPE_OPTIONS.map((option) => (
            <button
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                !option.enabled && "cursor-not-allowed opacity-50",
                option.enabled && trigger.triggerType === option.type
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border",
                option.enabled &&
                  trigger.triggerType !== option.type &&
                  "hover:border-primary/50"
              )}
              disabled={!option.enabled}
              key={option.type}
              onClick={() =>
                option.enabled &&
                onChange({ ...trigger, triggerType: option.type })
              }
              type="button"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                <Icon className="text-white" icon={option.icon} size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-xs">{option.label}</p>
                  {!option.enabled && (
                    <Badge className="text-[10px]" variant="secondary">
                      SOON
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Target Posts / Stories */}
      <div className="space-y-2">
        <Label>
          {trigger.triggerType === "STORY_REPLY"
            ? "Target Stories"
            : "Target Posts"}
        </Label>
        <p className="text-muted-foreground text-xs">
          {trigger.triggerType === "STORY_REPLY"
            ? "Select which stories this trigger monitors."
            : "Select which posts this trigger monitors."}
        </p>
        <PostSelector
          onSelectionChange={(postIds) =>
            onChange({ ...trigger, targetPostIds: postIds })
          }
          onTargetModeChange={(targetMode) =>
            onChange({
              ...trigger,
              targetMode,
              targetPostIds: targetMode === "all" ? [] : trigger.targetPostIds,
            })
          }
          selectedPostIds={trigger.targetPostIds}
          socialProviderId={socialProviderId || null}
          targetMode={trigger.targetMode}
          triggerType={trigger.triggerType}
        />
      </div>

      {/* Keyword Filter */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Keyword Filter</Label>
          <p className="text-muted-foreground text-xs">
            Filter which comments trigger this automation.
          </p>
        </div>
        <div className="grid gap-2">
          <button
            className={cn(
              "rounded-lg border p-3 text-left transition-all",
              !trigger.keywordFilter ||
                trigger.keywordFilter.operator === "always"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/50"
            )}
            onClick={() => onChange({ ...trigger, keywordFilter: undefined })}
            type="button"
          >
            <p className="font-medium text-xs">Any comment</p>
            <p className="text-[11px] text-muted-foreground">
              Trigger on every comment
            </p>
          </button>
          <button
            className={cn(
              "rounded-lg border p-3 text-left transition-all",
              trigger.keywordFilter &&
                trigger.keywordFilter.operator !== "always"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/50"
            )}
            onClick={() =>
              onChange({
                ...trigger,
                keywordFilter:
                  trigger.keywordFilter?.operator !== "always" &&
                  trigger.keywordFilter
                    ? trigger.keywordFilter
                    : {
                        operator: "contains",
                        value: "",
                        caseSensitive: false,
                      },
              })
            }
            type="button"
          >
            <p className="font-medium text-xs">Specific keyword</p>
            <p className="text-[11px] text-muted-foreground">
              Only trigger on matching comments
            </p>
          </button>
        </div>
        {trigger.keywordFilter &&
          trigger.keywordFilter.operator !== "always" && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <Select
                onValueChange={(value) =>
                  onChange({
                    ...trigger,
                    keywordFilter: {
                      ...trigger.keywordFilter!,
                      operator: value as AutomationConditionOperator,
                    },
                  })
                }
                value={trigger.keywordFilter.operator}
              >
                <SelectTriggerUI>
                  <SelectValue />
                </SelectTriggerUI>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="not_contains">Does not contain</SelectItem>
                  <SelectItem value="equals">Equals exactly</SelectItem>
                  <SelectItem value="starts_with">Starts with</SelectItem>
                  <SelectItem value="ends_with">Ends with</SelectItem>
                  <SelectItem value="regex">Matches regex</SelectItem>
                </SelectContent>
              </Select>
              <Input
                onChange={(e) =>
                  onChange({
                    ...trigger,
                    keywordFilter: {
                      ...trigger.keywordFilter!,
                      value: e.target.value,
                    },
                  })
                }
                placeholder="Enter keyword..."
                value={trigger.keywordFilter.value || ""}
              />
              <div className="flex items-center justify-between">
                <Label htmlFor="trigger-case-sensitive">Case sensitive</Label>
                <Switch
                  checked={trigger.keywordFilter.caseSensitive ?? false}
                  id="trigger-case-sensitive"
                  onCheckedChange={(checked) =>
                    onChange({
                      ...trigger,
                      keywordFilter: {
                        ...trigger.keywordFilter!,
                        caseSensitive: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
          )}
      </div>

      {/* Comment Reply — only for COMMENT triggers */}
      {trigger.triggerType === "COMMENT" && (
        <>
          <Separator />
          <CommentReplyEditor
            commentReply={trigger.commentReply}
            onChange={(commentReply: CommentReply) =>
              onChange({ ...trigger, commentReply })
            }
          />
        </>
      )}
    </div>
  );
}
