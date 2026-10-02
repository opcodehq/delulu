"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@delulu/design-system/components/ui/alert";
import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { SparklesIcon, Tick01Icon, TickDouble01Icon } from "@delulu/icons";
import {
  CURRENCY_SYMBOLS,
  LIFETIME_DEAL_ACTIVE,
  LIFETIME_PRICE,
} from "@delulu/payments";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { useCurrency } from "@/features/billing/use-currency";
import { useSubscription } from "@/features/billing/use-subscription";
import { AppLink as Link } from "@/shell/navigation/app-link";

const FEATURES = [
  "Everything in VIBE plan",
  "Unlimited social accounts",
  "Unlimited posts per month",
  "Unlimited media storage",
  "Priority support",
  "1,000 free transcriptions",
  "All future features & updates",
  "No recurring fees — ever",
];

export default function LifetimeClient() {
  const currency = useCurrency();
  const currencySymbol = CURRENCY_SYMBOLS[currency];
  const isINR = currency === "INR";
  const price = LIFETIME_PRICE[currency];
  const formatNum = (n: number) =>
    isINR ? Math.round(n).toLocaleString("en-IN") : n.toLocaleString();

  const { isLifetime, isLoading: subLoading } = useSubscription();

  const searchParams = useSearchParams();
  const status = searchParams?.get("status");

  useEffect(() => {
    if (status === "succeeded" || status === "active") {
      toast.success("Lifetime deal activated!", {
        description: "Welcome to Delulu for life!",
      });
    } else if (status === "failed") {
      toast.error("Payment failed", {
        description: "Please try again or contact support.",
      });
    }
  }, [status]);

  if (!LIFETIME_DEAL_ACTIVE) {
    return (
      <div className="container mx-auto h-full max-w-2xl space-y-6 overflow-y-auto px-2 py-8 text-center">
        <h1 className="font-bold text-3xl tracking-tight">
          Lifetime deal ended
        </h1>
        <p className="text-muted-foreground">
          New lifetime licenses are no longer available. Choose Echo or Vibe on
          the billing page.
        </p>
        <Button asChild>
          <Link href="/billing">View plans</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto h-full max-w-2xl space-y-8 overflow-y-auto px-2 py-8">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Lifetime Deal</h1>
        <p className="mt-2 text-muted-foreground">
          Pay once, use Delulu Social forever. No subscriptions.
        </p>
      </div>

      {(status === "succeeded" || status === "active") && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <Icon className="text-green-500" icon={TickDouble01Icon} size={16} />
          <AlertTitle>Lifetime Deal Activated!</AlertTitle>
          <AlertDescription>
            You now have lifetime access to all VIBE features. No more payments,
            ever.
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-primary shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Icon icon={SparklesIcon} size={20} />
              VIBE — Lifetime
            </CardTitle>
            <Badge variant="default">Limited — 18 of 20 left</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-4xl">
                {currencySymbol}
                {formatNum(price)}
              </span>
              <span className="text-muted-foreground">one-time</span>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              = {currencySymbol}
              {isINR
                ? Math.round(price / 60).toLocaleString("en-IN")
                : (price / 60).toFixed(2)}
              /mo over 5 years
            </p>
          </div>

          <ul className="space-y-2 text-sm">
            {FEATURES.map((feature) => (
              <li className="flex items-start gap-2" key={feature}>
                <Icon
                  className="mt-0.5 shrink-0 text-primary"
                  icon={Tick01Icon}
                  size={16}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {isLifetime ? (
            <Button className="w-full" disabled size="lg">
              You already have lifetime access
            </Button>
          ) : (
            <Button className="w-full" disabled size="lg">
              {subLoading ? "Loading subscription…" : "Checkout unavailable"}
            </Button>
          )}
          <p className="text-center text-muted-foreground text-xs">
            Lifetime checkout is temporarily unavailable during the billing
            migration.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
