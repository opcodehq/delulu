"use client";

import { useAuth, useUser } from "@delulu/auth";
import { Button } from "@delulu/design-system/components/ui/button";
import { Checkbox } from "@delulu/design-system/components/ui/checkbox";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthorizationShell } from "@/app/oauth/authorization-shell";
import {
  ROLE_SCOPE_CEILING,
  SCOPE_LABELS,
  type WorkspaceRole,
} from "@/app/oauth/scope-labels";

// Same resolution the app-wide API client uses (see providers/api-client.tsx).
const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8788"
    : "https://api.delulu.social");

const WHITESPACE = /\s+/;

interface Membership {
  readonly workspaceId: string;
  readonly name: string;
  readonly isPersonal: boolean;
  readonly role: WorkspaceRole;
}

export interface ConsentRequest {
  readonly responseType: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
  readonly resource: string;
}

export function ConsentClient({
  request,
  clientName,
}: {
  readonly request: ConsentRequest;
  readonly clientName: string;
}) {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [workspaces, setWorkspaces] = useState<Membership[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "approving" | "denying">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  // Scopes the client asked for, limited to ones we can describe.
  const requestedScopes = useMemo(
    () =>
      request.scope
        .split(WHITESPACE)
        .filter(Boolean)
        .filter((scope) => scope in SCOPE_LABELS),
    [request.scope]
  );

  const activeWorkspace = workspaces?.find(
    (w) => w.workspaceId === workspaceId
  );

  // Requested scopes ∩ the selected workspace's role ceiling.
  const grantableScopes = useMemo(() => {
    if (!activeWorkspace) {
      return [] as string[];
    }
    const ceiling = new Set(ROLE_SCOPE_CEILING[activeWorkspace.role]);
    return requestedScopes.filter((scope) => ceiling.has(scope));
  }, [activeWorkspace, requestedScopes]);

  // Load the user's workspaces once, default to the personal workspace.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        const response = await fetch(`${apiBaseUrl}/v1/me/workspaces`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error("Could not load your workspaces.");
        }
        const payload = (await response.json()) as { data: Membership[] };
        if (cancelled) {
          return;
        }
        const list = payload.data ?? [];
        setWorkspaces(list);
        const initial =
          list.find((w) => w.isPersonal)?.workspaceId ??
          list[0]?.workspaceId ??
          "";
        setWorkspaceId(initial);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setWorkspaces([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Default every grantable scope to checked whenever the workspace changes.
  useEffect(() => {
    setSelected(new Set(grantableScopes));
  }, [grantableScopes]);

  const toggle = useCallback((scope: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }, []);

  const deny = () => {
    setStatus("denying");
    try {
      const url = new URL(request.redirectUri);
      url.searchParams.set("error", "access_denied");
      if (request.state) {
        url.searchParams.set("state", request.state);
      }
      window.location.href = url.toString();
    } catch {
      setError("The application supplied an invalid redirect URL.");
      setStatus("idle");
    }
  };

  const approve = async () => {
    setStatus("approving");
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      const scope = grantableScopes.filter((s) => selected.has(s)).join(" ");
      const response = await fetch(`${apiBaseUrl}/oauth/authorize/finalize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          client_id: request.clientId,
          redirect_uri: request.redirectUri,
          scope,
          workspace_id: workspaceId,
          state: request.state,
          code_challenge: request.codeChallenge,
          code_challenge_method: request.codeChallengeMethod,
          ...(request.resource ? { resource: request.resource } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        redirect_to?: string;
        error_description?: string;
        error?: string;
      };
      if (!(response.ok && payload.redirect_to)) {
        throw new Error(
          payload.error_description ||
            payload.error ||
            "Authorization failed. Please try again."
        );
      }
      window.location.href = payload.redirect_to;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("idle");
    }
  };

  const loading = workspaces === null;
  const nothingGranted = selected.size === 0;
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <AuthorizationShell>
      <div className="space-y-1.5">
        <h1 className="font-semibold text-lg tracking-tight">
          Authorize {clientName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {clientName} is requesting access to your Delulu account
          {email ? ` (${email})` : ""}.
        </p>
      </div>

      <DottedSeparator className="my-5" />

      <div className="space-y-2">
        <Label htmlFor="workspace">Workspace</Label>
        <Select onValueChange={setWorkspaceId} value={workspaceId}>
          <SelectTrigger className="w-full" id="workspace">
            <SelectValue
              placeholder={loading ? "Loading…" : "Select a workspace"}
            />
          </SelectTrigger>
          <SelectContent>
            {(workspaces ?? []).map((w) => (
              <SelectItem key={w.workspaceId} value={w.workspaceId}>
                {w.name}
                {w.isPersonal ? " (Personal)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeWorkspace ? (
          <p className="text-muted-foreground text-xs">
            Access is limited to this workspace and your role here (
            {activeWorkspace.role}).
          </p>
        ) : null}
      </div>

      <DottedSeparator className="my-5" />

      <div className="space-y-3">
        <p className="font-medium text-sm">This will allow it to:</p>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading permissions…</p>
        ) : grantableScopes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Your role in this workspace can’t grant the requested permissions.
            Pick another workspace.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {grantableScopes.map((scope) => (
              <li key={scope}>
                <Label
                  className="items-start font-normal text-foreground"
                  htmlFor={`scope-${scope}`}
                >
                  <Checkbox
                    checked={selected.has(scope)}
                    className="mt-0.5"
                    id={`scope-${scope}`}
                    onCheckedChange={() => toggle(scope)}
                  />
                  <span>{SCOPE_LABELS[scope]}</span>
                </Label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button
          disabled={status !== "idle"}
          onClick={deny}
          type="button"
          variant="outline"
        >
          Deny
        </Button>
        <Button
          disabled={status !== "idle" || loading || nothingGranted}
          onClick={approve}
          type="button"
        >
          {status === "approving" ? "Authorizing…" : "Authorize"}
        </Button>
      </div>
    </AuthorizationShell>
  );
}
