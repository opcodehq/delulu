import { auth } from "@delulu/auth/server";
import { Suspense } from "react";
import { OnboardingStepper } from "@/features/onboarding/onboarding-stepper";

export default async function OnboardingPage() {
  const { sessionClaims } = await auth();
  const metadata = sessionClaims?.metadata as
    | { currentStep?: number }
    | undefined;
  const legacyGoal =
    typeof metadata?.currentStep === "number" && metadata.currentStep >= 3
      ? ("auto_dm" as const)
      : undefined;
  return (
    <Suspense>
      <OnboardingStepper legacyGoal={legacyGoal} />
    </Suspense>
  );
}
