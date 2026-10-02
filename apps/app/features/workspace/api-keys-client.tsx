"use client";

import { Badge } from "@delulu/design-system/components/ui/badge";
import { Button } from "@delulu/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@delulu/design-system/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@delulu/design-system/components/ui/dialog";
import { Input } from "@delulu/design-system/components/ui/input";
import { Switch } from "@delulu/design-system/components/ui/switch";
import { Icon } from "@delulu/design-system/providers/icon";
import {
  Copy01Icon,
  Delete02Icon,
  Key01Icon,
  Loading03Icon,
  Tick01Icon,
} from "@delulu/icons";
import React from "react";
import { toast } from "sonner";
import { OperationsError } from "@/features/workspace/query-state";
import { DottedColumns } from "@/shell/navigation/dotted-columns";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";
import { useApiClient } from "@/shell/providers/api-client";
import { useWorkspaceSelection } from "@/shell/providers/workspace";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";

const SCOPE_OPTIONS = [
  {
    value: "posts:read",
    label: "Read Posts",
    description: "View posts and their status",
  },
  {
    value: "posts:write",
    label: "Write Posts",
    description: "Create, update, and delete posts",
  },
  {
    value: "reviews:read",
    label: "Read Reviews",
    description: "Check review status and feedback",
  },
  {
    value: "accounts:read",
    label: "Read Accounts",
    description: "View connected social accounts",
  },
  {
    value: "stats:read",
    label: "Read Stats",
    description: "View analytics and statistics",
  },
] as const;

type ScopeValue = (typeof SCOPE_OPTIONS)[number]["value"];

