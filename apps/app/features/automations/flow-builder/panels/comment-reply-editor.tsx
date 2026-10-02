"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Delete02Icon } from "@delulu/icons";
import type { CommentReply } from "@/features/automations/flow-builder/utils/flow-types";

interface CommentReplyEditorProps {
  commentReply: CommentReply | undefined;
  onChange: (commentReply: CommentReply) => void;
}

const DEFAULT_REPLIES = [
  "Check your DMs! \ud83d\udce9",
  "DM sent! \ud83c\udf89",
  "Sent you a message \u2709\ufe0f",
];

export function CommentReplyEditor({
  commentReply,
  onChange,
}: CommentReplyEditorProps) {
  const enabled = commentReply?.enabled ?? false;
  const replies = commentReply?.replies ?? [];

  const handleToggle = (checked: boolean) => {
    onChange({
      enabled: checked,
      replies: replies.length > 0 ? replies : DEFAULT_REPLIES,
    });
  };

  const addReply = () => {
    onChange({ enabled, replies: [...replies, ""] });
  };

  const updateReply = (index: number, value: string) => {
    const newReplies = [...replies];
    newReplies[index] = value;
    onChange({ enabled, replies: newReplies });
  };

  const removeReply = (index: number) => {
    onChange({ enabled, replies: replies.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Reply to Comment</Label>
          <p className="text-muted-foreground text-xs">
            Publicly reply to the comment after sending a DM
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            One reply is picked randomly from this list:
          </p>
          {replies.map((reply, i) => (
            <div className="flex items-center gap-2" key={`reply-${i}`}>
              <Input
                className="flex-1"
                onChange={(e) => updateReply(i, e.target.value)}
                placeholder="e.g. Check your DMs!"
                value={reply}
              />
              <Button
                className="w-8 shrink-0"
                disabled={replies.length <= 1}
                onClick={() => removeReply(i)}
                size="icon"
                variant="ghost"
              >
                <Icon
                  className="text-destructive"
                  icon={Delete02Icon}
                  size={14}
                />
              </Button>
            </div>
          ))}
          <Button
            className="w-full"
            onClick={addReply}
            size="sm"
            variant="outline"
          >
            <Icon className="mr-1" icon={Add01Icon} size={14} />
            Add Reply Option
          </Button>
        </div>
      )}
    </div>
  );
}
