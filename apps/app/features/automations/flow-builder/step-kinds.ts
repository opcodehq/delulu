import {
  Comment01Icon,
  GitBranchIcon,
  MailSend01Icon,
  StickyNote01Icon,
} from "@delulu/icons";

export type FlowNodeKind = "trigger" | "send_dm" | "condition" | "note";

/** Step types that can be inserted into the flow from the canvas. */
export type AddableStepType = "send_dm" | "condition";

interface FlowNodeKindStyle {
  label: string;
  description: string;
  icon: typeof Comment01Icon;
  /** Icon and kind label color. */
  text: string;
  /** Small icon tile used in menus and the inspector header. */
  tile: string;
  /** Resting card border. */
  border: string;
  /** Selected card border and ring. */
  selected: string;
  /** Connection handle fill. */
  handle: string;
}

/**
 * One visual language per node kind, shared by the palette, add menus,
 * canvas nodes and the inspector so a step always looks the same.
 */
export const FLOW_NODE_KINDS: Record<FlowNodeKind, FlowNodeKindStyle> = {
  trigger: {
    label: "Trigger",
    description: "When someone comments or replies",
    icon: Comment01Icon,
    text: "text-purple-600 dark:text-purple-400",
    tile: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    border: "border-purple-500/30",
    selected: "border-purple-500 ring-2 ring-purple-500/25",
    handle: "!bg-purple-500",
  },
  send_dm: {
    label: "Send DM",
    description: "Message with link or reply buttons",
    icon: MailSend01Icon,
    text: "text-sky-600 dark:text-sky-400",
    tile: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    border: "border-sky-500/30",
    selected: "border-sky-500 ring-2 ring-sky-500/25",
    handle: "!bg-sky-500",
  },
  condition: {
    label: "Condition",
    description: "Branch on who they are",
    icon: GitBranchIcon,
    text: "text-amber-600 dark:text-amber-400",
    tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    selected: "border-amber-500 ring-2 ring-amber-500/25",
    handle: "!bg-amber-500",
  },
  note: {
    label: "Note",
    description: "Context for your team",
    icon: StickyNote01Icon,
    text: "text-yellow-600 dark:text-yellow-400",
    tile: "bg-yellow-400/20 text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-400/40",
    selected: "border-yellow-500 ring-2 ring-yellow-500/25",
    handle: "!bg-yellow-500",
  },
};

export const ADDABLE_STEP_TYPES: AddableStepType[] = ["send_dm", "condition"];

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  COMMENT: "Post or Reel comments",
  MENTION: "Mentions",
  STORY_REPLY: "Story replies",
};

export const CONDITION_LABELS: Record<string, string> = {
  is_follower: "User follows you",
  has_email: "User is a contact",
};

export const CONDITION_HINTS: Record<string, string> = {
  is_follower: "Yes if they follow your account, otherwise No",
  has_email: "Yes if you have their email, otherwise No",
};
