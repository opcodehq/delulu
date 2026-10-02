"use client";

import { Logo } from "@delulu/design-system/components/logo";
import { Button } from "@delulu/design-system/components/ui/button";
import { Skeleton } from "@delulu/design-system/components/ui/skeleton";
import type { ReactNode } from "react";
import { PageLoading } from "@/shell/loading";
import { ApiClientProvider, useApiClient } from "@/shell/providers/api-client";
import { WorkspaceProvider } from "@/shell/providers/workspace";
import { AppStateProvider, ResourceBoundary } from "@/shell/state/resources";

function OnboardingFrame({ children }: { readonly children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col border-zinc-950/10 border-x-[1.5px] border-dotted dark:border-white/10">
        <header className="flex h-16 items-center px-5 sm:px-6">
          <Logo />
        </header>
        <div className="border-zinc-950/10 border-t-[1.5px] border-dotted dark:border-white/10" />
        <div className="flex flex-1 items-start px-5 py-10 sm:px-6">
          <section className="mx-auto w-full max-w-2xl rounded-xl border border-border/70 bg-card p-5 shadow-(--shadow-card) sm:p-6">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

function OnboardingLoading() {
  return (
    <OnboardingFrame>
      <output className="block space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-20 w-full" />
        <span className="sr-only">Preparing your workspace</span>
      </output>
    </OnboardingFrame>
  );
}

function StateProviders({
  children,
  surface,
}: {
  readonly children: ReactNode;
  readonly surface: "app" | "onboarding";
}) {
  const { client } = useApiClient();
  return (
    <AppStateProvider client={client}>
      <ResourceBoundary
        fallback={
          surface === "onboarding" ? <OnboardingLoading /> : <PageLoading />
        }
        renderError={
          surface === "onboarding"
            ? (error, retry) => (
                <OnboardingFrame>
                  <div className="space-y-5" role="alert">
                    <div className="space-y-2">
                      <p className="font-medium text-primary text-sm">
                        Workspace setup
                      </p>
                      <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
                        Setup needs another try
                      </h1>
                      <p className="text-muted-foreground leading-relaxed">
                        We couldn&apos;t finish preparing your workspace. Retry
                        now—your account and onboarding progress are safe.
                      </p>
                    </div>
                    <Button className="min-h-11" onClick={retry}>
                      Retry workspace setup
                    </Button>
                    {error instanceof Error && error.message ? (
                      <details className="text-muted-foreground text-xs">
                        <summary className="cursor-pointer">
                          Technical details
                        </summary>
                        <p className="mt-2 break-words">{error.message}</p>
                      </details>
                    ) : null}
                  </div>
                </OnboardingFrame>
              )
            : undefined
        }
      >
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </ResourceBoundary>
    </AppStateProvider>
  );
}

export function BackendProviders({
  children,
  surface = "app",
}: {
  children: ReactNode;
  surface?: "app" | "onboarding";
}) {
  return (
    <ApiClientProvider
      fallback={
        surface === "onboarding" ? (
          <OnboardingLoading />
        ) : (
          <PageLoading label="Loading your session" />
        )
      }
    >
      <StateProviders surface={surface}>{children}</StateProviders>
    </ApiClientProvider>
  );
}
