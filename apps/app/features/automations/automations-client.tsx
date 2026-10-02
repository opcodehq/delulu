"use client";

import {
  AUTOMATION_DELETED,
  AUTOMATION_TOGGLED,
} from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import type { AutomationScope } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Loading03Icon } from "@delulu/icons";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageSection, PageShell } from "@/shell/navigation/page-shell";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";
import { useApiClient } from "@/shell/providers/api-client";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";
import { AutomationFilters } from "./automation-filters";
import { AutomationList } from "./automation-list";
import {
  automationFromResource,
  getApiErrorDetails,
  useAutomationWorkspace,
} from "./automation-resource";
import { AutomationStats } from "./automation-stats";
import { TemplatePickerDialog } from "./flow-builder/templates/template-picker-dialog";

function RequestError({ error, retry }: { error: unknown; retry: () => void }) {
  const details = getApiErrorDetails(error);
  const title =
    details.kind === "permission"
      ? "You do not have permission to view automations"
      : details.kind === "transport"
        ? "Automations could not be reached"
        : "Automations could not be loaded";
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div>
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="mt-1 max-w-md text-muted-foreground text-sm">
          {details.message}
        </p>
      </div>
      {details.kind === "permission" ? null : (
        <Button onClick={retry} variant="outline">
          Try again
        </Button>
      )}
    </div>
  );
}

