export type AutomationTriggerType = "COMMENT" | "MENTION" | "STORY_REPLY";
export type AutomationConditionOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "always"
  | "is_follower"
  | "has_email";

export interface CommentReply {
  enabled: boolean;
  replies: string[];
}

export interface KeywordFilter {
  operator: AutomationConditionOperator;
  value?: string;
  caseSensitive?: boolean;
}

export type DmButton =
  | {
      type: "quick_reply";
      title: string;
      payload: string;
      nextStepId?: string;
    }
  | { type: "url"; title: string; url: string };

export interface TriggerStep {
  id: string;
  type: "trigger";
  triggerType: AutomationTriggerType;
  targetMode: "specific" | "all";
  targetPostIds: string[];
  pendingPostIds?: string[];
  keywordFilter?: KeywordFilter;
  commentReply?: CommentReply;
  nextStepId?: string;
}

export interface ConditionStep {
  id: string;
  type: "condition";
  operator: AutomationConditionOperator;
  value?: string;
  caseSensitive?: boolean;
  yesStepId?: string;
  noStepId?: string;
}

export interface SendDmStep {
  id: string;
  type: "send_dm";
  messageTemplate: string;
  buttons?: DmButton[];
  commentReply?: CommentReply;
  nextStepId?: string;
}

export type AutomationStep = ConditionStep | SendDmStep;

export interface Note {
  id: string;
  content: string;
  position: { x: number; y: number };
}

export interface AutomationMeta {
  name: string;
  description: string;
  isActive: boolean;
  socialProviderId: string;
}
