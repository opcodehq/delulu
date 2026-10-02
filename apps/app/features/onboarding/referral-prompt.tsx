"use client";

import { useUser } from "@delulu/auth";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import {
  dismissReferralPrompt,
  saveSurveyAnswer,
} from "@/app/onboarding/_actions";

const referralOptions = [
  { value: "social_media", label: "Social media" },
  { value: "word_of_mouth", label: "A friend or colleague" },
  { value: "search_engine", label: "Search" },
  { value: "youtube", label: "A creator or video" },
  { value: "blog", label: "An article or blog" },
  { value: "other", label: "Something else" },
] as const;

export function ReferralPrompt() {
  const { user } = useUser();
  const metadata = user?.publicMetadata as
    | {
        onboardingComplete?: boolean;
        referralPromptDismissed?: boolean;
        referralSource?: string;
      }
    | undefined;
  const [answer, setAnswer] = useState("");
  const [hidden, setHidden] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (
    hidden ||
    metadata?.onboardingComplete !== true ||
    metadata.referralPromptDismissed ||
    metadata.referralSource
  ) {
    return null;
  }

  const dismiss = async () => {
    setHidden(true);
    const result = await dismissReferralPrompt();
    if (result.error) {
      setHidden(false);
      toast.error(result.error);
    } else {
      await user?.reload();
    }
  };

  return (
    <aside className="mx-4 mt-4 rounded-xl border bg-card p-4 sm:mx-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium">One quick question</p>
          <p className="text-muted-foreground text-sm">
            How did you first hear about us? This is optional.
          </p>
        </div>
        <Select onValueChange={setAnswer} value={answer}>
          <SelectTrigger className="min-h-11 w-full lg:w-64">
            <SelectValue placeholder="Choose an answer" />
          </SelectTrigger>
          <SelectContent>
            {referralOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            className="flex-1 lg:flex-none"
            disabled={!answer || isSaving}
            onClick={async () => {
              setIsSaving(true);
              const result = await saveSurveyAnswer(answer);
              setIsSaving(false);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              setHidden(true);
              await user?.reload();
            }}
          >
            {isSaving ? "Saving…" : "Submit"}
          </Button>
          <Button
            className="flex-1 lg:flex-none"
            disabled={isSaving}
            onClick={dismiss}
            variant="ghost"
          >
            Not now
          </Button>
        </div>
      </div>
    </aside>
  );
}
