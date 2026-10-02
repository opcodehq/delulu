"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { ArrowRight01Icon, CreditCardIcon } from "@delulu/icons";

interface CheckoutButtonProps
  extends Omit<React.ComponentProps<"button">, "onClick" | "disabled"> {
  productId: string;
  returnUrl?: string;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  children?: React.ReactNode;
}

/** Checkout creation is intentionally disabled until the typed API exposes it. */
export function CheckoutButton({
  children,
  productId: _productId,
  returnUrl: _returnUrl,
  onSuccess: _onSuccess,
  onError: _onError,
  ...buttonProps
}: CheckoutButtonProps) {
  return (
    <div className="space-y-1">
      <Button disabled {...buttonProps}>
        {children ?? (
          <>
            <Icon className="mr-2" icon={CreditCardIcon} size={16} />
            Checkout unavailable
          </>
        )}
      </Button>
      <p className="text-muted-foreground text-xs">
        Checkout is temporarily unavailable during the billing migration.
      </p>
    </div>
  );
}

export function UpgradeButton({
  planName,
  ...props
}: CheckoutButtonProps & { planName: string }) {
  return (
    <CheckoutButton {...props}>
      Upgrade to {planName}
      <Icon className="ml-2" icon={ArrowRight01Icon} size={16} />
    </CheckoutButton>
  );
}

export function SubscribeButton(props: CheckoutButtonProps) {
  return (
    <CheckoutButton {...props}>
      {props.children ?? (
        <>
          Start Subscription
          <Icon className="ml-2" icon={ArrowRight01Icon} size={16} />
        </>
      )}
    </CheckoutButton>
  );
}
