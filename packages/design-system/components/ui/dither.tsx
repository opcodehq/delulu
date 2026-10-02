import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Ordered Bayer texture adapted from Dither Kit's button/pixel primitives,
 * registry version 0.1.0, by ripgrim: https://tripwire.sh/r/button.json.
 * Static SVG preserves the kit's texture without per-control canvases or RAFs.
 */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function DitherPattern({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill={color} fillOpacity="0.18" />
        {BAYER4.flatMap((row, y) => row.map((threshold, x) =>
          threshold < 8 ? <rect key={`${x}-${y}`} x={x * 2} y={y * 2} width="2" height="2" fill={color} /> : null
        ))}
      </pattern>
    </defs>
  );
}

export function EmptyState({ title, description, children, className }: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center", className)}>
      <div data-slot="dither-illustration" aria-hidden="true" className="mb-2 size-10 rounded-lg border border-primary/20 bg-primary/10" />
      <h2 className="font-medium text-sm">{title}</h2>
      {description && <p className="max-w-sm text-muted-foreground text-sm">{description}</p>}
      {children}
    </div>
  );
}
