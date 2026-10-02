"use client";

import { cn } from "@delulu/design-system/lib/utils";
import { DottedColumns } from "@/shell/navigation/dotted-columns";

export type OnboardingGoal = "publish" | "auto_dm";

const goals = [
  {
    value: "publish" as const,
    title: "Publish content",
    description: "Create once and publish across your social accounts.",
  },
  {
    value: "auto_dm" as const,
    title: "Automate Instagram DMs",
    description: "Turn comments and keywords into automatic conversations.",
  },
];

export function GoalStep({
  selected,
  pending,
  onSelect,
}: {
  selected: OnboardingGoal | null;
  pending: boolean;
  onSelect: (goal: OnboardingGoal) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="font-medium text-primary text-xs uppercase tracking-wide">
          Choose your first win
        </p>
        <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
          What do you want to do first?
        </h1>
        <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
          We&apos;ll tailor setup around this choice. You can use every feature
          later.
        </p>
      </div>

      <div className="-mx-4 border-zinc-950/10 border-t-[1.5px] border-dotted sm:-mx-5 dark:border-white/10" />

      <fieldset>
        <legend className="sr-only">Setup goal</legend>
        <DottedColumns breakpoint="md" className="gap-y-3">
          {goals.map((goal) => {
            const isSelected = selected === goal.value;
            return (
              <label
                className={cn(
                  "flex min-h-20 w-full cursor-pointer items-center justify-start gap-3 whitespace-normal rounded-md border bg-background px-3 py-3 text-left shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent hover:text-accent-foreground",
                  isSelected && "border-primary bg-primary/5"
                )}
                key={goal.value}
              >
                <input
                  checked={isSelected}
                  className="sr-only"
                  disabled={pending}
                  name="onboarding-goal"
                  onChange={() => onSelect(goal.value)}
                  type="radio"
                  value={goal.value}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-base">
                    {goal.title}
                  </span>
                  <span className="mt-1 block text-muted-foreground text-sm">
                    {goal.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {isSelected ? (
                    <span className="size-2 rounded-full bg-primary-foreground" />
                  ) : null}
                </span>
              </label>
            );
          })}
        </DottedColumns>
      </fieldset>
    </div>
  );
}
