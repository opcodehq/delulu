"use client";

import { SignInButton, useAuth } from "@delulu/auth";
import { createApiClient, runEffect } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { useEffect, useMemo, useState } from "react";
import { AuthorizationShell } from "../../oauth/authorization-shell";

const PLATFORMS: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  TWITTER: "X / Twitter",
};

export default function ConnectAccountPage() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const [target, setTarget] = useState<{
    workspaceId: string;
    name: string;
    platform: string;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "https://api.delulu.social",
        getToken: async () => (await getToken()) ?? "",
      }),
    [getToken]
  );
  useEffect(() => {
    setTarget(undefined);
    setError("");
    if (!(isLoaded && isSignedIn)) {
      return;
    }
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const workspaceId = params.get("workspaceId");
    const platform = params.get("platform") ?? "";
    if (!(workspaceId && Object.hasOwn(PLATFORMS, platform))) {
      setError("Invalid connection link. Request a new one in Telegram.");
      return;
    }
    runEffect(client.agentChannels.workspaces())
      .then((workspaces) => {
        if (!active) {
          return;
        }
        const workspace = workspaces.find(
          (item) => item.workspaceId === workspaceId
        );
        if (!workspace) {
          setError("This account cannot connect to the requested workspace.");
          return;
        }
        setTarget({ workspaceId, name: workspace.name, platform });
      })
      .catch(() => {
        if (active) {
          setError("Unable to verify workspace access. Refresh to try again.");
        }
      });
    return () => {
      active = false;
    };
  }, [client, isLoaded, isSignedIn, userId]);

  async function connect() {
    if (!target || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await runEffect(
        client.connections.mint({
          params: {
            workspaceId: target.workspaceId,
            platform: target.platform,
          },
          payload: { includeInsights: true, client: "cli" },
        })
      );
      const url = new URL(result.url);
      if (url.protocol !== "https:") {
        throw new Error("Invalid authorization URL");
      }
      window.location.assign(url.href);
    } catch {
      setError(
        "Could not start authorization. The provider may not be configured in this environment. Your account has not been connected."
      );
      setBusy(false);
    }
  }
  return (
    <AuthorizationShell>
      <div className="space-y-1.5">
        <h1 className="font-semibold text-lg tracking-tight">
          Connect {target ? PLATFORMS[target.platform] : "a social account"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {target
            ? `Connect to ${target.name}. You'll review access with the provider before anything is linked.`
            : "Sign in to verify the workspace requested by your assistant."}
        </p>
      </div>
      <DottedSeparator className="my-5" />
      {isLoaded && !isSignedIn ? (
        <SignInButton mode="modal">
          <Button className="min-h-11 w-full">Sign in to Delulu</Button>
        </SignInButton>
      ) : target ? (
        <Button className="min-h-11 w-full" disabled={busy} onClick={connect}>
          {busy
            ? "Opening authorization…"
            : `Continue to ${PLATFORMS[target.platform]}`}
        </Button>
      ) : error ? null : (
        <output className="text-muted-foreground text-sm">
          Checking workspace…
        </output>
      )}
      {error && (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <p className="mt-4 text-muted-foreground text-sm">
        After connecting, return to Telegram and ask your assistant to refresh
        your accounts. Publishing still requires approval.
      </p>
    </AuthorizationShell>
  );
}
