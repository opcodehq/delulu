import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { cn } from "@delulu/design-system/lib/utils";
import type { ReactNode } from "react";
import { Header } from "./header";

interface PageShellProps {
  /** Breadcrumb trail (everything before the current page). */
  pages: string[];
  /** Current page label shown in the breadcrumb. */
  page: string;
  /** Large page title. Defaults to `page`. */
  title?: string;
  description?: ReactNode;
  /** Rendered in the breadcrumb header (right side) — usually the primary action. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Standard page chrome: breadcrumb header → title/description → full-bleed
 * dotted rule → constrained content column. Replicated across every page.
 */
export function PageShell({
  pages,
  page,
  title,
  description,
  actions,
  children,
  className,
}: PageShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header description={description} page={page} pages={pages} title={title}>
        {actions}
      </Header>
      <DottedSeparator fullBleed />
      {/* Internal scroll region: the app shell (SidebarInset) is bounded to
          ~98vh with overflow-hidden on desktop, so each page scrolls here. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Framed content column: dotted left/right borders run the full height
            of the scroll area (min-h-full) so they read as continuous rails;
            every full-bleed section rule connects to them. The top rule is the
            header's separator above. */}
        <div
          className={cn(
            "mx-auto min-h-full w-full max-w-6xl border-zinc-950/10 border-x-[1.5px] border-dotted px-4 pt-4 pb-20 md:pb-8 dark:border-white/10",
            className
          )}
        >
          <div className="dotted-sections">{children}</div>
          {/* Trailing rule marks the end of content; rails continue below it. */}
          <div className="-mx-4 mt-4 border-zinc-950/10 border-t-[1.5px] border-dotted dark:border-white/10" />
        </div>
      </div>
    </div>
  );
}

interface PageSectionProps {
  title?: ReactNode;
  action?: ReactNode;
  /** Unused — kept for API compatibility. Section dividers are drawn by the
   *  PageShell container (`dotted-sections`). */
  separator?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A titled section within a PageShell. Top-level sections are separated by
 * dotted rules automatically via the shell's `dotted-sections` container.
 */
export function PageSection({
  title,
  action,
  children,
  className,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            {title && (
              <h2 className="font-medium text-sm tracking-tight">{title}</h2>
            )}
            {action}
          </div>
          {/* Full-bleed dotted rule under the heading, meeting the frame rails. */}
          <div className="-mx-4 border-zinc-950/10 border-t-[1.5px] border-dotted dark:border-white/10" />
        </div>
      )}
      {children}
    </section>
  );
}
