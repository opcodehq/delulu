"use client";

import { cn } from "@delulu/design-system/lib/utils";
import { Icon } from "@delulu/design-system/providers/icon";
import { InstagramIcon } from "@delulu/icons";

interface SocialProvider {
  _id: string;
  username?: string;
  fullName?: string;
  profileImageUrl?: string;
}

interface AccountStepProps {
  providers: SocialProvider[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AccountStep({
  providers,
  selectedId,
  onSelect,
}: AccountStepProps) {
  if (providers.length === 0) {
    return (
      <div className="rounded-lg border border-border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">
          No Instagram accounts connected. Connect an account first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Select Instagram Account</h3>
        <p className="text-muted-foreground text-sm">
          Choose which account this automation will run on.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => (
          <button
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
              selectedId === provider._id
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:border-primary/50"
            )}
            key={provider._id}
            onClick={() => onSelect(provider._id)}
            type="button"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
              <Icon className="text-white" icon={InstagramIcon} size={20} />
            </div>
            <div>
              <p className="font-medium text-sm">
                @{provider.username || provider.fullName}
              </p>
              <p className="text-muted-foreground text-xs">Instagram</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
