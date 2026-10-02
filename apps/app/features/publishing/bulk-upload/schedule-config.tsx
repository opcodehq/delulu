"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Input } from "@delulu/design-system/components/ui/input";
import { NaturalDatePicker } from "@delulu/design-system/components/ui/natural-date-picker";
import { cn } from "@delulu/design-system/lib/utils";
import { format } from "date-fns";
import { useState } from "react";
import { computeScheduledAt } from "./bulk-upload-reducer";

const INTERVAL_PRESETS = [
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "6 hours", minutes: 360 },
  { label: "1 day", minutes: 1440 },
] as const;

interface ScheduleConfigProps {
  startDate: Date | null;
  intervalMinutes: number;
  videoCount: number;
  onStartDateChange: (date: Date | undefined) => void;
  onIntervalChange: (minutes: number) => void;
}

export function ScheduleConfig({
  startDate,
  intervalMinutes,
  videoCount,
  onStartDateChange,
  onIntervalChange,
}: ScheduleConfigProps) {
  const [isCustom, setIsCustom] = useState(
    !INTERVAL_PRESETS.some((p) => p.minutes === intervalMinutes)
  );
  const [customHours, setCustomHours] = useState(
    String(Math.round(intervalMinutes / 60))
  );

  const handlePresetClick = (minutes: number) => {
    setIsCustom(false);
    onIntervalChange(minutes);
  };

  const handleCustomChange = (value: string) => {
    setCustomHours(value);
    const hours = Number.parseFloat(value);
    if (!Number.isNaN(hours) && hours > 0) {
      onIntervalChange(Math.round(hours * 60));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 block font-medium text-muted-foreground text-sm">
          Start Date & Time
        </p>
        <NaturalDatePicker
          className="w-full"
          onChange={onStartDateChange}
          placeholder="Select start time..."
          value={startDate ?? undefined}
        />
      </div>

      <div>
        <p className="mb-2 block font-medium text-muted-foreground text-sm">
          Interval Between Posts
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {INTERVAL_PRESETS.map((preset) => (
            <Button
              className={cn("text-xs")}
              key={preset.minutes}
              onClick={() => handlePresetClick(preset.minutes)}
              size="sm"
              variant={
                !isCustom && intervalMinutes === preset.minutes
                  ? "default"
                  : "outline"
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            className="text-xs"
            onClick={() => setIsCustom(true)}
            size="sm"
            variant={isCustom ? "default" : "outline"}
          >
            Custom
          </Button>
          {isCustom && (
            <div className="flex items-center gap-1.5">
              <Input
                className="h-8 w-16 text-xs"
                min="0.5"
                onChange={(e) => handleCustomChange(e.target.value)}
                step="0.5"
                type="number"
                value={customHours}
              />
              <span className="text-muted-foreground text-xs">hours</span>
            </div>
          )}
        </div>
      </div>

      {startDate && videoCount > 0 && (
        <div>
          <p className="mb-2 block font-medium text-muted-foreground text-sm">
            Schedule Preview
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-2">
            {Array.from({ length: Math.min(videoCount, 5) }).map((_, i) => {
              const time = new Date(
                computeScheduledAt(i, startDate, intervalMinutes)
              );
              return (
                <div className="flex items-center gap-2 text-xs" key={i}>
                  <span className="font-medium text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span>{format(time, "MMM d, h:mm a")}</span>
                </div>
              );
            })}
            {videoCount > 5 && (
              <div className="text-muted-foreground text-xs">
                ... and {videoCount - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
