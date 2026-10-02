"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Add01Icon,
  Delete02Icon,
  Link01Icon,
  MessageMultiple01Icon,
} from "@delulu/icons";
import { nanoid } from "nanoid";
import type { DmButton } from "@/features/automations/flow-builder/utils/flow-types";
import { isValidUrl } from "@/features/automations/flow-builder/utils/flow-validation";

type ButtonAction = "send_message" | "check_condition" | "do_nothing";

interface ButtonEditorProps {
  buttons: DmButton[];
  onChange: (buttons: DmButton[]) => void;
  /** Called when a quick reply button needs a new step created for its nextStepId */
  onCreateStepForButton?: (
    buttonIndex: number,
    stepType: "send_dm" | "condition"
  ) => void;
  /** Called when a button's nextStepId should be removed */
  onRemoveStepForButton?: (buttonIndex: number) => void;
}

export function ButtonEditor({
  buttons,
  onChange,
  onCreateStepForButton,
  onRemoveStepForButton,
}: ButtonEditorProps) {
  const addQuickReply = () => {
    if (buttons.filter((b) => b.type === "quick_reply").length >= 13) {
      return;
    }
    onChange([
      ...buttons,
      { type: "quick_reply", title: "", payload: nanoid(10) },
    ]);
  };

  const addUrlButton = () => {
    if (buttons.filter((b) => b.type === "url").length >= 3) {
      return;
    }
    onChange([...buttons, { type: "url", title: "", url: "" }]);
  };

  const updateButton = (index: number, patch: Partial<DmButton>) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], ...patch } as DmButton;
    onChange(newButtons);
  };

  const removeButton = (index: number) => {
    const btn = buttons[index];
    if (
      btn.type === "quick_reply" &&
      "nextStepId" in btn &&
      btn.nextStepId &&
      onRemoveStepForButton
    ) {
      onRemoveStepForButton(index);
    }
    onChange(buttons.filter((_, i) => i !== index));
  };

  const getButtonAction = (btn: DmButton): ButtonAction => {
    if (btn.type !== "quick_reply") {
      return "do_nothing";
    }
    if ("nextStepId" in btn && btn.nextStepId) {
      return "send_message"; // or check_condition — we'll infer from the step type later
    }
    return "do_nothing";
  };

  const handleActionChange = (index: number, action: ButtonAction) => {
    const btn = buttons[index];
    if (btn.type !== "quick_reply") {
      return;
    }

    if (action === "do_nothing") {
      if ("nextStepId" in btn && btn.nextStepId && onRemoveStepForButton) {
        onRemoveStepForButton(index);
      }
      updateButton(index, { nextStepId: undefined } as Partial<DmButton>);
    } else if (action === "send_message" && onCreateStepForButton) {
      onCreateStepForButton(index, "send_dm");
    } else if (action === "check_condition" && onCreateStepForButton) {
      onCreateStepForButton(index, "condition");
    }
  };

  const quickReplyCount = buttons.filter(
    (b) => b.type === "quick_reply"
  ).length;
  const urlButtonCount = buttons.filter((b) => b.type === "url").length;

  return (
    <div className="space-y-3">
      <Label>DM Buttons</Label>
      <p className="text-muted-foreground text-xs">
        Add tappable buttons below your DM message.
      </p>

      {/* Button list */}
      <div className="space-y-2">
        {buttons.map((btn, i) => (
          <div
            className="space-y-2 rounded-lg border border-border p-2.5"
            key={`btn-${btn.type}-${i}`}
          >
            <div className="flex items-center gap-2">
              <Badge className="shrink-0 text-[10px]" variant="secondary">
                {btn.type === "quick_reply" ? "Reply" : "URL"}
              </Badge>
              <Input
                className="flex-1"
                maxLength={20}
                onChange={(e) => updateButton(i, { title: e.target.value })}
                placeholder="Button title (max 20 chars)"
                value={btn.title}
              />
              <Button
                className="w-7 shrink-0"
                onClick={() => removeButton(i)}
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

            {/* URL-specific: URL input */}
            {btn.type === "url" && "url" in btn && (
              <div className="space-y-1">
                <Input
                  className={
                    btn.url && btn.url.length > 0 && !isValidUrl(btn.url)
                      ? "border-destructive"
                      : ""
                  }
                  onChange={(e) =>
                    updateButton(i, {
                      url: e.target.value,
                    } as Partial<DmButton>)
                  }
                  placeholder="https://example.com"
                  value={btn.url}
                />
                {btn.url && btn.url.length > 0 && !isValidUrl(btn.url) && (
                  <p className="text-[11px] text-destructive">
                    Enter a valid URL starting with https://
                  </p>
                )}
              </div>
            )}

            {/* Quick reply: action selector */}
            {btn.type === "quick_reply" && onCreateStepForButton && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  When tapped
                </Label>
                <Select
                  onValueChange={(value) =>
                    handleActionChange(i, value as ButtonAction)
                  }
                  value={getButtonAction(btn)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="do_nothing">Do nothing</SelectItem>
                    <SelectItem value="send_message">Send message</SelectItem>
                    <SelectItem value="check_condition">
                      Check condition
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <div className="flex gap-2">
        {quickReplyCount < 13 && (
          <Button
            className="flex-1 gap-1.5"
            onClick={addQuickReply}
            size="sm"
            variant="outline"
          >
            <Icon icon={MessageMultiple01Icon} size={14} />
            Quick Reply ({quickReplyCount}/13)
          </Button>
        )}
        {urlButtonCount < 3 && (
          <Button
            className="flex-1 gap-1.5"
            onClick={addUrlButton}
            size="sm"
            variant="outline"
          >
            <Icon icon={Link01Icon} size={14} />
            URL Button ({urlButtonCount}/3)
          </Button>
        )}
      </div>
    </div>
  );
}
