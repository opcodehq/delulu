"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@delulu/design-system/components/ui/alert";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { Input } from "@delulu/design-system/components/ui/input";
import { Progress } from "@delulu/design-system/components/ui/progress";
import {
  RadioGroup,
  RadioGroupItem,
} from "@delulu/design-system/components/ui/radio-group";
import { Textarea } from "@delulu/design-system/components/ui/textarea";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";

const reasons = [
  ["too_expensive", "Too expensive"],
  ["missing_features", "Missing features"],
  ["switched_service", "Switched to another service"],
  ["unused", "I am not using it enough"],
  ["customer_service", "Customer service"],
  ["low_quality", "Quality did not meet expectations"],
  ["too_complex", "Too complex"],
  ["other", "Other"],
] as const;

interface SaveOfferSnapshot {
  readonly amountMinor: number;
  readonly currency: string;
}

const readableBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

export function CancellationFlow() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const workspaceId = workspace.workspaceId ?? "";
  const registry = useResourceRegistry();
  const options = resources.billing.cancellation(workspaceId);
  const query = useResourceAtom({
    ...options,
    enabled: Boolean(workspace.workspaceId),
  });
  const start = useMutationAtom(
    resources.billing.startCancellation(workspaceId)
  );
  const acceptOffer = useMutationAtom(
    resources.billing.acceptCancellationOffer(workspaceId)
  );
  const schedule = useMutationAtom(
    resources.billing.scheduleCancellation(workspaceId)
  );
  const reactivate = useMutationAtom(
    resources.billing.reactivateCancellation(workspaceId)
  );
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saveOffer, setSaveOffer] = useState<SaveOfferSnapshot | null>(null);
  const [reason, setReason] = useState<(typeof reasons)[number][0] | "">("");
  const [comment, setComment] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [calendarReference, setCalendarReference] = useState<string | null>(
    null
  );
  const cancellation = query.data;

  const resetWizard = () => {
    setStep(1);
    setReason("");
    setComment("");
    setConfirmation("");
    setCalendarReference(null);
    setSaveOffer(null);
  };
  const setDialogOpen = (next: boolean) => {
    if (next) {
      setSaveOffer(
        cancellation?.canOfferSave &&
          cancellation.offerAmountMinor !== null &&
          cancellation.offerCurrency
          ? {
              amountMinor: cancellation.offerAmountMinor,
              currency: cancellation.offerCurrency,
            }
          : null
      );
    }
    setOpen(next);
    if (!next) {
      resetWizard();
    }
  };
  const reportError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : "Please try again");
  };

  useEffect(() => {
    if (open && cancellation?.status === "call_booked") {
      toast.success("Your retention call is booked", {
        description: "No cancellation has been scheduled.",
      });
      setDialogOpen(false);
    }
  }, [cancellation?.status, open]);

  useEffect(() => {
    if (!workspace.workspaceId || cancellation?.status !== "open") {
      return;
    }
    const interval = window.setInterval(() => {
      query.refetch().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [cancellation?.status, query.refetch, workspace.workspaceId]);

  const calendarUrl = useMemo(() => {
    if (!calendarReference) {
      return null;
    }
    const url = new URL("https://cal.com/swaraj/retention");
    url.searchParams.set("embed", "true");
    url.searchParams.set("metadata[cancellationReference]", calendarReference);
    return url.toString();
  }, [calendarReference]);

  const invalidate = async () => {
    await Promise.all([
      registry.invalidateResources({ queryKey: options.queryKey! }),
      registry.invalidateResources({
        queryKey: resources.billing.subscription(workspaceId).queryKey!,
      }),
    ]);
  };

  if (query.error) {
    return (
      <Button
        className="flex-1"
        onClick={() => query.refetch()}
        variant="outline"
      >
        Retry cancellation controls
      </Button>
    );
  }
  if (query.isPending || !cancellation) {
    return (
      <Button className="flex-1" disabled variant="outline">
        Loading cancellation…
      </Button>
    );
  }
  if (!cancellation.canManageCancellation) {
    return null;
  }
  if (cancellation.status === "scheduled") {
    return (
      <Button
        className="flex-1"
        disabled={reactivate.isPending || !cancellation.id}
        onClick={async () => {
          if (!cancellation.id) {
            return;
          }
          try {
            await reactivate.mutateAsync(cancellation.id);
            await invalidate();
            resetWizard();
            toast.success("Your subscription will continue");
          } catch (error) {
            reportError(error);
          }
        }}
        variant="outline"
      >
        {reactivate.isPending ? "Restoring…" : "Keep subscription"}
      </Button>
    );
  }
  if (
    cancellation.status === "effective" ||
    cancellation.status === "deleting"
  ) {
    return (
      <Button
        className="flex-1"
        disabled={reactivate.isPending || !cancellation.id}
        onClick={async () => {
          if (!cancellation.id) {
            return;
          }
          try {
            const result = await reactivate.mutateAsync(cancellation.id);
            if (result.recoveryUrl) {
              window.location.assign(result.recoveryUrl);
            }
          } catch (error) {
            reportError(error);
          }
        }}
      >
        {reactivate.isPending ? "Opening checkout…" : "Restore access"}
      </Button>
    );
  }

  const impactItems = [
    ["Workspaces", cancellation.impact.workspaces],
    ["Workspace members", cancellation.impact.members],
    ["Posts", cancellation.impact.posts],
    ["Scheduled posts", cancellation.impact.scheduledPosts],
    ["Connections", cancellation.impact.connections],
    ["Automations", cancellation.impact.automations],
    [
      "Media",
      `${cancellation.impact.mediaItems} (${readableBytes(cancellation.impact.mediaBytes)})`,
    ],
  ] as const;
  const totalSteps = saveOffer ? 5 : 4;
  const isOfferStep = saveOffer !== null && step === 4;
  const isConfirmationStep = step === totalSteps;

  const acceptSaveOffer = async () => {
    if (!cancellation.id) {
      return;
    }
    try {
      const accepted = await acceptOffer.mutateAsync(cancellation.id);
      registry.setResource(options.queryKey!, accepted);
      setDialogOpen(false);
      toast.success("Your next plan charge is covered");
      await invalidate().catch(() => undefined);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <>
      <Button
        className="flex-1"
        onClick={() => setDialogOpen(true)}
        variant="outline"
      >
        Cancel subscription
      </Button>
      <Dialog onOpenChange={setDialogOpen} open={open}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {step === 1 && "Before you cancel"}
              {step === 2 && "What could we improve?"}
              {step === 3 && "Let us help"}
              {isOfferStep && "Stay one more month on us"}
              {isConfirmationStep && "Final confirmation"}
            </DialogTitle>
            <DialogDescription>
              Step {step} of {totalSteps}
            </DialogDescription>
          </DialogHeader>
          <Progress value={(step / totalSteps) * 100} />

          {step === 1 && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTitle>
                  All funded workspace data will be deleted
                </AlertTitle>
                <AlertDescription>
                  Access continues until{" "}
                  {cancellation.currentPeriodEnd
                    ? format(new Date(cancellation.currentPeriodEnd), "PPP")
                    : "the paid term ends"}
                  . Permanent deletion is scheduled for{" "}
                  {cancellation.dataDeletionAt
                    ? format(new Date(cancellation.dataDeletionAt), "PPP")
                    : "60 days after term end"}
                  , unless you restore the subscription.
                </AlertDescription>
              </Alert>
              <div className="grid gap-2 sm:grid-cols-2">
                {impactItems.map(([label, value]) => (
                  <div
                    className="flex justify-between rounded-lg border p-3 text-sm"
                    key={label}
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-sm">
                Affected:{" "}
                {cancellation.impact.workspaceNames.join(", ") ||
                  "No workspaces"}
                . Every member will receive advance warnings.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <RadioGroup
                onValueChange={(value) => setReason(value as typeof reason)}
                value={reason}
              >
                {reasons.map(([value, label]) => (
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                    htmlFor={`cancellation-reason-${value}`}
                    key={value}
                  >
                    <RadioGroupItem
                      id={`cancellation-reason-${value}`}
                      value={value}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </RadioGroup>
              <label
                className="font-medium text-sm"
                htmlFor="cancellation-comment"
              >
                Additional details{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Textarea
                id="cancellation-comment"
                maxLength={1000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Anything else you want us to know? (optional)"
                rows={4}
                value={comment}
              />
              <p className="text-right text-muted-foreground text-xs">
                {comment.length}/1000
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Book a free 15-minute call. You may use any attendee email—the
                booking is securely linked to this request without matching your
                name or email.
              </p>
              {calendarUrl ? (
                <iframe
                  className="h-[540px] w-full rounded-lg border"
                  src={calendarUrl}
                  title="Book a retention call"
                />
              ) : (
                <div className="rounded-lg border p-6 text-center text-muted-foreground text-sm">
                  Preparing the secure calendar…
                </div>
              )}
            </div>
          )}

          {isOfferStep && saveOffer && (
            <div className="space-y-4">
              <Alert>
                <AlertTitle>Your next month is covered</AlertTitle>
                <AlertDescription>
                  We will add {saveOffer.currency}{" "}
                  {(saveOffer.amountMinor / 100).toFixed(2)} to your customer
                  wallet. It will automatically cover your next recurring plan
                  charge. Applicable taxes may remain.
                </AlertDescription>
              </Alert>
              <p className="text-muted-foreground text-sm">
                Take the free month and keep everything running, or skip this
                offer to continue to the cancellation confirmation.
              </p>
            </div>
          )}

          {isConfirmationStep && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <label
                  className="font-medium text-sm"
                  htmlFor="cancellation-confirmation"
                >
                  Type CANCEL AND DELETE to schedule cancellation.
                </label>
                <p
                  className="mt-1 text-muted-foreground text-sm"
                  id="cancellation-confirmation-help"
                >
                  Paid access continues until the displayed term end, when
                  publishing and automations stop. Every listed billed workspace
                  and all product data will be permanently deleted on{" "}
                  {cancellation.dataDeletionAt
                    ? format(new Date(cancellation.dataDeletionAt), "PPP")
                    : "the day-60 deletion date"}
                  . Other members lose access and data too. Reactivating before
                  deletion cancels the deletion.
                </p>
                <Input
                  aria-describedby="cancellation-confirmation-help"
                  className="mt-3"
                  id="cancellation-confirmation"
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="CANCEL AND DELETE"
                  value={confirmation}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {step > 1 && (
              <Button
                onClick={() => setStep((value) => value - 1)}
                variant="outline"
              >
                Back
              </Button>
            )}
            {step < totalSteps && !isOfferStep && (
              <Button
                disabled={(step === 2 && !reason) || start.isPending}
                onClick={async () => {
                  if (step === 2) {
                    try {
                      const result = await start.mutateAsync({
                        reason: reason as (typeof reasons)[number][0],
                        comment: comment.trim() || undefined,
                      });
                      setCalendarReference(result.calendarReference);
                      await invalidate();
                    } catch (error) {
                      reportError(error);
                      return;
                    }
                  }
                  setStep((value) => value + 1);
                }}
              >
                {step === 3 ? "Continue without booking" : "Continue"}
              </Button>
            )}
            {isOfferStep && (
              <>
                <Button
                  disabled={acceptOffer.isPending}
                  onClick={() => setStep((value) => value + 1)}
                  variant="outline"
                >
                  Skip and continue to cancellation
                </Button>
                <Button
                  disabled={acceptOffer.isPending || !cancellation.id}
                  onClick={acceptSaveOffer}
                >
                  {acceptOffer.isPending
                    ? "Applying free month…"
                    : "Take one month free"}
                </Button>
              </>
            )}
            {isConfirmationStep && (
              <Button
                disabled={
                  confirmation !== "CANCEL AND DELETE" ||
                  schedule.isPending ||
                  !cancellation.id
                }
                onClick={async () => {
                  if (!cancellation.id) {
                    return;
                  }
                  try {
                    await schedule.mutateAsync({
                      id: cancellation.id,
                      confirmation,
                    });
                    await invalidate();
                    setDialogOpen(false);
                    toast.success("Cancellation scheduled");
                  } catch (error) {
                    reportError(error);
                  }
                }}
                variant="destructive"
              >
                {schedule.isPending ? "Scheduling…" : "Schedule cancellation"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