export function ApiKeysClient() {
  const { resources } = useApiClient();
  const workspace = useWorkspaceSelection();
  const registry = useResourceRegistry();
  const workspaceId = workspace.workspaceId ?? "";
  const listResource = resources.admin.apiKeys(workspaceId, {
    limit: 100,
    offset: 0,
  });
  const apiKeysQuery = useResourceAtom({
    ...listResource,
    queryKey: listResource.queryKey!,
    enabled: !!workspace.workspaceId,
  });
  const createApiKeyMutation = useMutationAtom(
    resources.admin.createApiKey(workspaceId)
  );
  const revokeApiKeyMutation = useMutationAtom(
    resources.admin.revokeApiKey(workspaceId)
  );
  const apiKeys = apiKeysQuery.data?.data;

  const [showCreate, setShowCreate] = React.useState(false);
  const [showRevoke, setShowRevoke] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [selectedScopes, setSelectedScopes] = React.useState<ScopeValue[]>([
    "posts:read",
    "posts:write",
    "reviews:read",
    "accounts:read",
  ]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [newKeyRaw, setNewKeyRaw] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }
    if (selectedScopes.length === 0) {
      toast.error("Please select at least one scope");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createApiKeyMutation.mutateAsync({
        name: name.trim(),
        role: selectedScopes.some((scope) => scope.endsWith(":write"))
          ? "editor"
          : "viewer",
        scopes: selectedScopes,
      });
      setNewKeyRaw(result.token);
      await registry.invalidateResources({
        queryKey: listResource.queryKey!,
      });
      toast.success("API key created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      await revokeApiKeyMutation.mutateAsync(keyId);
      await registry.invalidateResources({
        queryKey: listResource.queryKey!,
      });
      toast.success("API key revoked");
      setShowRevoke(null);
    } catch {
      toast.error("Failed to revoke API key");
    }
  };

  const handleCopy = () => {
    if (newKeyRaw) {
      navigator.clipboard.writeText(newKeyRaw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseCreate = () => {
    setShowCreate(false);
    setName("");
    setSelectedScopes([
      "posts:read",
      "posts:write",
      "reviews:read",
      "accounts:read",
    ]);
    setNewKeyRaw(null);
    setCopied(false);
  };

  return (
    <PageShell
      actions={
        <Button onClick={() => setShowCreate(true)}>
          <Icon className="mr-1.5" icon={Key01Icon} size={14} />
          Create Key
        </Button>
      }
      description="Programmatic access for AI agents and scripts to publish content to Delulu Social."
      page="API Keys"
      pages={["Settings"]}
    >
      {workspace.workspace && !workspace.workspace.isPersonal && (
        <p className="text-muted-foreground text-sm">
          Org-scoped keys submit posts for review instead of publishing
          directly.
        </p>
      )}

      {/* Key list */}
      {workspace.error || apiKeysQuery.error ? (
        <OperationsError
          error={(workspace.error ?? apiKeysQuery.error)!}
          onRetry={async () => {
            await (workspace.error
              ? workspace.retry()
              : apiKeysQuery.refetch());
          }}
        />
      ) : apiKeys === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Icon
            className="animate-spin text-muted-foreground"
            icon={Loading03Icon}
            size={20}
          />
        </div>
      ) : apiKeys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="rounded-full bg-muted p-3">
              <Icon
                className="text-muted-foreground"
                icon={Key01Icon}
                size={24}
              />
            </div>
            <p className="font-medium text-sm">No API keys yet</p>
            <p className="max-w-xs text-center text-muted-foreground text-xs">
              Create an API key to let your AI agent push content to Delulu
              Social for review.
            </p>
            <Button
              className="mt-2"
              onClick={() => setShowCreate(true)}
              size="sm"
              variant="outline"
            >
              Create your first key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 p-0">
          {apiKeys.map((key, i) => (
            <div
              className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30 ${
                i < apiKeys.length - 1 ? "border-b" : ""
              }`}
              key={key.id}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon
                  className="text-muted-foreground"
                  icon={Key01Icon}
                  size={14}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  <Badge className="text-[10px]" variant="secondary">
                    {key.role}
                  </Badge>
                  <span className="font-mono text-muted-foreground text-xs">
                    {key.keyPrefix}...
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
                  <span>{key.revokedAt ? "Revoked" : "Active"}</span>
                  {key.lastUsedAt && (
                    <>
                      <span>&middot;</span>
                      <span>
                        Used {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                  <span>&middot;</span>
                  <span>
                    {key.scopes.length} permission
                    {key.scopes.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <Button
                className="w-8 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={!!key.revokedAt}
                onClick={() => setShowRevoke(key.id)}
                size="icon"
                variant="ghost"
              >
                <Icon icon={Delete02Icon} size={14} />
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* Quick start */}
      <PageSection
        action={
          <a
            className="text-primary text-xs hover:underline"
            href="https://api.delulu.social/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Full API Docs &rarr;
          </a>
        }
        title="Quick Start"
      >
        <DottedColumns breakpoint="lg">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  1
                </span>
                Get Your Accounts
              </CardTitle>
              <CardDescription>
                List your connected social accounts to get their IDs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                {`curl https://api.delulu.social/v1/accounts \\
  -H "Authorization: Bearer YOUR_KEY"`}
              </pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  2
                </span>
                Create a Post
              </CardTitle>
              <CardDescription>
                Post to those accounts. Org-scoped keys submit for review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                {`curl -X POST https://api.delulu.social/v1/posts \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "caption": "Hello from AI!",
    "account_ids": ["ACCOUNT_ID"]
  }'`}
              </pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  3
                </span>
                Check Review Status
              </CardTitle>
              <CardDescription>
                Poll for approval and get rejection feedback.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                {`curl https://api.delulu.social/v1/posts \\
  /POST_ID/review \\
  -H "Authorization: Bearer YOUR_KEY"

# { "status": "APPROVED" }`}
              </pre>
            </CardContent>
          </Card>
        </DottedColumns>
      </PageSection>

      {/* Create dialog */}
      <Dialog
        onOpenChange={(open) => !open && handleCloseCreate()}
        open={showCreate}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newKeyRaw ? "API Key Created" : "Create API Key"}
            </DialogTitle>
            {!newKeyRaw && (
              <DialogDescription>
                This key will be shown only once. Store it securely.
              </DialogDescription>
            )}
          </DialogHeader>

          {newKeyRaw ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <p className="font-medium text-amber-800 text-xs dark:text-amber-200">
                  Copy this key now. You won't be able to see it again.
                </p>
              </div>
              <div className="flex gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2.5 font-mono text-xs">
                  {newKeyRaw}
                </code>
                <Button
                  className="shrink-0"
                  onClick={handleCopy}
                  size="sm"
                  variant="outline"
                >
                  <Icon icon={copied ? Tick01Icon : Copy01Icon} size={14} />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCloseCreate}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="font-medium text-sm" htmlFor="key-name">
                  Name
                </label>
                <Input
                  id="key-name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Claude Agent"
                  value={name}
                />
              </div>

              <div className="space-y-2">
                <p className="font-medium text-sm">Permissions</p>
                <div className="space-y-1 rounded-lg border p-3">
                  {SCOPE_OPTIONS.map((scope) => (
                    <div
                      className="flex items-center justify-between rounded-md px-1 py-2"
                      key={scope.value}
                    >
                      <div className="mr-3">
                        <p className="text-sm">{scope.label}</p>
                        <p className="text-muted-foreground text-xs">
                          {scope.description}
                        </p>
                      </div>
                      <Switch
                        checked={selectedScopes.includes(scope.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScopes([...selectedScopes, scope.value]);
                          } else {
                            setSelectedScopes(
                              selectedScopes.filter((s) => s !== scope.value)
                            );
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button onClick={handleCloseCreate} variant="ghost">
                  Cancel
                </Button>
                <Button disabled={isCreating} onClick={handleCreate}>
                  {isCreating ? "Creating..." : "Create Key"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog
        onOpenChange={(open) => !open && setShowRevoke(null)}
        open={!!showRevoke}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              This key will stop working immediately. Any AI agents or scripts
              using it will lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button onClick={() => setShowRevoke(null)} variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={() => showRevoke && handleRevoke(showRevoke)}
              variant="destructive"
            >
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
