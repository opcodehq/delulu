"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowLeft01Icon, Loading03Icon } from "@delulu/icons";
import type { AutomationMeta } from "@/features/automations/flow-builder/utils/flow-types";
import { AppLink as Link } from "@/shell/navigation/app-link";

interface FlowToolbarProps {
  automationMeta: AutomationMeta;
  onMetaChange: (meta: AutomationMeta) => void;
  isDirty: boolean;
  isSaving: boolean;
  canSave?: boolean;
  onSave: () => void;
  onToggleActive: (active: boolean) => void;
}

export function FlowToolbar({
  automationMeta,
  onMetaChange,
  isDirty,
  isSaving,
  canSave = true,
  onSave,
  onToggleActive,
}: FlowToolbarProps) {
  return (
    <div className="flex items-center justify-between border-border border-b bg-background px-4 py-2.5">
      <div className="flex items-center gap-3">
        <Link href="/automations">
          <Button className="w-8" size="icon" variant="ghost">
            <Icon icon={ArrowLeft01Icon} size={18} />
          </Button>
        </Link>
        <Input
          className="h-8 w-[240px] border-none bg-transparent font-semibold text-base shadow-none focus-visible:ring-1"
          disabled={!canSave}
          onChange={(e) =>
            onMetaChange({ ...automationMeta, name: e.target.value })
          }
          placeholder="Untitled automation"
          value={automationMeta.name}
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs" htmlFor="active-toggle">
            {automationMeta.isActive ? "Active" : "Inactive"}
          </Label>
          <Switch
            checked={automationMeta.isActive}
            disabled={!canSave}
            id="active-toggle"
            onCheckedChange={onToggleActive}
          />
        </div>

        <Button
          disabled={isSaving || !canSave}
          onClick={onSave}
          size="sm"
          variant={isDirty ? "default" : "outline"}
        >
          {isSaving ? (
            <>
              <Icon
                className="mr-1 animate-spin"
                icon={Loading03Icon}
                size={14}
              />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
