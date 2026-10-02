"use client";

import { useAuth, useUser } from "@delulu/auth";
import { Button } from "@delulu/design-system/components/ui/button";
import { Checkbox } from "@delulu/design-system/components/ui/checkbox";
import { DottedSeparator } from "@delulu/design-system/components/ui/dotted-separator";
import { Input } from "@delulu/design-system/components/ui/input";
import { Label } from "@delulu/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@delulu/design-system/components/ui/select";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AuthorizationShell } from "@/app/oauth/authorization-shell";
import {
  ROLE_SCOPE_CEILING,
  SCOPE_LABELS,
  type WorkspaceRole,
} from "@/app/oauth/scope-labels";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8788"
    : "https://api.delulu.social");

interface Membership {
  workspaceId: string;
  name: string;
  isPersonal: boolean;
  role: WorkspaceRole;
}

function DeviceApprovalForm() {
  const params = useSearchParams();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [userCode, setUserCode] = useState(params.get("user_code") ?? "");
  const [status, setStatus] = useState<
    "idle" | "working" | "approved" | "denied"
  >("idle");
  const [error, setError] = useState<string>();
  const [details, setDetails] = useState<{
    clientId: string;
    clientName: string;
    scopes: string[];
    resource: string | null;
  }>();
  const [workspaces, setWorkspaces] = useState<Membership[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const workspaceHint = params.get("workspace_id");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userCode) {
      return;
    }
    let active = true;
    getToken()
      .then(async (token) => {
        if (!token) {
          return;
        }
        const headers = { authorization: `Bearer ${token}` };
        const [transactionResponse, workspacesResponse] = await Promise.all([
          fetch(
            `${apiBaseUrl}/oauth/device/transaction?user_code=${encodeURIComponent(userCode)}`,
            { headers }
          ),
          fetch(`${apiBaseUrl}/v1/me/workspaces`, { headers }),
        ]);
        if (active && transactionResponse.ok && workspacesResponse.ok) {
          const transaction = (await transactionResponse.json()) as {
            clientId: string;
            clientName: string;
            scopes: string[];
            resource: string | null;
          };
          const memberships = (await workspacesResponse.json()) as {
            data: Membership[];
          };
          const list = memberships.data ?? [];
          setDetails(transaction);
          setWorkspaces(list);
          setWorkspaceId(
            list.find((workspace) => workspace.workspaceId === workspaceHint)
              ?.workspaceId ??
              list.find((workspace) => workspace.isPersonal)?.workspaceId ??
              list[0]?.workspaceId ??
              ""
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [getToken, userCode, workspaceHint]);

  const activeWorkspace = workspaces?.find(
    (workspace) => workspace.workspaceId === workspaceId
  );
  const grantableScopes = useMemo(() => {
    if (!(details && activeWorkspace)) {
      return [];
    }
    const ceiling = new Set(ROLE_SCOPE_CEILING[activeWorkspace.role]);
    return details.scopes.filter((scope) => ceiling.has(scope));
  }, [activeWorkspace, details]);

  useEffect(() => {
    setSelected(new Set(grantableScopes));
  }, [grantableScopes]);

  const toggle = useCallback((scope: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }, []);

  const decide = async (decision: "approve" | "deny") => {
    setStatus("working");
    setError(undefined);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your sign-in session is unavailable");
      }
      const response = await fetch(`${apiBaseUrl}/oauth/device/${decision}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          user_code: userCode,
          ...(decision === "approve"
            ? {
                scope: grantableScopes
                  .filter((scope) => selected.has(scope))
                  .join(" "),
                workspace_id: workspaceId,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error_description?: string;
        } | null;
        throw new Error(body?.error_description ?? "Authorization failed");
      }
      setStatus(decision === "approve" ? "approved" : "denied");
    } catch (cause) {
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Authorization failed");
    }
  };

  if (status === "approved" || status === "denied") {
    return (
      <AuthorizationShell>
        <div className="space-y-1.5">
          <h1 className="font-semibold text-lg tracking-tight">
            {status === "approved" ? "Agent authorized" : "Access denied"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {status === "approved"
              ? "Return to your agent. It can continue setup now."
              : "No credentials were issued. You can close this tab."}
          </p>
        </div>
      </AuthorizationShell>
    );
  }

  const email = user?.primaryEmailAddress?.emailAddress;
  const nothingGranted = selected.size === 0;

  return (
    <AuthorizationShell>
      <div className="space-y-1.5">
        <h1 className="font-semibold text-lg tracking-tight">
          Authorize {details?.clientName ?? "agent access"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {details?.clientName ?? "The agent"} is requesting access to your
          Delulu account{email ? ` (${email})` : ""}.
        </p>
      </div>

      <DottedSeparator className="my-5" />

      <div className="space-y-2">
        <Label htmlFor="user-code">Verification code</Label>
        <Input
          autoComplete="one-time-code"
          id="user-code"
          onChange={(event) => setUserCode(event.target.value.toUpperCase())}
          placeholder="ABCD-EFGH"
          value={userCode}
        />
        {details?.resource ? (
          <p className="text-muted-foreground text-xs">
            Access applies to {details.resource} and will be bound to the
            workspace selected below.
          </p>
        ) : null}
      </div>

      <DottedSeparator className="my-5" />

      <div className="space-y-2">
        <Label htmlFor="workspace">Workspace</Label>
        <Select onValueChange={setWorkspaceId} value={workspaceId}>
          <SelectTrigger className="w-full" id="workspace">
            <SelectValue
              placeholder={
                workspaces === null ? "Loading…" : "Select a workspace"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(workspaces ?? []).map((workspace) => (
              <SelectItem
                key={workspace.workspaceId}
                value={workspace.workspaceId}
              >
                {workspace.name}
                {workspace.isPersonal ? " (Personal)" : " (Organization)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeWorkspace ? (
          <p className="text-muted-foreground text-xs">
            Access is bound to this workspace and your current role here (
            {activeWorkspace.role}).
          </p>
        ) : null}
      </div>

      <DottedSeparator className="my-5" />

      <div className="space-y-3">
        <p className="font-medium text-sm">This will allow it to:</p>
        {details && activeWorkspace ? (
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
                  <span>{SCOPE_LABELS[scope] ?? scope}</span>
                </Label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Loading permissions…</p>
        )}
      </div>

      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button
          disabled={status === "working"}
          onClick={() => decide("deny")}
          type="button"
          variant="outline"
        >
          Deny
        </Button>
        <Button
          disabled={
            status === "working" ||
            !details ||
            !activeWorkspace ||
            nothingGranted
          }
          onClick={() => decide("approve")}
          type="button"
        >
          {status === "working" ? "Authorizing…" : "Authorize"}
        </Button>
      </div>
    </AuthorizationShell>
  );
}

export default function DeviceApprovalPage() {
  return (
    <Suspense
      fallback={
        <AuthorizationShell>
          <div className="space-y-1.5">
            <h1 className="font-semibold text-lg tracking-tight">
              Authorize agent access
            </h1>
            <p className="text-muted-foreground text-sm">
              Loading verification request…
            </p>
          </div>
        </AuthorizationShell>
      }
    >
      <DeviceApprovalForm />
    </Suspense>
  );
}
