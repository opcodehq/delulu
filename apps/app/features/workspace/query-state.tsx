"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { Alert02Icon, Loading03Icon } from "@delulu/icons";

export const taggedMessage = (error: Error): string => {
  const tagged = error as Error & { readonly _tag?: string };
  switch (tagged._tag) {
    case "ForbiddenError":
      return "You do not have permission to view this workspace resource.";
    case "NotFoundError":
      return "This workspace resource is no longer available.";
    case "AnalyticsProviderError":
      return "The platform provider is unavailable. Cached data may still be shown.";
    default:
      return "We could not reach the API. Check your connection and try again.";
  }
};

export function OperationsLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
      <Icon className="animate-spin" icon={Loading03Icon} size={18} />
      {label}
    </div>
  );
}

export function OperationsError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <Icon className="text-destructive" icon={Alert02Icon} size={24} />
      <div>
        <p className="font-medium">Unable to load data</p>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          {taggedMessage(error)}
        </p>
      </div>
      <Button onClick={onRetry} size="sm" variant="outline">
        Retry
      </Button>
    </div>
  );
}
