"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger as SelectTriggerUI,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Separator } from "@delulu/design-system/components/ui/separator";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  AtIcon,
  Comment01Icon,
  InstagramIcon,
  UserStoryIcon,
} from "@delulu/icons";
import type { ReactNode } from "react";
import { CommentReplyEditor } from "@/features/automations/flow-builder/panels/comment-reply-editor";
import { KeywordFilterFields } from "@/features/automations/flow-builder/panels/keyword-filter-fields";
import type {
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
    label: "Comment on a post or Reel",
    description: "Fires when a user comments on your post or reel",
    icon: Comment01Icon,
    enabled: true,
  },
  {
    type: "MENTION",
    label: "Mention of your account",
    description: "Fires when a user mentions you",
    icon: AtIcon,
    enabled: false,
  },
  {
    type: "STORY_REPLY",
    label: "Reply to your story",
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
  const isStory = trigger.triggerType === "STORY_REPLY";

  return (
    <div className="space-y-5">
      <Field label="Instagram account">
        {instagramProviders.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No Instagram accounts connected.
          </p>
        ) : (
          <Select
            onValueChange={onSocialProviderChange}
            value={socialProviderId}
          >
            <SelectTriggerUI aria-label="Instagram account" className="w-full">
              <SelectValue placeholder="Choose an account" />
            </SelectTriggerUI>
            <SelectContent>
              {instagramProviders.map((provider) => (
                <SelectItem key={provider._id} value={provider._id}>
                  <Icon icon={InstagramIcon} size={14} />@
                  {provider.username || provider.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Starts when">
        <Select
          onValueChange={(value) =>
            onChange({
              ...trigger,
              triggerType: value as AutomationTriggerType,
            })
          }
          value={trigger.triggerType}
        >
          <SelectTriggerUI aria-label="Starts when" className="w-full">
            <SelectValue />
          </SelectTriggerUI>
          <SelectContent>
            {TRIGGER_TYPE_OPTIONS.map((option) => (
              <SelectItem
                disabled={!option.enabled}
                key={option.type}
                value={option.type}
              >
                <Icon icon={option.icon} size={14} />
                {option.label}
                {option.enabled ? null : (
                  <span className="text-muted-foreground text-xs">Soon</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={isStory ? "Stories" : "Posts"}>
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
      </Field>

      <Field label={isStory ? "Reply text" : "Comment text"}>
        <KeywordFilterFields
          filter={trigger.keywordFilter}
          onChange={(keywordFilter) => onChange({ ...trigger, keywordFilter })}
        />
      </Field>

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="font-medium text-muted-foreground text-xs">{label}</h3>
      {children}
    </section>
  );
}
