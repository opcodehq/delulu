"use client";

import {
  Draft,
  Home,
  Network,
  Pencil,
  Robot,
} from "@delulu/design-system/icons";
import { cn } from "@delulu/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileBottomTabs() {
  const pathname = usePathname();

  const tabs = [
    {
      title: "Home",
      url: "/",
      icon: Home,
    },
    {
      title: "Posts",
      url: "/posts",
      icon: Draft,
    },
    {
      title: "Create",
      url: "/post",
      icon: Pencil,
      isPrimary: true,
    },
    {
      title: "Agent",
      url: "/agent",
      icon: Robot,
    },
    {
      title: "Accounts",
      url: "/socials",
      icon: Network,
    },
  ];

  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 flex h-auto items-center justify-between border-t bg-background px-4 py-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(0,0,0,0.05)] md:hidden">
      {tabs.map((item) => {
        const isActive =
          pathname === item.url ||
          (item.url !== "/" && pathname?.startsWith(item.url));

        if (item.isPrimary) {
          return (
            <Link
              className="relative -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
              href={item.url}
              key={item.url}
            >
              <item.icon className="h-6 w-6" />
              <span className="sr-only">{item.title}</span>
            </Link>
          );
        }

        return (
          <Link
            className={cn(
              "flex flex-col items-center justify-center gap-1 font-medium text-[10px] transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-primary"
            )}
            href={item.url}
            key={item.url}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