function AutomationsResourceRegistry({ scope }: { scope: AutomationScope }) {
  const router = useRouter();
  const analytics = useAnalytics();
  const registry = useResourceRegistry();
  const { resources } = useApiClient();
  const { canManageSocials } = usePermissions();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTrigger, setFilterTrigger] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const pendingIds = useRef(new Set<string>());

  const listResource = useMemo(
    () => resources.automations.list(scope),
    [resources, scope]
  );
  const automationsQuery = useResourceAtom({
    ...listResource,
    queryKey: listResource.queryKey!,
  });
  const automations = useMemo(
    () => (automationsQuery.data?.data ?? []).map(automationFromResource),
    [automationsQuery.data]
  );

  const deleteMutation = useMutationAtom({
    ...resources.automations.remove(scope),
    onMutate: async (id) => {
      await registry.beginOptimisticUpdate({
        queryKey: listResource.queryKey!,
      });
      const previous = registry.getResource(listResource.queryKey!);
      registry.setResource(
        listResource.queryKey!,
        (page: typeof automationsQuery.data) =>
          page
            ? {
                ...page,
                data: page.data.filter((automation) => automation.id !== id),
                total: Math.max(0, page.total - 1),
              }
            : page
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        registry.setResource(listResource.queryKey!, context.previous);
      }
    },
    onSettled: () =>
      registry.invalidateResources({ queryKey: listResource.queryKey! }),
  });

  const toggleMutation = useMutationAtom({
    mutationKey: listResource.queryKey!,
    effect: ({ id, enabled }: { id: string; enabled: boolean }) =>
      resources.automations.update(scope, id).effect({ enabled }),
    onMutate: async ({ id, enabled }) => {
      await registry.beginOptimisticUpdate({
        queryKey: listResource.queryKey!,
      });
      const previous = registry.getResource(listResource.queryKey!);
      registry.setResource(
        listResource.queryKey!,
        (page: typeof automationsQuery.data) =>
          page
            ? {
                ...page,
                data: page.data.map((automation) =>
                  automation.id === id ? { ...automation, enabled } : automation
                ),
              }
            : page
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        registry.setResource(listResource.queryKey!, context.previous);
      }
    },
    onSettled: (_data, _error, variables) =>
      Promise.all([
        registry.invalidateResources({ queryKey: listResource.queryKey! }),
        registry.invalidateResources({
          queryKey: resources.automations.get(scope, variables.id).queryKey,
        }),
      ]),
  });

  const filteredAutomations = useMemo(
    () =>
      automations.filter((automation) => {
        const matchesSearch =
          automation.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          automation.description
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase());
        const matchesStatus =
          filterStatus === "all" ||
          (filterStatus === "active" && automation.enabled) ||
          (filterStatus === "inactive" && !automation.enabled);
        const matchesTrigger =
          filterTrigger === "all" ||
          automation.triggers.some(
            (trigger) => trigger.triggerType === filterTrigger
          );
        return matchesSearch && matchesStatus && matchesTrigger;
      }),
    [automations, filterStatus, filterTrigger, searchQuery]
  );

  const stats = useMemo(() => {
    const active = automations.filter(
      (automation) => automation.enabled
    ).length;
    return {
      total: automations.length,
      active,
      inactive: automations.length - active,
      totalDMsSent: automations.reduce(
        (total, automation) => total + automation.totalDmsSent,
        0
      ),
    };
  }, [automations]);

  const handleDelete = async (automationId: string) => {
    if (!canManageSocials || pendingIds.current.has(automationId)) {
      return;
    }
    pendingIds.current.add(automationId);
    try {
      await deleteMutation.mutateAsync(automationId);
      analytics.capture(AUTOMATION_DELETED, { automation_id: automationId });
      toast.success("Automation deleted successfully");
    } catch (error) {
      const details = getApiErrorDetails(error);
      toast.error(
        details.kind === "permission"
          ? "You do not have permission to delete automations"
          : details.message
      );
    } finally {
      pendingIds.current.delete(automationId);
    }
  };

  const handleToggle = async (automationId: string) => {
    if (!canManageSocials || pendingIds.current.has(automationId)) {
      return;
    }
    const automation = automations.find(
      (candidate) => candidate.id === automationId
    );
    if (!automation) {
      return;
    }
    pendingIds.current.add(automationId);
    const enabled = !automation.enabled;
    try {
      await toggleMutation.mutateAsync({ id: automationId, enabled });
      analytics.capture(AUTOMATION_TOGGLED, {
        automation_id: automationId,
        is_active: enabled,
      });
      toast.success(enabled ? "Automation enabled" : "Automation disabled");
    } catch (error) {
      const details = getApiErrorDetails(error);
      toast.error(
        details.kind === "permission"
          ? "You do not have permission to change automations"
          : details.message
      );
    } finally {
      pendingIds.current.delete(automationId);
    }
  };

  if (automationsQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <Icon
            className="animate-spin text-muted-foreground"
            icon={Loading03Icon}
            size={20}
          />
          <span className="text-muted-foreground">Loading automations...</span>
        </div>
      </div>
    );
  }
  if (automationsQuery.isError) {
    return (
      <RequestError
        error={automationsQuery.error}
        retry={() => automationsQuery.refetch()}
      />
    );
  }

  const handleSelectTemplate = (slug: string | null) => {
    setShowTemplatePicker(false);
    router.push(
      slug ? `/automations/new?template=${slug}` : "/automations/new"
    );
  };

  return (
    <PageShell
      actions={
        <Button
          className="gap-2"
          disabled={!canManageSocials}
          onClick={() => setShowTemplatePicker(true)}
        >
          <Icon icon={Add01Icon} size={16} />
          <span className="hidden sm:inline">Create Automation</span>
          <span className="sm:hidden">New</span>
        </Button>
      }
      description="Turn Instagram comments into DMs automatically — someone comments a keyword, they get a DM with your link."
      page="Automations"
      pages={[]}
      title="DM Automations"
    >
      {canManageSocials ? null : (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
          You can view automations, but your workspace role cannot change them.
        </p>
      )}
      <AutomationStats stats={stats} />
      <PageSection>
        <AutomationFilters
          filterStatus={filterStatus}
          filterTrigger={filterTrigger}
          searchQuery={searchQuery}
          setFilterStatus={setFilterStatus}
          setFilterTrigger={setFilterTrigger}
          setSearchQuery={setSearchQuery}
          setViewMode={setViewMode}
          viewMode={viewMode}
        />
        <AutomationList
          automations={filteredAutomations}
          canManage={canManageSocials}
          onDelete={handleDelete}
          onToggle={handleToggle}
          viewMode={viewMode}
        />
      </PageSection>
      <TemplatePickerDialog
        onClose={() => setShowTemplatePicker(false)}
        onSelect={handleSelectTemplate}
        open={showTemplatePicker && canManageSocials}
      />
    </PageShell>
  );
}

export default function AutomationsClient() {
  const workspace = useAutomationWorkspace();
  if (workspace.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Icon
          className="animate-spin text-muted-foreground"
          icon={Loading03Icon}
          size={20}
        />
      </div>
    );
  }
  if (workspace.isError) {
    return (
      <RequestError error={workspace.error} retry={() => workspace.refetch()} />
    );
  }
  if (!workspace.scope) {
    return (
      <RequestError
        error={new Error("No workspace is available for this account")}
        retry={() => workspace.refetch()}
      />
    );
  }
  return <AutomationsResourceRegistry scope={workspace.scope} />;
}
