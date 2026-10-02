"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { toast } from "sonner";
import { useApiClient } from "@/shell/providers/api-client";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";

export function EmailPreferences() {
  const { resources } = useApiClient();
  const registry = useResourceRegistry();
  const options = resources.me.emailPreferences();
  const query = useResourceAtom(options);
  const update = useMutationAtom(resources.me.updateEmailPreferences());

  const setPreference = async (
    patch: Partial<{
      productLifecycleEnabled: boolean;
      marketingEnabled: boolean;
    }>
  ) => {
    if (!query.data) {
      return;
    }
    try {
      await update.mutateAsync({ ...query.data, ...patch });
      await registry.invalidateResources({ queryKey: options.queryKey! });
      toast.success("Email preferences updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update preferences"
      );
    }
  };

  if (!query.data) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email preferences</CardTitle>
        <CardDescription>
          Billing, security, and data-loss notices are always sent. Control
          optional product email here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          className="flex items-center justify-between gap-4"
          htmlFor="product-lifecycle-email"
        >
          <span>
            <span className="block font-medium text-sm">Product guidance</span>
            <span className="text-muted-foreground text-sm">
              Activation tips, milestones, and useful reminders.
            </span>
          </span>
          <Switch
            checked={query.data.productLifecycleEnabled}
            disabled={update.isPending}
            id="product-lifecycle-email"
            onCheckedChange={(checked) =>
              setPreference({ productLifecycleEnabled: checked })
            }
          />
        </label>
        <label
          className="flex items-center justify-between gap-4 border-t pt-4"
          htmlFor="announcement-email"
        >
          <span>
            <span className="block font-medium text-sm">Announcements</span>
            <span className="text-muted-foreground text-sm">
              Occasional releases and broader promotions.
            </span>
          </span>
          <Switch
            checked={query.data.marketingEnabled}
            disabled={update.isPending}
            id="announcement-email"
            onCheckedChange={(checked) =>
              setPreference({ marketingEnabled: checked })
            }
          />
        </label>
      </CardContent>
    </Card>
  );
}
