"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@delulu/design-system/components/ui/tooltip";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, InformationCircleIcon } from "@delulu/icons";

interface AutomationsHeaderProps {
  onCreateClick: () => void;
  canCreate?: boolean;
}

export function AutomationsHeader({
  onCreateClick,
  canCreate = true,
}: AutomationsHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-foreground text-xl tracking-tight md:text-2xl">
              DM Automations
            </h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-6 w-6 shrink-0"
                    size="icon"
                    variant="ghost"
                  >
                    <Icon
                      className="text-muted-foreground"
                      icon={InformationCircleIcon}
                      size={16}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Set up triggers for your Instagram posts. When someone
                    comments a specific keyword, Delulu sends them a DM with
                    your link and replies to their comment.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-0.5 hidden text-muted-foreground text-sm md:block">
            Turn Instagram comments into sales. Someone comments a keyword →
            they get a DM with your link. Automatically.
          </p>
        </div>
        <Button
          className="shrink-0 gap-2"
          disabled={!canCreate}
          onClick={onCreateClick}
        >
          <Icon icon={Add01Icon} size={16} />
          <span className="hidden sm:inline">Create Automation</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>
    </div>
  );
}
