"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@delulu/design-system/components/ui/popover";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, FilterIcon, MailSend01Icon } from "@delulu/icons";
import { useState } from "react";

interface AddStepMenuProps {
  onAddCondition: () => void;
  onAddSendDm: () => void;
}

export function AddStepMenu({ onAddCondition, onAddSendDm }: AddStepMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="w-7 rounded-full border-dashed"
          size="icon"
          variant="outline"
        >
          <Icon icon={Add01Icon} size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-48 p-1">
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
          onClick={() => {
            onAddCondition();
            setOpen(false);
          }}
          type="button"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/15">
            <Icon className="text-amber-500" icon={FilterIcon} size={14} />
          </div>
          Condition
        </button>
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
          onClick={() => {
            onAddSendDm();
            setOpen(false);
          }}
          type="button"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/15">
            <Icon className="text-green-500" icon={MailSend01Icon} size={14} />
          </div>
          Send DM
        </button>
      </PopoverContent>
    </Popover>
  );
}
