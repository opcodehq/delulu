"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { CloudUploadIcon } from "@delulu/icons";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { BulkVideo } from "./bulk-upload-reducer";

interface BulkDropzoneProps {
  onFilesSelected: (videos: BulkVideo[]) => void;
  disabled?: boolean;
}

export function BulkDropzone({ onFilesSelected, disabled }: BulkDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFiles = useCallback(
    (files: File[]) => {
      const videoFiles = files.filter((f) => f.type.startsWith("video/"));
      if (videoFiles.length === 0) {
        return;
      }

      const newVideos: BulkVideo[] = videoFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        uploadStatus: "pending" as const,
        validationErrors: [],
      }));

      onFilesSelected(newVideos);
    },
    [onFilesSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) {
        return;
      }
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles, disabled]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(Array.from(e.target.files || []));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processFiles]
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target only; keyboard/AT users select files via the accessible "Select Videos" button below
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag-and-drop target only; keyboard/AT users select files via the accessible "Select Videos" button below
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-input hover:bg-muted/30",
        disabled && "pointer-events-none opacity-50"
      )}
      onDragLeave={() => setIsDragOver(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDrop={handleDrop}
    >
      <input
        accept="video/*"
        className="hidden"
        multiple
        onChange={handleFileInput}
        ref={fileInputRef}
        type="file"
      />
      <Icon
        className="mb-3 text-muted-foreground"
        icon={CloudUploadIcon}
        size={40}
      />
      <p className="mb-1 font-medium text-sm">
        Drop videos here or click to browse
      </p>
      <p className="mb-4 text-muted-foreground text-xs">
        Each video will become a separate scheduled post
      </p>
      <Button
        onClick={() => fileInputRef.current?.click()}
        size="sm"
        variant="outline"
      >
        Select Videos
      </Button>
    </div>
  );
}
