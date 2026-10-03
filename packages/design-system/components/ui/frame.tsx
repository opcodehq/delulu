import type * as React from "react"

import { cn } from "@delulu/design-system/lib/utils"

type FrameGuides = "viewport" | "bleed" | "none"

const SIDES = ["left", "right", "top", "bottom"] as const

const guideClasses: Record<
  Exclude<FrameGuides, "none">,
  Record<(typeof SIDES)[number], string>
> = {
  viewport: {
    left: "top-1/2 left-0 h-screen -translate-y-1/2 border-l-[1.5px]",
    right: "top-1/2 right-0 h-screen -translate-y-1/2 border-l-[1.5px]",
    top: "top-0 left-1/2 w-screen -translate-x-1/2 border-t-[1.5px]",
    bottom: "bottom-0 left-1/2 w-screen -translate-x-1/2 border-t-[1.5px]",
  },
  bleed: {
    left: "top-[calc(var(--frame-bleed)*-1)] bottom-[calc(var(--frame-bleed)*-1)] left-0 border-l-[1.5px]",
    right:
      "top-[calc(var(--frame-bleed)*-1)] right-0 bottom-[calc(var(--frame-bleed)*-1)] border-l-[1.5px]",
    top: "top-0 right-[calc(var(--frame-bleed)*-1)] left-[calc(var(--frame-bleed)*-1)] border-t-[1.5px]",
    bottom:
      "right-[calc(var(--frame-bleed)*-1)] bottom-0 left-[calc(var(--frame-bleed)*-1)] border-t-[1.5px]",
  },
}

interface FrameProps extends React.ComponentProps<"div"> {
  /**
   * How far the four dotted guides run past the card edges: across the whole
   * viewport (standalone auth screens), a short bleed into the surrounding
   * gutter (`--frame-bleed`, 1rem by default), or not at all.
   */
  guides?: FrameGuides
  /** Classes for the outer wrapper that positions the guides. */
  frameClassName?: string
}

/**
 * Framed card: a raised card whose edges extend as dotted construction guides,
 * matching the page rails drawn by the app shell.
 */
function Frame({
  guides = "bleed",
  frameClassName,
  className,
  children,
  ...props
}: FrameProps) {
  return (
    <div
      className={cn("relative [--frame-bleed:1rem]", frameClassName)}
      data-slot="frame"
    >
      {guides !== "none" &&
        SIDES.map((side) => (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute border-dotted border-zinc-950/10 dark:border-white/10",
              guideClasses[guides][side]
            )}
            data-slot="frame-guide"
            key={side}
          />
        ))}
      <div
        className={cn(
          "relative z-10 rounded-xl border border-border/60 bg-card text-card-foreground shadow-(--shadow-card)",
          className
        )}
        data-slot="frame-card"
        {...props}
      >
        {children}
      </div>
    </div>
  )
}

/** Header row of a framed card, separated from its body by a dotted rule. */
function FrameHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-2 border-zinc-950/10 border-b-[1.5px] border-dotted px-4 py-2 dark:border-white/10",
        className
      )}
      data-slot="frame-header"
      {...props}
    />
  )
}

function FrameTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("font-medium text-sm tracking-tight", className)}
      data-slot="frame-title"
      {...props}
    />
  )
}

export { Frame, FrameHeader, FrameTitle }
export type { FrameGuides }
