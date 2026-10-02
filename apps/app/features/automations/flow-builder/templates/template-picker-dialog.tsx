"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Add01Icon,
  Comment01Icon,
  MailSend01Icon,
  TickDouble01Icon,
  UserStoryIcon,
} from "@delulu/icons";
import { AUTOMATION_TEMPLATES } from "./automation-templates";

const TEMPLATE_ICONS: Record<string, typeof Comment01Icon> = {
  "grow-followers-comments": TickDouble01Icon,
  "grow-followers-stories": TickDouble01Icon,
  "email-collection": MailSend01Icon,
  "lead-magnet": Comment01Icon,
  "story-engagement": UserStoryIcon,
};

const TEMPLATE_GRADIENTS: Record<string, string> = {
  "grow-followers-comments": "from-purple-500 to-pink-500",
  "grow-followers-stories": "from-pink-500 to-rose-500",
  "email-collection": "from-blue-500 to-cyan-500",
  "lead-magnet": "from-amber-500 to-orange-500",
  "story-engagement": "from-green-500 to-emerald-500",
};

interface TemplatePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (slug: string | null) => void;
}

export function TemplatePickerDialog({
  open,
  onClose,
  onSelect,
}: TemplatePickerDialogProps) {
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Automation</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2 sm:grid-cols-2">
          {/* Start from Scratch */}
          <button
            className={cn(
              "flex items-center gap-4 rounded-xl border-2 border-dashed p-4 text-left transition-all",
              "border-border hover:border-primary/50"
            )}
            onClick={() => onSelect(null)}
            type="button"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-muted-foreground/30 border-dashed">
              <Icon
                className="text-muted-foreground"
                icon={Add01Icon}
                size={22}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">Start from Scratch</p>
              <p className="text-muted-foreground text-xs">
                Build your automation from the ground up
              </p>
            </div>
          </button>

          {/* Template cards */}
          {AUTOMATION_TEMPLATES.map((template) => {
            const TemplateIcon = TEMPLATE_ICONS[template.slug] || Comment01Icon;
            const gradient =
              TEMPLATE_GRADIENTS[template.slug] ||
              "from-purple-500 to-pink-500";

            return (
              <button
                className={cn(
                  "flex items-center gap-4 rounded-xl border p-4 text-left transition-all",
                  "border-border hover:border-primary/50"
                )}
                key={template.slug}
                onClick={() => onSelect(template.slug)}
                type="button"
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
                    gradient
                  )}
                >
                  <Icon className="text-white" icon={TemplateIcon} size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{template.name}</p>
                    <Badge className="text-[10px]" variant="secondary">
                      {template.stepCount}{" "}
                      {template.stepCount === 1 ? "step" : "steps"}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground text-xs">
                    {template.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
