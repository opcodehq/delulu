"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowRight01Icon, LockIcon, SparklesIcon } from "@delulu/icons";
import { CURRENCY_SYMBOLS, PLANS, type PlanType } from "@delulu/payments";
import { useCurrency } from "@/features/billing/use-currency";

interface UpgradePromptProps {
  feature: string;
  requiredPlan?: PlanType;
  currentUsage?: number;
  limit?: number;
  description?: string;
  productId?: string;
  className?: string;
}

export function UpgradePrompt({
  feature,
  requiredPlan = "ECHO",
  currentUsage,
  limit,
  description,
  className,
}: UpgradePromptProps) {
  const currency = useCurrency();
  const plan = PLANS[requiredPlan];
  const symbol = CURRENCY_SYMBOLS[currency];
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground" icon={LockIcon} size={20} />
          <CardTitle className="text-xl">{feature} Requires Upgrade</CardTitle>
        </div>
        <CardDescription>
          {description ??
            `This feature requires a ${plan.name} plan or higher to unlock.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentUsage !== undefined && limit !== undefined && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            You've reached your limit:{" "}
            <strong>
              {currentUsage}/{limit}
            </strong>
          </div>
        )}
        <div className="space-y-2 text-sm">
          <p className="font-medium">With {plan.name}, you get:</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Icon className="text-primary" icon={SparklesIcon} size={16} />
            {plan.limits.monthlyPosts === -1
              ? "Unlimited"
              : plan.limits.monthlyPosts}{" "}
            posts per month
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 p-4">
          <span className="font-bold text-3xl">
            {symbol}
            {plan.price[currency].monthly}
          </span>
          <span className="text-muted-foreground">/month</span>
        </div>
        <Button className="w-full" disabled size="lg">
          Checkout unavailable
          <Icon className="ml-2" icon={ArrowRight01Icon} size={16} />
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          Checkout is temporarily unavailable during the billing migration.
        </p>
      </CardContent>
    </Card>
  );
}

export function InlineUpgradePrompt({
  feature,
  requiredPlan = "ECHO",
}: Pick<UpgradePromptProps, "feature" | "requiredPlan" | "productId">) {
  const currency = useCurrency();
  const plan = PLANS[requiredPlan];
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
      <div className="flex items-center gap-3">
        <Icon className="text-muted-foreground" icon={LockIcon} size={20} />
        <div>
          <p className="font-medium">
            {feature} requires {plan.name}
          </p>
          <p className="text-muted-foreground text-sm">
            Starting at {CURRENCY_SYMBOLS[currency]}
            {plan.price[currency].monthly}/month
          </p>
        </div>
      </div>
      <Button disabled>Checkout unavailable</Button>
    </div>
  );
}
