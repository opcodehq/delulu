import {
  ONBOARDING_COMPLETED,
  ONBOARDING_STEP_COMPLETED,
  ONBOARDING_STEP_SKIPPED,
  ONBOARDING_SURVEY_COMPLETED,
  ONBOARDING_TOUR_COMPLETED,
  ONBOARDING_TOUR_DISMISSED,
} from "@delulu/analytics/events";
import { posthog } from "@delulu/analytics/posthog/client";
import { useUser } from "@delulu/auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  completeTour,
  saveSurveyAnswer,
  updateOnboardingStep,
} from "@/app/onboarding/_actions";
import { useOnboardingStore } from "@/features/onboarding/store";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspace } from "@/shell/providers/workspace";
import { useMutationAtom } from "@/shell/state/resources";

export function useOnboarding() {
  const { user } = useUser();
  const { workspaceId } = useWorkspace();
  const { resources } = useApiClient();
  const completeSetup = useMutationAtom(
    resources.me.completeSetup(workspaceId ?? "")
  );
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const previousStep = useOnboardingStore((s) => s.previousStep);
  const accountsConnected = useOnboardingStore((s) => s.accountsConnected);
  const surveyAnswer = useOnboardingStore((s) => s.surveyAnswer);
  const setSurveyAnswer = useOnboardingStore((s) => s.setSurveyAnswer);
  const [isLoading, setIsLoading] = useState(false);

  // Get onboarding metadata from Clerk user
  const metadata = user?.publicMetadata as {
    onboardingComplete?: boolean;
    currentStep?: number;
    stepsCompleted?: string[];
    skippedSteps?: string[];
    tourCompleted?: boolean;
    tourDismissed?: boolean;
  };

  const stepsCompleted = metadata?.stepsCompleted || [];
  const skippedSteps = metadata?.skippedSteps || [];

  // CRITICAL FIX: Hydrate Zustand store from Clerk metadata on mount
  // This ensures page refreshes don't lose progress
  useEffect(() => {
    if (metadata?.currentStep && currentStep !== metadata.currentStep) {
      setCurrentStep(metadata.currentStep);
    }
  }, [metadata?.currentStep, currentStep, setCurrentStep]);

  // Move to next step
  const handleNextStep = async () => {
    const stepName = getStepName(currentStep);
    setIsLoading(true);

    try {
      // Track step completion
      posthog.capture(ONBOARDING_STEP_COMPLETED, {
        step: currentStep,
        stepName,
        accountsConnected,
      });

      // CRITICAL FIX: Prevent duplicate steps using Set
      const newStepsCompleted = Array.from(
        new Set([...stepsCompleted, stepName])
      );

      // CRITICAL FIX: Update server first, validate response before UI update
      const result = await updateOnboardingStep({
        currentStep: currentStep + 1,
        stepsCompleted: newStepsCompleted,
        skippedSteps,
      });

      if (result.success) {
        // Reload user data to get fresh metadata
        await user?.reload();
        // Move to next step in UI only after server success
        nextStep();
      } else {
        // Show error if server update failed
        toast.error(
          result.error || "Failed to save progress. Please try again."
        );
      }
    } catch (error) {
      console.error("Error in handleNextStep:", error);
      toast.error("Failed to save progress. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Skip current step
  const handleSkipStep = async () => {
    const stepName = getStepName(currentStep);
    setIsLoading(true);

    try {
      // Track skip event
      posthog.capture(ONBOARDING_STEP_SKIPPED, {
        step: currentStep,
        stepName,
      });

      // CRITICAL FIX: Prevent duplicate skipped steps using Set
      const newSkippedSteps = Array.from(new Set([...skippedSteps, stepName]));

      // CRITICAL FIX: Validate server response before UI update
      const result = await updateOnboardingStep({
        currentStep: currentStep + 1,
        stepsCompleted,
        skippedSteps: newSkippedSteps,
      });

      if (result.success) {
        await user?.reload();
        nextStep();
      } else {
        toast.error(
          result.error || "Failed to save progress. Please try again."
        );
      }
    } catch (error) {
      console.error("Error in handleSkipStep:", error);
      toast.error("Failed to save progress. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Go back to previous step
  const handlePreviousStep = async () => {
    // CRITICAL FIX: Sync back button with server
    // This prevents page refresh from jumping forward
    if (currentStep > 1) {
      setIsLoading(true);

      try {
        const newStep = currentStep - 1;

        const result = await updateOnboardingStep({
          currentStep: newStep,
          stepsCompleted, // Keep existing completed steps
          skippedSteps,
        });

        if (result.success) {
          await user?.reload();
          previousStep();
        } else {
          toast.error(result.error || "Failed to update progress.");
        }
      } catch (error) {
        console.error("Error in handlePreviousStep:", error);
        toast.error("Failed to update progress.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Complete onboarding
  const handleCompleteOnboarding = async () => {
    setIsLoading(true);

    try {
      const currentStepName = getStepName(currentStep);
      if (!workspaceId) {
        toast.error("Workspace is still loading. Please try again.");
        return { error: "Workspace is unavailable" };
      }

      const finalStepsCompleted = Array.from(
        new Set([...stepsCompleted, currentStepName])
      );
      const progress = await updateOnboardingStep({
        currentStep,
        stepsCompleted: finalStepsCompleted,
        skippedSteps,
      });
      if (!progress.success) {
        toast.error(
          progress.error || "Failed to save progress. Please try again."
        );
        return { error: progress.error };
      }

      const surveySaved = surveyAnswer
        ? await saveSurveyAnswer(surveyAnswer)
        : null;
      await completeSetup.mutateAsync(undefined);

      posthog.capture(ONBOARDING_STEP_COMPLETED, {
        step: currentStep,
        stepName: currentStepName,
        accountsConnected,
      });
      posthog.capture(ONBOARDING_COMPLETED, {
        stepsSkipped: skippedSteps,
        duration:
          Date.now() -
          (user?.createdAt ? new Date(user.createdAt).getTime() : Date.now()),
      });
      posthog.people?.set({
        onboarding_completed: true,
        onboarding_completion_date: new Date().toISOString(),
      });
      if (surveyAnswer && surveySaved?.success) {
        posthog.capture(ONBOARDING_SURVEY_COMPLETED, {
          referralSource: surveyAnswer,
        });
      }

      // Track signup with Affonso for affiliate attribution
      if (
        typeof window !== "undefined" &&
        user?.primaryEmailAddress?.emailAddress &&
        (window as Record<string, unknown>).Affonso
      ) {
        try {
          (
            (window as Record<string, unknown>).Affonso as {
              signup: (email: string) => void;
            }
          ).signup(user.primaryEmailAddress.emailAddress);
        } catch {
          // Affonso tracking is non-critical
        }
      }

      // Completion is already persisted and mirrored by the API. A transient
      // client refresh failure must not make the completed flow look failed.
      try {
        await user?.reload();
      } catch (error) {
        console.error(
          "Failed to refresh completed onboarding metadata:",
          error
        );
      }
      toast.success("Welcome to Delulu Social! 🎉");
      return { success: true };
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Failed to complete onboarding. Please try again.");
      return { error: "Failed to complete onboarding" };
    } finally {
      setIsLoading(false);
    }
  };

  // Complete or dismiss tour
  const handleCompleteTour = async (dismissed = false) => {
    const eventName = dismissed
      ? ONBOARDING_TOUR_DISMISSED
      : ONBOARDING_TOUR_COMPLETED;

    posthog.capture(eventName, {
      lastStep: currentStep,
    });

    if (!dismissed) {
      posthog.people?.set({
        tour_completed: true,
      });
    }

    await completeTour(dismissed);
    await user?.reload();
  };

  return {
    // State
    currentStep,
    accountsConnected,
    surveyAnswer,
    stepsCompleted,
    skippedSteps,
    isLoading,
    metadata,

    // Actions
    setCurrentStep,
    setSurveyAnswer,
    handleNextStep,
    handleSkipStep,
    handlePreviousStep,
    handleCompleteOnboarding,
    handleCompleteTour,
  };
}

// Helper function to get step name
function getStepName(step: number): string {
  const stepNames = {
    1: "welcome",
    2: "pricing",
    3: "connect",
    4: "automation",
    5: "survey",
  };
  return stepNames[step as keyof typeof stepNames] || "unknown";
}
