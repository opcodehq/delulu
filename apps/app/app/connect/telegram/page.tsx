"use client";

import { SignInButton, useAuth } from "@delulu/auth";
import { createApiClient, runEffect } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { useEffect, useMemo, useState } from "react";
import { AuthorizationShell } from "../../oauth/authorization-shell";

export default function ConnectTelegramPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [challenge, setChallenge] = useState("");
  const [workspaces, setWorkspaces] = useState<
    readonly { workspaceId: string; name: string }[]
  >([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "pending" | "error"
  >("loading");
  const [error, setError] = useState("");
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl:
          process.env.NEXT_PUBLIC_API_URL ??
          (process.env.NODE_ENV === "development"
            ? "http://localhost:8788"
            : "https://api.delulu.social"),
        getToken: async () => (await getToken()) ?? "",
      }),
    [getToken]
  );
  useEffect(() => {
    setChallenge(window.location.hash.slice(1));
    if (!(isLoaded && isSignedIn)) {
      return;
    }
    let active = true;
    runEffect(client.agentChannels.workspaces())
      .then((items) => {
        if (!active) {
          return;
        }
        setWorkspaces(items);
        setWorkspaceId(items[0]?.workspaceId ?? "");
        setState("ready");
      })
      .catch(() => {
        if (active) {
          setError(
            "Unable to load your eligible workspaces. Try again shortly."
          );
          setState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [client, isLoaded, isSignedIn]);
  async function confirm() {
    setState("saving");
    setError("");
    try {
      await runEffect(
        client.agentChannels.confirm({ payload: { challenge, workspaceId } })
      );
      window.history.replaceState(null, "", window.location.pathname);
      setState("pending");
    } catch {
      setError(
        "Could not connect. Verify your email and request a fresh connection link in Telegram."
      );
      setState("ready");
    }
  }
  return (
    <AuthorizationShell>
      <div className="space-y-1.5">
        <h1 className="font-semibold text-lg tracking-tight">
          Connect Telegram
        </h1>
        <p className="text-muted-foreground text-sm">
          Give your Telegram assistant access to a workspace. Your memory and
          skills stay with your Delulu account. Publishing still needs your
          approval.
        </p>
      </div>
      <DottedSeparator className="my-5" />
      <div className="flex flex-col gap-4 text-sm">
        {isLoaded && !isSignedIn ? (
          <SignInButton mode="modal">
            <Button className="min-h-11">Sign in to Delulu</Button>
          </SignInButton>
        ) : state === "pending" ? (
          <output>
            Return to Telegram and confirm the connection. Check that the
            account shown there is yours.
          </output>
        ) : (
          <>
            {state === "loading" ? (
              <output>Loading your workspaces…</output>
            ) : state === "error" ? null : workspaces.length ? (
              <>
                <label htmlFor="workspace">Workspace</label>
                <select
                  className="min-h-11 rounded-md border bg-background px-3"
                  disabled={state === "saving"}
                  id="workspace"
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  value={workspaceId}
                >
                  {workspaces.map((w) => (
                    <option key={w.workspaceId} value={w.workspaceId}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <Button
                  className="min-h-11"
                  disabled={!(challenge && workspaceId) || state === "saving"}
                  onClick={confirm}
                >
                  {state === "saving"
                    ? "Connecting…"
                    : "Connect this workspace"}
                </Button>
                {!challenge && (
                  <p>
                    Open this page using the Connect Delulu button in Telegram.
                  </p>
                )}
              </>
            ) : (
              <p>
                This assistant is currently invite-only. Ask for beta access,
                then open a fresh connection link in Telegram.
              </p>
            )}
            {error && (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </AuthorizationShell>
  );
}
