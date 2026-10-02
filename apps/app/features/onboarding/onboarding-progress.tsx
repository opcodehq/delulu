import { cn } from "@delulu/design-system/lib/utils";

interface OnboardingProgressProps {
  currentStep: "goal" | "connect" | "ready" | "plan";
  authoritativeStep?: "goal" | "connect" | "ready" | "plan";
}

const steps = [
  { id: "goal", label: "Goal" },
  { id: "connect", label: "Connect" },
  { id: "ready", label: "Ready" },
  { id: "plan", label: "Plan" },
] as const;

export function OnboardingProgress({
  currentStep,
  authoritativeStep = currentStep,
}: OnboardingProgressProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  const authoritativeIndex = steps.findIndex(
    (step) => step.id === authoritativeStep
  );
  return (
    <ol
      aria-label="Onboarding progress"
      className="grid grid-cols-4 border-zinc-950/10 border-b-[1.5px] border-dotted dark:border-white/10"
    >
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < authoritativeIndex;

        return (
          <li
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "min-w-0 px-2 py-2 sm:px-4",
              index > 0 &&
                "border-zinc-950/10 border-l-[1.5px] border-dotted dark:border-white/10",
              isActive && "bg-primary/[0.045]"
            )}
            key={step.id}
          >
            <span className="flex min-w-0 items-center justify-center gap-1.5 sm:justify-start sm:gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border font-medium text-[10px]",
                  isActive &&
                    "border-primary bg-primary text-primary-foreground",
                  isCompleted &&
                    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  !(isActive || isCompleted) &&
                    "border-border bg-background text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "block max-w-full truncate text-[10px] sm:text-xs",
                  isActive
                    ? "font-medium text-foreground"
                    : isCompleted
                      ? "text-foreground/65"
                      : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
