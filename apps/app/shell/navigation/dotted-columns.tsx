import { cn } from "@delulu/design-system/lib/utils";
import { Children, Fragment, isValidElement, type ReactNode } from "react";

const columnTemplate = {
  md: {
    2: "md:grid-cols-[1fr_auto_1fr]",
    3: "md:grid-cols-[1fr_auto_1fr_auto_1fr]",
  },
  lg: {
    2: "lg:grid-cols-[1fr_auto_1fr]",
    3: "lg:grid-cols-[1fr_auto_1fr_auto_1fr]",
  },
} as const;

const dividerVisibility = { md: "md:block", lg: "lg:block" } as const;

/**
 * Lays out 2–3 cards side by side with a connecting dotted divider between each
 * (matching the dashboard). Dividers are dedicated auto-width grid columns that
 * self-stretch to the row height and bleed into the section gaps so they meet
 * the horizontal rules above/below. Stacks (no dividers) below the breakpoint.
 */
export function DottedColumns({
  children,
  breakpoint = "md",
  className,
}: {
  children: ReactNode;
  breakpoint?: "md" | "lg";
  className?: string;
}) {
  const items = Children.toArray(children);
  const count = items.length === 3 ? 3 : 2;

  return (
    <div
      className={cn(
        "grid items-stretch gap-x-8 gap-y-4",
        columnTemplate[breakpoint][count],
        className
      )}
    >
      {items.map((child, index) => (
        <Fragment
          key={isValidElement(child) && child.key ? child.key : `col-${index}`}
        >
          {index > 0 && (
            <div
              aria-hidden
              className={cn(
                "relative hidden self-stretch",
                dividerVisibility[breakpoint]
              )}
            >
              <span className="pointer-events-none absolute -top-5 -bottom-5 left-1/2 border-zinc-950/10 border-l-[1.5px] border-dotted dark:border-white/10" />
            </div>
          )}
          {child}
        </Fragment>
      ))}
    </div>
  );
}
