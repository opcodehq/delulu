"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
} from "@delulu/icons";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import type { BulkVideo } from "./bulk-upload-reducer";
import { computeScheduledAt } from "./bulk-upload-reducer";

interface BulkVideoListProps {
  videos: BulkVideo[];
  startDate: Date | null;
  intervalMinutes: number;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onCaptionChange: (id: string, caption: string) => void;
  disabled?: boolean;
}

export function BulkVideoList({
  videos,
  startDate,
  intervalMinutes,
  onRemove,
  onMove,
  onCaptionChange,
  disabled,
}: BulkVideoListProps) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">
          {videos.length} {videos.length === 1 ? "video" : "videos"}
        </h3>
      </div>
      <AnimatePresence initial={false}>
        {videos.map((video, index) => (
          <BulkVideoCard
            disabled={disabled}
            index={index}
            intervalMinutes={intervalMinutes}
            isFirst={index === 0}
            isLast={index === videos.length - 1}
            key={video.id}
            onCaptionChange={onCaptionChange}
            onMove={onMove}
            onRemove={onRemove}
            startDate={startDate}
            video={video}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface BulkVideoCardProps {
  video: BulkVideo;
  index: number;
  startDate: Date | null;
  intervalMinutes: number;
  isFirst: boolean;
  isLast: boolean;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onCaptionChange: (id: string, caption: string) => void;
  disabled?: boolean;
}

function BulkVideoCard({
  video,
  index,
  startDate,
  intervalMinutes,
  isFirst,
  isLast,
  onRemove,
  onMove,
  onCaptionChange,
  disabled,
}: BulkVideoCardProps) {
  const scheduledTime = startDate
    ? new Date(computeScheduledAt(index, startDate, intervalMinutes))
    : null;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 rounded-lg border bg-card p-3"
      exit={{ opacity: 0, y: -10 }}
      initial={{ opacity: 0, y: 10 }}
      layout
    >
      <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        <video
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={`${video.previewUrl}#t=0.5`}
        >
          <track kind="captions" />
        </video>
        <UploadStatusOverlay status={video.uploadStatus} />
        {video.postStatus === "created" && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
            <Icon
              className="text-green-500"
              icon={CheckmarkCircle02Icon}
              size={20}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-xs">{video.file.name}</p>
            <p className="text-muted-foreground text-xs">
              {(video.file.size / (1024 * 1024)).toFixed(1)} MB
              {scheduledTime && (
                <span className="ml-2 text-primary">
                  {format(scheduledTime, "MMM d, h:mm a")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              className="h-6 w-6"
              disabled={isFirst || disabled}
              onClick={() => onMove(video.id, "up")}
              size="icon"
              variant="ghost"
            >
              <Icon icon={ArrowUp01Icon} size={12} />
            </Button>
            <Button
              className="h-6 w-6"
              disabled={isLast || disabled}
              onClick={() => onMove(video.id, "down")}
              size="icon"
              variant="ghost"
            >
              <Icon icon={ArrowDown01Icon} size={12} />
            </Button>
            <Button
              className="h-6 w-6 text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => onRemove(video.id)}
              size="icon"
              variant="ghost"
            >
              <Icon icon={Cancel01Icon} size={12} />
            </Button>
          </div>
        </div>

        <Textarea
          className="min-h-[2.5rem] resize-none text-xs"
          disabled={disabled}
          onChange={(e) => onCaptionChange(video.id, e.target.value)}
          placeholder="Add a caption..."
          rows={2}
          value={video.caption}
        />

        {video.validationErrors.length > 0 && (
          <div className="space-y-0.5">
            {video.validationErrors.map((error) => (
              <p className="text-destructive text-xs" key={error}>
                {error}
              </p>
            ))}
          </div>
        )}

        {video.postStatus === "failed" && (
          <p className="text-destructive text-xs">Failed to create post</p>
        )}
      </div>
    </motion.div>
  );
}

function UploadStatusOverlay({
  status,
}: {
  status: BulkVideo["uploadStatus"];
}) {
  if (status === "uploaded") {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center",
        status === "failed" ? "bg-destructive/30" : "bg-black/40"
      )}
    >
      {status === "uploading" || status === "pending" ? (
        <Icon
          className="animate-spin text-white"
          icon={Loading03Icon}
          size={16}
        />
      ) : (
        <span className="font-medium text-destructive text-xs">Failed</span>
      )}
    </div>
  );
}
