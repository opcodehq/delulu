"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@delulu/design-system/components/ui/popover";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
} from "@delulu/icons";
import type { AutomationMeta } from "@/features/automations/flow-builder/utils/flow-types";
import { AppLink as Link } from "@/shell/navigation/app-link";

interface FlowToolbarProps {
  automationMeta: AutomationMeta;
  onMetaChange: (meta: AutomationMeta) => void;
  isNew: boolean;
  isDirty: boolean;
  isSaving: boolean;
  /** Everything that must be fixed before the automation can run. */
  issues: string[];
  canSave?: boolean;
  onSave: () => void;
  onToggleActive: (active: boolean) => void;
}

export function FlowToolbar({
  automationMeta,
  onMetaChange,
  isNew,
  isDirty,
  isSaving,
  issues,
  canSave = true,
  onSave,
  onToggleActive,
}: FlowToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-border border-b bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-label="Back to automations"
          asChild
          size="icon"
          variant="ghost"
        >
          <Link href="/automations">
            <Icon icon={ArrowLeft01Icon} size={18} />
          </Link>
        </Button>
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm"
        >
          <Link
            className="hidden shrink-0 text-muted-foreground transition-colors hover:text-foreground md:inline"
            href="/automations"
          >
            DM Automations
          </Link>
          <Icon
            className="hidden shrink-0 text-muted-foreground md:inline"
            icon={ArrowRight01Icon}
            size={14}
          />
          <Input
            aria-label="Automation name"
            className="field-sizing-content h-9 min-w-[16ch] max-w-[320px] border-transparent bg-transparent font-semibold shadow-none hover:border-border focus-visible:ring-1"
            disabled={!canSave}
            onChange={(e) =>
              onMetaChange({ ...automationMeta, name: e.target.value })
            }
            placeholder="Untitled automation"
            value={automationMeta.name}
          />
        </nav>
        <Badge
          className="shrink-0"
          variant={
            isNew
              ? "secondary"
              : automationMeta.isActive
                ? "green"
                : "secondary"
          }
        >
          {isNew ? "Draft" : automationMeta.isActive ? "Live" : "Paused"}
        </Badge>
        {isDirty && !isSaving ? (
          <span className="hidden shrink-0 text-muted-foreground text-xs lg:inline">
            Unsaved changes
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {issues.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                className="text-amber-700 dark:text-amber-400"
                variant="ghost"
              >
                <Icon icon={Alert02Icon} size={16} />
                {issues.length} to fix
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <p className="font-medium text-sm">Before this can go live</p>
              <ul className="mt-2 space-y-1.5">
                {issues.map((issue) => (
                  <li
                    className="flex gap-2 text-muted-foreground text-sm"
                    key={issue}
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    {issue}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Icon
              className="text-green-600 dark:text-green-400"
              icon={CheckmarkCircle02Icon}
              size={16}
            />
            Ready
          </span>
        )}
        <div className="flex items-center gap-2">
          <Switch
            checked={automationMeta.isActive}
            disabled={!canSave}
            id="active-toggle"
            onCheckedChange={onToggleActive}
          />
          <Label htmlFor="active-toggle">Live</Label>
        </div>

        <Button
          disabled={isSaving || !canSave}
          onClick={onSave}
          variant={isDirty || isNew ? "default" : "outline"}
        >
          {isSaving ? (
            <>
              <Icon className="animate-spin" icon={Loading03Icon} size={16} />
              Saving...
            </>
          ) : isNew ? (
            "Create automation"
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
