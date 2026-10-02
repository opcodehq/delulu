"use client";

import { SidebarProvider } from "@delulu/design-system/components/ui/sidebar";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FeatureTour } from "@/features/onboarding/feature-tour";
import { PageLoading } from "@/shell/loading";
import { MobileBottomTabs } from "@/shell/navigation/mobile-bottom-tabs";
import { PostHogIdentifier } from "@/shell/navigation/posthog-identifier";
import {
  NavigationProvider,
  RouteContent,
} from "@/shell/navigation/route-transition";
import { GlobalSidebar } from "@/shell/navigation/sidebar";
import { UserJotIdentifier } from "@/shell/navigation/userjot-identifier";
import { BackendProviders } from "@/shell/providers/backend";
import { useWorkspace } from "@/shell/providers/workspace";
import { ResourceBoundary } from "@/shell/state/resources";

function PageContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { workspaceId } = useWorkspace();
  return (
    <RouteContent>
      <ResourceBoundary
        fallback={<PageLoading />}
        key={`${workspaceId}:${pathname}`}
      >
        {children}
      </ResourceBoundary>
    </RouteContent>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <BackendProviders>
      <NavigationProvider>
        <SidebarProvider>
          <GlobalSidebar>
            <PageContent>{children}</PageContent>
          </GlobalSidebar>
          <PostHogIdentifier />
          <UserJotIdentifier />
          <ResourceBoundary>
            <FeatureTour />
          </ResourceBoundary>
          <MobileBottomTabs />
        </SidebarProvider>
      </NavigationProvider>
    </BackendProviders>
  );
}
