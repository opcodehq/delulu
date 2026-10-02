"use client";

/**
 * Billing Client Component
 *
 * Comprehensive billing dashboard showing:
 * - Current subscription plan
 * - Usage statistics
 * - Pricing options for upgrades
 * - Billing management
 */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@delulu/design-system/components/ui/alert";
import { Card } from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { TickDouble01Icon } from "@delulu/icons";
import { getProductIds } from "@delulu/payments/product-ids";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { BillingOperations } from "@/features/billing/billing-operations";
import { CurrentPlanCard } from "@/features/billing/current-plan-card";
import { PricingCards } from "@/features/billing/pricing-cards";
import { SortedAddonCard } from "@/features/billing/sorted-addon-card";
import { UsageStats } from "@/features/billing/usage-stats";
import { useCurrency } from "@/features/billing/use-currency";
import { DottedColumns } from "@/shell/navigation/dotted-columns";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";

export default function BillingClient({
  community = false,
}: {
  community?: boolean;
}) {
  const currency = useCurrency();
  const productIds = getProductIds(currency);
  const searchParams = useSearchParams();
  const status = searchParams?.get("status"); // Dodo Payments returns 'status' param
  const subscriptionId = searchParams?.get("subscription_id");
  const cancelled = searchParams?.get("cancelled");

  // Show success/error messages from checkout redirects
  useEffect(() => {
    if (status === "succeeded" || status === "active") {
      toast.success("Subscription updated successfully!", {
        description:
          "Your payment has been processed. Welcome to your new plan!",
      });
    } else if (status === "failed") {
      toast.error("Payment failed", {
        description: "Your payment could not be processed. Please try again.",
      });
    } else if (cancelled === "true") {
      toast.error("Checkout cancelled", {
        description: "You can upgrade anytime from this page.",
      });
    }
  }, [status, cancelled]);

  if (community) {
    return (
      <PageShell
        description="This instance is self-hosted. Core product features are unlocked without a payment account."
        page="Instance"
        pages={["Settings"]}
        title="Community instance"
      >
        <Card className="space-y-3 p-6">
          <h2 className="font-semibold text-lg">Billing is disabled</h2>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Your operator owns this deployment and its data. Usage is limited
            only by configured safety controls, infrastructure, and external
            social-provider costs.
          </p>
          <p className="text-muted-foreground text-sm">
            Plan: Community · Deployment: self-hosted
          </p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      description="Manage your subscription, view usage, and upgrade your plan."
      page="Billing"
      pages={["Settings"]}
      title="Billing & Subscription"
    >
      {/* Success Alert */}
      {(status === "succeeded" || status === "active") && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <Icon className="text-green-500" icon={TickDouble01Icon} size={16} />
          <AlertTitle>Subscription Updated!</AlertTitle>
          <AlertDescription>
            Your payment has been processed successfully. You now have access to
            all premium features.
            {subscriptionId && (
              <span className="mt-1 block text-muted-foreground text-xs">
                Subscription ID: {subscriptionId}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {status === "failed" && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTitle>Payment Failed</AlertTitle>
          <AlertDescription>
            Your payment could not be processed. Please try again or contact
            support.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan & Usage - Top Section */}
      <DottedColumns breakpoint="lg">
        <CurrentPlanCard />
        <UsageStats />
      </DottedColumns>

      <BillingOperations />

      {/* Pricing Section */}
      <div data-pricing-plans>
        <PageSection>
          <div className="mx-auto max-w-3xl space-y-1 text-center">
            <h2 className="font-bold text-xl">Choose Your Perfect Plan</h2>
            <p className="text-muted-foreground text-sm">
              Plans start at Echo ($4.99/mo). All plans include a 14-day
              money-back guarantee.
            </p>
          </div>

          <PricingCards
            onUpgradeSuccess={() => {
              toast.success("Redirecting to checkout...");
            }}
            productIds={productIds}
          />
        </PageSection>
      </div>

      {/* Sorted Add-On */}
      <PageSection title="Add-ons">
        <div className="grid gap-4 md:grid-cols-2">
          <SortedAddonCard />
        </div>
      </PageSection>

      {/* FAQ Section */}
      <PageSection title="Frequently asked questions">
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="gap-1.5 p-4">
            <h4 className="font-medium text-sm">Can I change plans later?</h4>
            <p className="text-muted-foreground text-sm">
              Yes! You can upgrade or downgrade your plan at any time. Changes
              take effect immediately for upgrades.
            </p>
          </Card>
          <Card className="gap-1.5 p-4">
            <h4 className="font-medium text-sm">
              What payment methods do you accept?
            </h4>
            <p className="text-muted-foreground text-sm">
              We accept all major credit cards through our secure payment
              processor, Dodo Payments.
            </p>
          </Card>
          <Card className="gap-1.5 p-4">
            <h4 className="font-medium text-sm">Is there a refund policy?</h4>
            <p className="text-muted-foreground text-sm">
              Yes! All paid plans come with a 14-day money-back guarantee.
              Contact support for a full refund.
            </p>
          </Card>
          <Card className="gap-1.5 p-4">
            <h4 className="font-medium text-sm">Can I cancel anytime?</h4>
            <p className="text-muted-foreground text-sm">
              Absolutely. Cancel anytime and retain access until the end of your
              billing period.
            </p>
          </Card>
        </div>
      </PageSection>
    </PageShell>
  );
}
