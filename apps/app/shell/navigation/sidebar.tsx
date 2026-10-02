"use client";
import { UserButton } from "@delulu/auth";
import { Logo, LogoIcon } from "@delulu/design-system/components/logo";
import { ModeToggle } from "@delulu/design-system/components/mode-toggle";
import { Button } from "@delulu/design-system/components/ui/button";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@delulu/design-system/components/ui/sidebar";
import { useMediaQuery } from "@delulu/design-system/hooks/use-media-query";
import { CreditCard, Pencil } from "@delulu/design-system/icons";
import { cn } from "@delulu/design-system/lib/utils";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { navigationItems } from "@/shell/navigation";
import { useFeatureFlag } from "@/shell/use-feature-flag";
import { AppLink as Link } from "./app-link";
import { OrganizationSwitcher } from "./organization-switcher";
import { usePendingHref } from "./route-transition";

interface GlobalSidebarProperties {
  readonly children: ReactNode;
}

export const GlobalSidebar = ({ children }: GlobalSidebarProperties) => {
  const sidebar = useSidebar();
  const currentPathname = usePathname();
  const pendingHref = usePendingHref();
  const pathname = pendingHref?.split("?")[0] ?? currentPathname;
  const isSmallScreen = useMediaQuery("(max-width: 1299px)");
  const wasSmallScreen = useRef(false);
  const flagValues = {
    affiliates: useFeatureFlag("affiliates"),
    analytics: useFeatureFlag("analytics"),
  };
  const visibleNavItems = useMemo(
    () => navigationItems.filter((item) => !item.flag || flagValues[item.flag]),
    [flagValues.affiliates, flagValues.analytics]
  );

  // Collapse only when entering the narrow layout; preserve a manual expansion.
  useEffect(() => {
    if (isSmallScreen && !wasSmallScreen.current) {
      sidebar.setOpen(false);
    }
    wasSmallScreen.current = isSmallScreen;
  }, [isSmallScreen, sidebar]);

  return (
    <>
      <Sidebar
        className="group dark:bg-sidebar"
        collapsible="icon"
        variant="sidebar"
      >
        <SidebarHeader className="gap-2 p-3">
          <Link
            className="mb-2 flex items-center group-data-[state=collapsed]:justify-center"
            href="/"
          >
            <Logo className="group-data-[state=collapsed]:hidden" />
            <LogoIcon className="hidden size-7 group-data-[state=collapsed]:block" />
          </Link>
          <div className="mb-2 group-data-[state=collapsed]:hidden">
            <OrganizationSwitcher />
          </div>
          <Button
            asChild
            className="flex w-full items-center group-data-[state=collapsed]:hidden"
            data-tour="create-post"
          >
            <Link href="/post">
              <span className="mr-2 flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                <Pencil />
              </span>
              Create Post
            </Link>
          </Button>
          <Button
            aria-label="Create post"
            asChild
            className="w-full group-data-[state=expanded]:hidden"
            data-tour="create-post"
            size="icon"
          >
            <Link href="/post">
              <span className="flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                <Pencil />
              </span>
            </Link>
          </Button>
        </SidebarHeader>

        <DottedSeparator />

        <SidebarContent className="px-2 py-1">
          <SidebarMenu className="group-data-[state=collapsed]:items-center">
            {visibleNavItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "relative mb-0.5 h-8 select-none rounded-md px-3 font-medium transition-all",
                    pathname === item.url
                      ? "surface-raised text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                    "group-data-[state=collapsed]:justify-center"
                  )}
                  data-tour={item.dataTour}
                  size="default"
                  tooltip={{
                    children: item.title,
                    side: "right",
                    align: "center",
                    sideOffset: 10,
                  }}
                >
                  <Link
                    className={cn(
                      "flex items-center",
                      "group-data-[state=collapsed]:h-full group-data-[state=collapsed]:w-full group-data-[state=collapsed]:justify-center"
                    )}
                    href={item.url}
                  >
                    <span className="flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                      <item.icon />
                    </span>
                    <span className="ml-3 text-sm group-data-[state=collapsed]:hidden">
                      {item.title}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {/* <SidebarSeparator />
            {configurationItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  size="default"
                  className={cn(
                    'group rounded-md-lg px-3 transition-all hover:bg-accent hover:shadow-bevel-accent',
                    pathname === item.url &&
                      'bg-accent text-accent-foreground shadow-bevel-secondary',
                    'group-data-[state=collapsed]:justify-center'
                  )}
                  tooltip={{
                    children: item.title,
                    side: 'right',
                    align: 'center',
                    sideOffset: 10,
                  }}
                >
                  <Link
                    href={item.url}
                    className={cn(
                      'py-3',
                      'flex group-data-[state=collapsed]:h-full group-data-[state=collapsed]:w-full group-data-[state=collapsed]:items-center group-data-[state=collapsed]:justify-center group-data-[state=collapsed]:py-0'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-5 w-5',
                        pathname === item.url
                          ? 'text-sidebar-primary'
                          : 'text-sidebar-foreground'
                      )}
                    />
                    <span
                      className={cn(
                        'ml-3 text-base',
                        pathname === item.url && 'font-medium',
                        'group-data-[state=collapsed]:hidden'
                      )}
                    >
                      {item.title}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))} */}
          </SidebarMenu>
        </SidebarContent>

        <DottedSeparator />

        <SidebarFooter>
          <SidebarMenu className="group-data-[state=collapsed]:items-center">
            <SidebarMenuItem className="flex items-center justify-between gap-2 group-data-[state=collapsed]:flex-col group-data-[state=collapsed]:items-center group-data-[state=collapsed]:p-2">
              <div className="group-data-[state=collapsed]:mb-2">
                <UserButton
                  appearance={{
                    elements: {
                      rootBox:
                        "flex overflow-hidden w-full group-data-[state=collapsed]:justify-center",
                      userButtonOuterIdentifier:
                        "truncate pl-0 group-data-[state=collapsed]:hidden",
                      avatarBox:
                        "group-data-[state=collapsed]:w-8 group-data-[state=collapsed]:h-8",
                    },
                  }}
                  showName={sidebar?.state !== "collapsed"}
                >
                  <UserButton.MenuItems>
                    <UserButton.Link
                      href="/billing"
                      label="Billing"
                      labelIcon={<CreditCard className="h-4 w-4" />}
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </div>
              <div className="flex shrink-0 items-center gap-px">
                <ModeToggle />
                <Button
                  asChild
                  className="shrink-0"
                  size="icon"
                  variant="ghost"
                >
                  {/* <div className="h-4 w-4">
                    <NotificationsTrigger />
                  </div> */}
                </Button>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-[100dvh] flex-grow pb-20 md:max-h-[98vh] md:overflow-hidden md:pb-0">
        {children}
      </SidebarInset>
    </>
  );
};
