"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";

import { AlertTriangle, XCircle } from "@delulu/icons";

interface SocialErrorProps {
  title: string;
  message: string;
  variant?: "error" | "warning";
  showRetry?: boolean;
  provider?: string;
  onRetry?: (provider?: string) => void;
  onDismiss?: () => void;
}

export function SocialError({
  title,
  message,
  variant = "error",
  showRetry = false,
  provider,
  onRetry,
  onDismiss,
}: SocialErrorProps) {
  return (
    <div className="relative rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          {variant === "error" ? (
            <Icon className="text-destructive" icon={XCircle} size={20} />
          ) : (
            <Icon className="text-yellow-500" icon={AlertTriangle} size={20} />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-muted-foreground text-sm">{message}</p>
          {showRetry && onRetry && (
            <div className="mt-3">
              <Button
                className="text-xs"
                onClick={() => onRetry(provider)}
                size="sm"
                variant="outline"
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
            type="button"
          >
            <Icon className="" icon={XCircle} size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
