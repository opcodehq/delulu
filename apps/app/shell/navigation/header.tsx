"use client";

import { UserButton } from "@delulu/auth";
import { SidebarTrigger } from "@delulu/design-system/components/ui/sidebar";
import { CreditCard } from "@delulu/design-system/icons";
import { cn } from "@delulu/design-system/lib/utils";
import type { ReactNode } from "react";

interface HeaderProps {
  /** Breadcrumb trail — kept for API compatibility; not rendered. */
  pages?: string[];
  /** Current page / title. */
  page: string;
  /** Optional larger title; defaults to `page`. */
  title?: string;
  description?: ReactNode;
  /** Right-aligned actions (usually the primary button). */
  children?: ReactNode;
  className?: string;
}

/**
 * Compact page header: sidebar trigger + title/description on the left,
 * actions + mobile user menu on the right. One slim row for every page.
 */
export const Header = ({
  page,
  title,
  description,
  children,
  className,
}: HeaderProps) => (
  <header
    className={cn(
      "flex min-h-12 shrink-0 items-center justify-between gap-3 px-4 py-2 md:px-4",
      className
    )}
  >
    <div className="flex min-w-0 items-center gap-2">
      <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <h1 className="truncate font-semibold text-base leading-tight tracking-tight">
          {title ?? page}
        </h1>
        {description && (
          <p className="truncate text-muted-foreground text-xs leading-tight">
            {description}
          </p>
        )}
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {children}
      <div className="md:hidden">
        <UserButton>
          <UserButton.MenuItems>
            <UserButton.Action
              label="Billing"
              labelIcon={<CreditCard className="h-4 w-4" />}
              onClick={() => {
                window.location.href = "/billing";
              }}
            />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    </div>
  </header>
);
