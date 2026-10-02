"use client";

import type { NodeProps } from "@xyflow/react";
import type { Note } from "../utils/flow-types";

export function NoteNode({ data, selected }: NodeProps) {
  const note = data.note as Note;

  return (
    <div
      className={`rounded-lg border px-4 py-3 shadow-sm transition-all ${
        selected
          ? "border-amber-400 bg-amber-50 ring-1 ring-amber-400/30"
          : "border-amber-200 bg-amber-50 hover:border-amber-300"
      }`}
      style={{ minWidth: 200, maxWidth: 360 }}
    >
      <p className="whitespace-pre-wrap text-amber-900 text-sm leading-relaxed">
        {note.content || "Click to edit note..."}
      </p>
    </div>
  );
}
