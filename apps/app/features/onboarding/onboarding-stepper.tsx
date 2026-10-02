"use client";

import { useClerk, useSession } from "@delulu/auth";
import { Logo } from "@delulu/design-system/components/logo";
import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
} from "@delulu/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ConnectAccountsStep,
  type ConnectionCallbackState,
} from "@/features/onboarding/connect-accounts-step";
import { GoalStep, type OnboardingGoal } from "@/features/onboarding/goal-step";
import { OnboardingProgress } from "@/features/onboarding/onboarding-progress";
import { PlanStep } from "@/features/onboarding/plan-step";
import { ReadyStep } from "@/features/onboarding/ready-step";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useMutationAtom, useResourceAtom } from "@/shell/state/resources";

type Step = "goal" | "connect" | "ready" | "plan";

const callbackErrorMessage = (error: string): string => {
  if (error === "user_denied" || error === "user_cancelled") {
    return "The connection was cancelled. Nothing was changed.";
  }
  if (error === "transfer_required") {
    return "This account is connected to another workspace. Return to account settings to transfer it.";
  }
  if (error === "invalid_state") {
    return "This connection attempt expired. Start again to continue safely.";
  }
  return "The provider could not finish connecting. Try again.";
};

export function OnboardingStepper({
  legacyGoal,
}: {
  legacyGoal?: OnboardingGoal;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut } = useClerk();
  const { session } = useSession();
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const setup = useResourceAtom({
    ...resources.me.setup(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    staleTime: 0,
    retry: 2,
  });
  const accounts = useResourceAtom({
    ...resources.connections.list(workspaceId ?? "", { limit: 100 }),
    enabled: Boolean(workspaceId),
    staleTime: 0,
    retry: 2,
  });
  const updateSetup = useMutationAtom(
    resources.me.updateSetup(workspaceId ?? "")
  );
  const completeSetup = useMutationAtom(
    resources.me.completeSetup(workspaceId ?? "")
  );

  const serverGoal = setup.data?.goal ?? null;
  const [selectedGoal, setSelectedGoal] = useState<OnboardingGoal | null>(
    serverGoal ?? legacyGoal ?? null
  );
  const [stepOverride, setStepOverride] = useState<Step | null>(
    searchParams.get("step") === "plan"
      ? "plan"
      : searchParams.get("step") === "connect" || legacyGoal
        ? "connect"
        : null
  );
  const [callback, setCallback] = useState<ConnectionCallbackState | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [connectionSkipped, setConnectionSkipped] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [planRefreshError, setPlanRefreshError] = useState<string | null>(null);
  const legacyMigrated = useRef(false);
  const contentRef = useRef<HTMLElement>(null);
  const values = accounts.data?.data ?? [];

  useEffect(() => {
    if (serverGoal) {
      setSelectedGoal(serverGoal);
    }
  }, [serverGoal]);

  useEffect(() => {
    if (legacyMigrated.current || serverGoal || !legacyGoal || !workspaceId) {
      return;
    }
    legacyMigrated.current = true;
    updateSetup
      .mutateAsync({ goal: legacyGoal })
      .then(() => setup.refetch())
      .catch(() => {
        legacyMigrated.current = false;
        setStepOverride("goal");
      });
  }, [legacyGoal, serverGoal, setup, updateSetup, workspaceId]);

  const derivedStep: Step =
    setup.data?.webStep === "connect" ||
    setup.data?.webStep === "ready" ||
    setup.data?.webStep === "plan"
      ? setup.data.webStep
      : "goal";
  const requirementMet =
    setup.data?.webStep === "ready" || setup.data?.webStep === "plan";
  const planPaid = setup.data?.subscription.paid === true;
  const safeStepOverride =
    stepOverride === "plan" && derivedStep !== "plan" && !connectionSkipped
      ? null
      : stepOverride;
  const step = safeStepOverride ?? derivedStep;
  const goal = step === "goal" ? selectedGoal : (serverGoal ?? selectedGoal);

  const refreshSetup = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const [latestAccounts] = await Promise.all([
        accounts.refetch(),
        setup.refetch(),
      ]);
      return latestAccounts.data?.data ?? [];
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setRefreshError(message);
      toast.error("Could not refresh setup", {
        description: message,
      });
      return null;
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const notification = searchParams.get("notification");
    if (!(success || error || notification)) {
      return;
    }
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const username = fragment.get("username");
    const provider =
      searchParams.get("provider") ?? searchParams.get("platform");
    if (success === "true") {
      setCallback({ kind: "success", provider, username });
    } else if (
      notification === "transfer_required" ||
      notification === "account_transferred"
    ) {
      setCallback({
        kind: "transfer_required",
        provider,
        username,
        message: callbackErrorMessage("transfer_required"),
        connectionId: searchParams.get("connectionId") ?? undefined,
        sourceWorkspaceId: searchParams.get("sourceWorkspaceId") ?? undefined,
        transferToken: searchParams.get("transferToken") ?? undefined,
      });
    } else if (error) {
      setCallback({
        kind: "error",
        provider,
        username,
        message: callbackErrorMessage(error),
      });
    }
    setStepOverride("connect");
    const syncCallback = async () => {
      const attempts = success === "true" ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, 500 * 2 ** attempt)
          );
        }
        const latestAccounts = await refreshSetup();
        if (!latestAccounts || success !== "true") {
          return;
        }
        const expectedPlatform = provider?.toUpperCase();
        if (
          latestAccounts.some(
            (account) =>
              !expectedPlatform || account.platform === expectedPlatform
          )
        ) {
          return;
        }
      }
      setRefreshError(
        "The provider accepted the connection, but the account has not appeared yet. Refresh again or restart the connection."
      );
    };
    syncCallback().catch(() => undefined);
    window.history.replaceState(window.history.state, "", "/onboarding");
    window.requestAnimationFrame(() => contentRef.current?.focus());
    // Callback parameters are consumed once on the full-page return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const status = searchParams.get("status");
    const cancelled = searchParams.get("cancelled");
    if (!(status || cancelled)) {
      return;
    }
    setStepOverride("plan");
    const refreshPlan = async () => {
      if (status === "failed" || cancelled === "true") {
        setPlanRefreshError(
          status === "failed"
            ? "Payment failed. Choose a plan to try again."
            : "Checkout was cancelled. Choose a plan when you’re ready."
        );
        return;
      }
      if (status !== "succeeded" && status !== "active") {
        return;
      }
      setIsRefreshing(true);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, 500 * 2 ** attempt)
          );
        }
        const latest = await setup.refetch();
        if (latest.data?.subscription.paid) {
          setPlanRefreshError(null);
          setIsRefreshing(false);
          return;
        }
      }
      setIsRefreshing(false);
      setPlanRefreshError(
        "Payment succeeded, but plan activation is still syncing. Refresh the plan status in a moment."
      );
    };
    refreshPlan().catch((error) => {
      setIsRefreshing(false);
      setPlanRefreshError(
        error instanceof Error
          ? error.message
          : "Could not refresh plan status."
      );
    });
    window.history.replaceState(window.history.state, "", "/onboarding");
    window.requestAnimationFrame(() => contentRef.current?.focus());
    // Payment callback parameters are consumed once on the full-page return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qualifyingAccount = useMemo(() => {
    if (goal === "auto_dm") {
      return values.find((account) => account.platform === "INSTAGRAM");
    }
    return values[0];
  }, [goal, values]);

  useEffect(() => {
    if (
      callback?.kind === "success" &&
      stepOverride === "connect" &&
      derivedStep === "ready" &&
      qualifyingAccount
    ) {
      setCallback(null);
      setStepOverride(null);
      window.requestAnimationFrame(() => contentRef.current?.focus());
    }
  }, [callback, derivedStep, qualifyingAccount, stepOverride]);

  const persistGoal = async (nextGoal: OnboardingGoal): Promise<boolean> => {
    try {
      await updateSetup.mutateAsync({ goal: nextGoal });
      await setup.refetch();
      return true;
    } catch (error) {
      toast.error("Could not save your choice", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  };

  const selectGoal = (nextGoal: OnboardingGoal) => {
    setConnectionSkipped(false);
    setSelectedGoal(nextGoal);
    persistGoal(nextGoal).catch(() => undefined);
  };

  const saveGoal = async () => {
    if (!(selectedGoal && workspaceId)) {
      return;
    }
    if (serverGoal === selectedGoal || (await persistGoal(selectedGoal))) {
      setStepOverride("connect");
    }
  };

  const completeAndNavigate = async (destination: string) => {
    if (!workspaceId) {
      return;
    }
    try {
      await completeSetup.mutateAsync(undefined);
      await session?.reload();
      session?.clearCache();
      await session?.getToken({ skipCache: true });
      router.push(destination);
      router.refresh();
    } catch (error) {
      toast.error("Could not finish setup", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const acknowledgeReady = async () => {
    try {
      await updateSetup.mutateAsync({
        optionalSteps: { ready: "completed" },
      });
      await setup.refetch();
      setStepOverride("plan");
    } catch (error) {
      toast.error("Could not continue to plans", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const skipConnection = async () => {
    try {
      await updateSetup.mutateAsync({
        optionalSteps: {
          connect: "skipped",
          ready: "skipped",
        },
      });
      await setup.refetch();
      setCallback(null);
      setConnectionSkipped(true);
      setStepOverride("plan");
    } catch (error) {
      toast.error("Could not skip this step", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const refreshPlan = async () => {
    setIsRefreshing(true);
    setPlanRefreshError(null);
    try {
      await setup.refetch();
    } catch (error) {
      setPlanRefreshError(
        error instanceof Error
          ? error.message
          : "Could not refresh plan status."
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (error) {
      setIsSigningOut(false);
      toast.error("Could not log out", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const isBusy =
    updateSetup.isPending ||
    completeSetup.isPending ||
    isRefreshing ||
    isSigningOut;
  const primaryLabel =
    step === "goal"
      ? "Continue"
      : step === "connect"
        ? requirementMet
          ? "Continue"
          : goal === "auto_dm"
            ? "Connect Instagram to continue"
            : "Connect an account to continue"
        : goal === "auto_dm"
          ? step === "ready"
            ? "Review plans"
            : planPaid
              ? "Create your first auto-DM"
              : "Choose a plan to continue"
          : step === "ready"
            ? "Review plans"
            : planPaid
              ? "Create your first post"
              : "Choose a plan to continue";

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col border-zinc-950/10 border-x-[1.5px] border-dotted dark:border-white/10">
        <header className="flex h-14 items-center justify-between px-4 sm:px-5">
          <Logo />
          <Button
            className="px-3 sm:px-4"
            disabled={isBusy}
            onClick={handleSignOut}
            variant="ghost"
          >
            {isSigningOut ? (
              <Icon
                className="animate-spin motion-reduce:animate-none"
                icon={Loading03Icon}
                size={16}
              />
            ) : null}
            Log out
          </Button>
        </header>

        <div className="border-zinc-950/10 border-t-[1.5px] border-dotted dark:border-white/10" />

        <OnboardingProgress
          authoritativeStep={derivedStep}
          currentStep={step}
        />

        <div className="flex flex-1 items-start px-3 py-3 pb-28 sm:px-4 sm:py-4 sm:pb-4">
          <section
            aria-busy={isSigningOut}
            aria-label="Onboarding step"
            className="mx-auto w-full rounded-lg border border-border/70 bg-card p-4 shadow-(--shadow-card) outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            inert={isSigningOut}
            ref={contentRef}
            tabIndex={-1}
          >
            {step === "goal" ? (
              <GoalStep
                onSelect={selectGoal}
                pending={updateSetup.isPending}
                selected={selectedGoal}
              />
            ) : null}
            {step === "connect" && goal ? (
              <ConnectAccountsStep
                accounts={values}
                callback={callback}
                goal={goal}
                isRefreshing={isRefreshing}
                onRefresh={refreshSetup}
                refreshError={refreshError}
                requirementMet={requirementMet}
              />
            ) : null}
            {step === "ready" && goal && qualifyingAccount ? (
              <ReadyStep accounts={values} goal={goal} />
            ) : null}
            {step === "plan" ? (
              <PlanStep
                accounts={values}
                isRefreshing={isRefreshing}
                onDashboard={() => completeAndNavigate("/")}
                onRefresh={refreshPlan}
                paid={planPaid}
                plan={setup.data?.subscription.plan ?? "Selected plan"}
                refreshError={planRefreshError}
              />
            ) : null}
          </section>
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-20 border-zinc-950/10 border-t-[1.5px] border-dotted bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:bg-transparent sm:px-6 sm:pt-4 sm:pb-5 sm:backdrop-blur-none dark:border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
            <div>
              {step === "goal" ? null : (
                <Button
                  className="w-full sm:w-auto"
                  disabled={isBusy}
                  onClick={() =>
                    setStepOverride(
                      step === "plan"
                        ? qualifyingAccount
                          ? "ready"
                          : "connect"
                        : step === "ready"
                          ? "connect"
                          : "goal"
                    )
                  }
                  variant="ghost"
                >
                  <Icon icon={ArrowLeft01Icon} size={16} />
                  Back
                </Button>
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {step === "connect" && !requirementMet ? (
                <Button
                  className="shrink-0"
                  disabled={isBusy}
                  onClick={skipConnection}
                  variant="ghost"
                >
                  Skip for now
                </Button>
              ) : null}
              <Button
                className="min-w-0 flex-1 sm:min-w-44 sm:max-w-max"
                disabled={
                  isBusy ||
                  (step === "goal" && !selectedGoal) ||
                  (step === "connect" && !requirementMet) ||
                  (step === "plan" && !planPaid)
                }
                onClick={async () => {
                  if (step === "goal") {
                    await saveGoal();
                    return;
                  }
                  if (step === "connect") {
                    setCallback(null);
                    setStepOverride("ready");
                    return;
                  }
                  if (step === "ready") {
                    await acknowledgeReady();
                    return;
                  }
                  await completeAndNavigate(
                    goal === "auto_dm"
                      ? "/automations/new?template=lead-magnet"
                      : "/post"
                  );
                }}
              >
                {isBusy ? (
                  <Icon
                    className="animate-spin motion-reduce:animate-none"
                    icon={Loading03Icon}
                    size={16}
                  />
                ) : null}
                {primaryLabel}
                {isBusy ? null : <Icon icon={ArrowRight01Icon} size={16} />}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
