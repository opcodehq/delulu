"use client";

import { Logo } from "@delulu/design-system/components/logo";
import { Button } from "@delulu/design-system/components/ui/button";
import { Card } from "@delulu/design-system/components/ui/card";
import {
  RadioGroup,
  RadioGroupItem,
} from "@delulu/design-system/components/ui/radio-group";
import { SocialIcon } from "@delulu/design-system/components/ui/social-icon";
import { Icon } from "@delulu/design-system/providers/icon";
import { Loading03Icon } from "@delulu/icons";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface LinkedInTarget {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly type: "member" | "organization";
}

interface CompletionResult {
  readonly status?: "created" | "updated" | "transfer_required";
  readonly name?: string;
  readonly profileId?: string;
  readonly connectionId?: string;
  readonly sourceWorkspaceId?: string;
  readonly transferToken?: string;
  readonly client?: "cli" | "mcp";
  readonly returnTarget?: "socials" | "onboarding-connect";
  readonly error?: { readonly message?: string };
}

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8788"
    : "https://api.delulu.social");

const callbackDestination = (result: CompletionResult): string => {
  const path =
    result.returnTarget === "onboarding-connect"
      ? "/onboarding?step=connect"
      : "/socials";
  const url = new URL(path, window.location.origin);
  if (result.status === "transfer_required") {
    url.searchParams.set("notification", "transfer_required");
    url.searchParams.set("provider", "linkedin");
    if (result.connectionId) {
      url.searchParams.set("connectionId", result.connectionId);
    }
    if (result.sourceWorkspaceId) {
      url.searchParams.set("sourceWorkspaceId", result.sourceWorkspaceId);
    }
    if (result.transferToken) {
      url.searchParams.set("transferToken", result.transferToken);
    }
  } else {
    url.searchParams.set("success", "true");
    url.searchParams.set("provider", "linkedin");
    if (result.client) {
      url.searchParams.set("client", result.client);
    }
    if (result.name) {
      url.hash = new URLSearchParams({
        username: result.name,
        ...(result.profileId ? { profileId: result.profileId } : {}),
      }).toString();
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

export function LinkedInAccountSelect() {
  const searchParams = useSearchParams();
  const selectionId = searchParams.get("selection") ?? "";
  const state = searchParams.get("state") ?? "";
  const [targets, setTargets] = useState<readonly LinkedInTarget[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setTargets([]);
    setSelected("");
    if (!(selectionId && state)) {
      setError("This LinkedIn connection attempt is invalid. Start again.");
      setLoading(false);
      return;
    }
    const query = new URLSearchParams({ selection: selectionId, state });
    fetch(`${apiBaseUrl}/v1/connections/linkedin/targets?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          targets?: readonly LinkedInTarget[];
          error?: { message?: string };
        };
        if (!(response.ok && body.targets?.length)) {
          throw new Error(
            body.error?.message ?? "No LinkedIn accounts are available."
          );
        }
        if (controller.signal.aborted) {
          return;
        }
        setTargets(body.targets);
        setSelected(body.targets[0]?.id ?? "");
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your LinkedIn accounts."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [selectionId, state]);

  const connect = async () => {
    if (!selected || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/v1/connections/linkedin/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, selectionId, targetId: selected }),
        }
      );
      const result = (await response.json()) as CompletionResult;
      if (
        !response.ok ||
        result.error ||
        !["created", "updated", "transfer_required"].includes(
          result.status ?? ""
        )
      ) {
        throw new Error(
          result.error?.message ?? "Could not connect this LinkedIn account."
        );
      }
      window.location.assign(callbackDestination(result));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect this LinkedIn account."
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <section className="w-full max-w-lg space-y-6 rounded-2xl border bg-background p-7 shadow-sm">
        <Logo />
        <div className="space-y-2">
          <h1 className="font-semibold text-2xl tracking-tight">
            Where do you want to post?
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Choose your LinkedIn profile or a Page you manage. You can connect
            another destination later.
          </p>
        </div>

        {loading ? (
          <Card
            className="flex min-h-28 items-center justify-center gap-3"
            role="status"
          >
            <Icon className="animate-spin" icon={Loading03Icon} size={20} />
            <span className="text-muted-foreground text-sm">
              Loading LinkedIn destinations…
            </span>
          </Card>
        ) : error && targets.length === 0 ? (
          <Card className="p-4 text-destructive text-sm">{error}</Card>
        ) : (
          <RadioGroup
            className="gap-3"
            disabled={submitting}
            onValueChange={setSelected}
            value={selected}
          >
            {targets.map((target, index) => (
              <label
                className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-sky-600 has-[[data-state=checked]]:bg-sky-600/5"
                htmlFor={`linkedin-target-${index}`}
                key={target.id}
              >
                <RadioGroupItem
                  id={`linkedin-target-${index}`}
                  value={target.id}
                />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-700">
                  <SocialIcon className="size-5 text-white" type="LINKEDIN" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {target.name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {target.type === "organization"
                      ? "LinkedIn Page"
                      : "Personal profile"}
                    {target.username ? ` · ${target.username}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}

        {error && targets.length > 0 ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : null}
        {!loading &&
        targets.length > 0 &&
        !targets.some((target) => target.type === "organization") ? (
          <output className="block space-y-2 rounded-xl border p-4 text-sm">
            <p>
              {searchParams.get("pages") === "unavailable"
                ? "We couldn't load your LinkedIn Pages. You can continue with your profile, or go back and reconnect to try again."
                : "LinkedIn returned no eligible Pages for this account. Check that you have permission to publish on the Page, or reconnect with the account that manages it."}
            </p>
            <a className="flex min-h-11 items-center underline" href="/socials">
              Back to Connected Accounts
            </a>
          </output>
        ) : null}
        <Button
          className="min-h-11 w-full"
          disabled={loading || submitting || !selected}
          onClick={connect}
        >
          {submitting ? (
            <>
              <Icon
                className="mr-2 animate-spin"
                icon={Loading03Icon}
                size={18}
              />
              Connecting…
            </>
          ) : (
            "Connect destination"
          )}
        </Button>
        {!loading && targets.length === 0 ? (
          <a
            className="flex min-h-11 items-center justify-center text-sm underline"
            href="/socials"
          >
            Back to Connected Accounts
          </a>
        ) : null}
      </section>
    </main>
  );
}
