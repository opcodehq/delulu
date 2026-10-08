"use client";

import {
  AUTOMATION_CREATED,
  AUTOMATION_TOGGLED,
  AUTOMATION_UPDATED,
} from "@delulu/analytics/events";
import { useAnalytics } from "@delulu/analytics/posthog/client";
import type { AutomationScope } from "@delulu/client";
import { Button } from "@delulu/design-system/components/ui/button";
import { useIsMobile } from "@delulu/design-system/hooks/use-mobile";
import { Icon } from "@delulu/design-system/providers/icon";
import { Loading03Icon } from "@delulu/icons";
import {
  type Connection,
  type Edge,
  type Node,
  ReactFlowProvider,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type AutomationResourceView,
  automationConfigurationChanged,
  automationFromResource,
  getApiErrorDetails,
  triggersToResource,
  useAutomationWorkspace,
} from "@/features/automations/automation-resource";
import { FlowActionsProvider } from "@/features/automations/flow-builder/flow-actions";
import {
  FlowCanvas,
  type FocusRequest,
} from "@/features/automations/flow-builder/flow-canvas";
import { FlowSidebarPanel } from "@/features/automations/flow-builder/flow-sidebar-panel";
import { FlowToolbar } from "@/features/automations/flow-builder/flow-toolbar";
import type { NodePositions } from "@/features/automations/flow-builder/hooks/use-automation-state";
import { useAutomationState } from "@/features/automations/flow-builder/hooks/use-automation-state";
import { MobileFlowEditor } from "@/features/automations/flow-builder/mobile-flow-editor";
import {
  type AddableStepType,
  FLOW_NODE_KINDS,
} from "@/features/automations/flow-builder/step-kinds";
import { StepPalette } from "@/features/automations/flow-builder/step-palette";
import { getTemplateBySlug } from "@/features/automations/flow-builder/templates/automation-templates";
import { TriggerWizard } from "@/features/automations/flow-builder/trigger-wizard/trigger-wizard";
import { stepsToFlow } from "@/features/automations/flow-builder/utils/auto-layout";
import type {
  AutomationStep,
  Note,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";
import { validateFlow } from "@/features/automations/flow-builder/utils/flow-validation";
import {
  createConditionStep,
  createId,
  createSendDmStep,
  defaultInsertSlot,
  type StepSlot,
} from "@/features/automations/flow-builder/utils/step-helpers";
import { useSubscription } from "@/features/billing/use-subscription";
import { AppLink as Link } from "@/shell/navigation/app-link";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";
import { useApiClient } from "@/shell/providers/api-client";
import {
  useMutationAtom,
  useResourceAtom,
  useResourceRegistry,
} from "@/shell/state/resources";
import { usePermissions } from "@/shell/use-permissions";

const BUTTON_HANDLE_RE = /^button_(\d+)$/;

interface FlowBuilderProps {
  automationId?: string;
  templateSlug?: string;
}

function FlowBuilderInner({
  automationId,
  templateSlug,
  scope,
}: FlowBuilderProps & { scope: AutomationScope }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { isFree: isFreePlan } = useSubscription();
  const analytics = useAnalytics();
  const registry = useResourceRegistry();
  const { resources } = useApiClient();
  const { canManageSocials } = usePermissions();
  const isNew = !automationId;
  const [isSaving, setIsSaving] = useState(false);
  const [staleEditor, setStaleEditor] = useState(false);
  const [showTriggerWizard, setShowTriggerWizard] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const initializedRef = useRef(false);
  const templateInitRef = useRef(false);
  const loadedAutomationRef = useRef<AutomationResourceView | null>(null);
  const submitRef = useRef(false);

  const detailResource = useMemo(
    () => resources.automations.get(scope, automationId ?? "new"),
    [automationId, resources, scope]
  );
  const automationQuery = useResourceAtom({
    ...detailResource,
    enabled: Boolean(automationId),
    queryKey: detailResource.queryKey!,
  });
  const automation = automationQuery.data
    ? automationFromResource(automationQuery.data)
    : undefined;
  const connectionsOptions = useMemo(
    () => resources.connections.list(scope.workspaceId, { limit: 100 }),
    [resources, scope.workspaceId]
  );
  const connectionsQuery = useResourceAtom({
    ...connectionsOptions,
    queryKey: connectionsOptions.queryKey!,
  });
  const socialProviders = useMemo(
    () =>
      connectionsQuery.data?.data.map((connection) => ({
        _id: connection.id,
        socialType: connection.platform,
        profileId: connection.profileId,
        username: connection.username ?? undefined,
        name: connection.displayName ?? connection.username ?? connection.id,
      })),
    [connectionsQuery.data]
  );
  const createOptions = useMemo(
    () => resources.automations.create(scope),
    [resources, scope]
  );
  const updateOptions = useMemo(
    () => resources.automations.update(scope, automationId ?? "new"),
    [automationId, resources, scope]
  );
  const createAutomation = useMutationAtom(createOptions);
  const updateAutomation = useMutationAtom({
    ...updateOptions,
    onMutate: async (payload) => {
      await registry.beginOptimisticUpdate({
        queryKey: detailResource.queryKey!,
      });
      const previous = registry.getResource(detailResource.queryKey!);
      registry.setResource(
        detailResource.queryKey!,
        (current: typeof automationQuery.data) =>
          current ? { ...current, ...payload } : current
      );
      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        registry.setResource(detailResource.queryKey!, context.previous);
      }
    },
  });

  const instagramProviders = useMemo(() => {
    if (!socialProviders) {
      return [];
    }
    return socialProviders.filter((p) => p.socialType === "INSTAGRAM");
  }, [socialProviders]);

  const state = useAutomationState();
  const {
    triggers,
    setTriggers,
    steps,
    setSteps,
    notes,
    setNotes,
    nodePositions,
    setNodePositions,
    selectedStepId,
    setSelectedStepId,
    isDirty,
    resetDirty,
    automationMeta,
    setAutomationMeta,
    markDirty,
    addTrigger,
    updateTrigger,
    removeTrigger,
    insertStepAt,
    updateStepById,
    removeStepById,
    addNote,
    updateNote,
    removeNote,
    updateNodePosition,
  } = state;

  // Template state for pre-selecting trigger type in wizard
  const [templateTriggerType, setTemplateTriggerType] = useState<
    "COMMENT" | "STORY_REPLY" | undefined
  >(undefined);

  // Initialize from template
  useEffect(() => {
    if (!templateSlug || templateInitRef.current || !socialProviders) {
      return;
    }

    const template = getTemplateBySlug(templateSlug);
    if (!template) {
      return;
    }

    templateInitRef.current = true;
    const {
      steps: tSteps,
      firstStepId,
      notes: tNotes,
      nodePositions: tPositions,
    } = template.buildSteps({
      instagramUsername:
        socialProviders?.find((p) => p.socialType === "INSTAGRAM")?.username ??
        undefined,
    });

    setSteps(tSteps);
    setNotes(tNotes);
    setNodePositions(tPositions);
    setTemplateTriggerType(
      template.triggerType === "COMMENT" ||
        template.triggerType === "STORY_REPLY"
        ? template.triggerType
        : undefined
    );

    // Store firstStepId so the trigger wizard can link to it
    templateFirstStepRef.current = firstStepId;

    // Open trigger wizard to complete setup
    setShowTriggerWizard(true);
  }, [templateSlug, socialProviders, setSteps, setNotes, setNodePositions]);

  const templateFirstStepRef = useRef<string | undefined>(undefined);

  // Initialize from existing automation
  useEffect(() => {
    if (!automation || initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    setAutomationMeta({
      name: automation.name,
      description: automation.description || "",
      isActive: automation.enabled,
      socialProviderId: automation.connectionId,
    });

    // Recombine pendingPostIds into targetPostIds with pending: prefix for UI
    const loadedTriggers = automation.triggers.map((trigger) => ({
      ...trigger,
      targetPostIds: [
        ...trigger.targetPostIds,
        ...(trigger.pendingPostIds ?? []).map((id: string) => `pending:${id}`),
      ],
      pendingPostIds: undefined,
    }));
    setTriggers(loadedTriggers);
    setSteps(automation.steps);
    setNotes(automation.notes);
    setNodePositions(automation.nodePositions as NodePositions);
    resetDirty(
      loadedTriggers,
      automation.steps,
      automation.notes,
      automation.nodePositions as NodePositions
    );
    loadedAutomationRef.current = automation;
  }, [
    automation,
    setAutomationMeta,
    setTriggers,
    setSteps,
    setNotes,
    setNodePositions,
    resetDirty,
    connectionsQuery.data,
    socialProviders,
  ]);

  // Open trigger wizard automatically for new automations (without template)
  useEffect(() => {
    if (
      isNew &&
      !templateSlug &&
      triggers.length === 0 &&
      socialProviders !== undefined
    ) {
      setShowTriggerWizard(true);
    }
  }, [isNew, templateSlug, triggers.length, socialProviders]);

  // Compute React Flow nodes/edges from step-based state
  const { nodes: stepNodes, edges } = useMemo(
    () => stepsToFlow(triggers, steps),
    [triggers, steps]
  );

  // Apply stored position overrides and add note nodes
  const nodes = useMemo(() => {
    // Override step/trigger node positions from stored positions
    const positionedNodes = stepNodes.map((node) => {
      const stored = nodePositions[node.id];
      if (stored) {
        return { ...node, position: stored };
      }
      return node;
    });

    // Add note nodes
    const noteNodes: Node[] = notes.map((note) => ({
      id: note.id,
      type: "note",
      position: nodePositions[note.id] ?? note.position,
      data: { note },
    }));

    return [...positionedNodes, ...noteNodes];
  }, [stepNodes, notes, nodePositions]);

  const handleTriggerWizardComplete = useCallback(
    (trigger: TriggerStep, socialProviderId: string) => {
      // Set social provider if this is the first trigger
      if (triggers.length === 0) {
        setAutomationMeta((prev) => ({ ...prev, socialProviderId }));
      }

      // If template provided a first step, link to it
      const templateFirstStep = templateFirstStepRef.current;
      if (templateFirstStep && steps.some((s) => s.id === templateFirstStep)) {
        addTrigger({ ...trigger, nextStepId: templateFirstStep });
        templateFirstStepRef.current = undefined;
        setTemplateTriggerType(undefined);
      } else if (steps.length > 0) {
        // Link to existing first step
        addTrigger({ ...trigger, nextStepId: steps[0].id });
      } else {
        // Auto-create a Send DM step, link it and open it so the user can
        // write the message straight away
        const dmStep = createSendDmStep();
        addTrigger({ ...trigger, nextStepId: dmStep.id });
        setSteps((prev) => [...prev, dmStep]);
        markDirty();
        setSelectedStepId(dmStep.id);
        setFocusRequest({ nodeId: dmStep.id, nonce: Date.now() });
      }
      setShowTriggerWizard(false);
    },
    [
      triggers.length,
      steps,
      addTrigger,
      setAutomationMeta,
      setSteps,
      markDirty,
      setSelectedStepId,
    ]
  );

  /** Add a step into the flow (or loose on the canvas without a slot). */
  const addStepAt = useCallback(
    (slot: StepSlot | undefined, type: AddableStepType) => {
      const newStep =
        type === "send_dm" ? createSendDmStep() : createConditionStep();
      if (slot) {
        insertStepAt(slot, newStep);
      } else {
        setSteps((prev) => [...prev, newStep]);
        markDirty();
      }
      setSelectedStepId(newStep.id);
      setFocusRequest({ nodeId: newStep.id, nonce: Date.now() });
    },
    [insertStepAt, setSteps, markDirty, setSelectedStepId]
  );

  const paletteSlot = useMemo(
    () => defaultInsertSlot(triggers, steps, selectedStepId),
    [triggers, steps, selectedStepId]
  );

  const paletteTargetLabel = useMemo(() => {
    if (!paletteSlot) {
      return undefined;
    }
    const parent =
      triggers.find((t) => t.id === paletteSlot.parentId) ??
      steps.find((s) => s.id === paletteSlot.parentId);
    if (!parent) {
      return undefined;
    }
    const label = FLOW_NODE_KINDS[parent.type].label;
    if (paletteSlot.branch === "next") {
      return label;
    }
    return `${label} (${paletteSlot.branch === "yes" ? "Yes" : "No"} path)`;
  }, [paletteSlot, triggers, steps]);

  const flowActions = useMemo(() => ({ addStep: addStepAt }), [addStepAt]);

  const handleAddNextStep = useCallback(
    (parentId: string, type: AddableStepType) =>
      addStepAt(defaultInsertSlot(triggers, steps, parentId), type),
    [addStepAt, triggers, steps]
  );

  const flowIssues = useMemo(
    () => validateFlow(triggers, steps).errors,
    [triggers, steps]
  );

  const handleAddNote = useCallback(() => {
    const note: Note = {
      id: `note_${createId()}`,
      content: "",
      position: { x: 400, y: 100 },
    };
    addNote(note);
    setSelectedStepId(note.id);
    setFocusRequest({ nodeId: note.id, nonce: Date.now() });
  }, [addNote, setSelectedStepId]);

  const handleNodeDragStop = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      updateNodePosition(nodeId, position);
    },
    [updateNodePosition]
  );

  // When the user drags an edge from a source handle to a target node
  const handleConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle } = connection;
      if (!(source && target)) {
        return;
      }

      // Source is a trigger
      const sourceTrigger = triggers.find((t) => t.id === source);
      if (sourceTrigger) {
        updateTrigger(source, { nextStepId: target });
        return;
      }

      // Source is a step
      const sourceStep = steps.find((s) => s.id === source);
      if (!sourceStep) {
        return;
      }

      if (sourceStep.type === "condition") {
        if (sourceHandle === "yes") {
          updateStepById(source, { yesStepId: target });
        } else if (sourceHandle === "no") {
          updateStepById(source, { noStepId: target });
        }
      } else if (sourceStep.type === "send_dm") {
        const buttonMatch = sourceHandle?.match(BUTTON_HANDLE_RE);
        if (buttonMatch) {
          const btnIndex = Number.parseInt(buttonMatch[1], 10);
          const buttons = [...(sourceStep.buttons ?? [])];
          const btn = buttons[btnIndex];
          if (btn?.type === "quick_reply") {
            buttons[btnIndex] = { ...btn, nextStepId: target };
            updateStepById(source, { buttons });
          }
        } else {
          updateStepById(source, { nextStepId: target });
        }
      }
    },
    [triggers, steps, updateTrigger, updateStepById]
  );

  // When the user deletes an edge (select + Backspace)
  const handleEdgeDelete = useCallback(
    (edge: Edge) => {
      const { source, sourceHandle } = edge;

      // Source is a trigger
      const sourceTrigger = triggers.find((t) => t.id === source);
      if (sourceTrigger) {
        updateTrigger(source, { nextStepId: undefined });
        return;
      }

      // Source is a step
      const sourceStep = steps.find((s) => s.id === source);
      if (!sourceStep) {
        return;
      }

      if (sourceStep.type === "condition") {
        if (sourceHandle === "yes") {
          updateStepById(source, { yesStepId: undefined });
        } else if (sourceHandle === "no") {
          updateStepById(source, { noStepId: undefined });
        }
      } else if (sourceStep.type === "send_dm") {
        const buttonMatch = sourceHandle?.match(BUTTON_HANDLE_RE);
        if (buttonMatch) {
          const btnIndex = Number.parseInt(buttonMatch[1], 10);
          const buttons = [...(sourceStep.buttons ?? [])];
          const btn = buttons[btnIndex];
          if (btn?.type === "quick_reply") {
            buttons[btnIndex] = { ...btn, nextStepId: undefined };
            updateStepById(source, { buttons });
          }
        } else {
          updateStepById(source, { nextStepId: undefined });
        }
      }
    },
    [triggers, steps, updateTrigger, updateStepById]
  );

  const handleToggleActive = useCallback(
    (active: boolean) => {
      if (active) {
        const result = validateFlow(triggers, steps);
        if (!result.valid) {
          toast.error(result.errors[0]);
          return;
        }
      }
      analytics.capture(AUTOMATION_TOGGLED, {
        automation_id: automationId,
        is_active: active,
      });
      setAutomationMeta((prev) => ({ ...prev, isActive: active }));
      markDirty();
    },
    [triggers, steps, setAutomationMeta, markDirty, analytics, automationId]
  );

  const handleMetaChange = useCallback(
    (meta: typeof automationMeta) => {
      setAutomationMeta(meta);
      markDirty();
    },
    [setAutomationMeta, markDirty]
  );

  const handleSave = useCallback(async () => {
    if (submitRef.current || isSaving) {
      return;
    }
    if (!canManageSocials) {
      toast.error("You do not have permission to change automations");
      return;
    }
    if (!automationMeta.socialProviderId) {
      toast.error("Please select an Instagram account");
      return;
    }

    const connection = connectionsQuery.data?.data.find(
      (candidate) => candidate.id === automationMeta.socialProviderId
    );
    if (!connection) {
      toast.error(
        "This Instagram account is not available in the current workspace"
      );
      return;
    }

    if (triggers.length === 0) {
      toast.error("Please add at least one trigger");
      return;
    }

    // A live automation with gaps would fail on real comments
    if (automationMeta.isActive && flowIssues.length > 0) {
      toast.error(flowIssues[0], {
        description: "Fix this before going live, or turn off Live to save it.",
      });
      return;
    }

    // Auto-generate name if empty
    let name = automationMeta.name.trim();
    if (!name) {
      const trigger = triggers[0];
      const typeLabel =
        trigger.triggerType === "STORY_REPLY"
          ? "Story Reply"
          : trigger.triggerType === "MENTION"
            ? "Mention"
            : "Comment";
      const keywordPart =
        trigger.keywordFilter?.value &&
        trigger.keywordFilter.operator !== "always"
          ? ` (${trigger.keywordFilter.value})`
          : "";
      name = `${typeLabel}${keywordPart} → DM`;
    }

    const processedTriggers = triggersToResource(triggers);

    submitRef.current = true;
    setIsSaving(true);
    try {
      if (isNew) {
        const created = await createAutomation.mutateAsync({
          connectionId: connection.id,
          name,
          description: automationMeta.description.trim() || null,
          enabled: automationMeta.isActive,
          triggers: processedTriggers,
          steps,
          notes,
          nodePositions,
        } as never);

        analytics.capture(AUTOMATION_CREATED, {
          automation_id: created.id,
          trigger_count: processedTriggers.length,
          step_count: steps.length,
          trigger_types: triggers.map((t) => t.triggerType),
          step_types: steps.map((s) => s.type),
          is_active: automationMeta.isActive,
          from_template: !!templateSlug,
          template_slug: templateSlug,
        });

        // The mutation already refreshes every cached automation read
        toast.success("Automation created");
        router.push(`/automations/${created.id}`);
      } else {
        const latest = await registry.fetchResource({
          ...detailResource,
          queryKey: detailResource.queryKey!,
          staleTime: 0,
        });
        const latestAutomation = automationFromResource(latest);
        if (
          loadedAutomationRef.current &&
          automationConfigurationChanged(
            loadedAutomationRef.current,
            latestAutomation
          )
        ) {
          setStaleEditor(true);
          return;
        }

        const updated = await updateAutomation.mutateAsync({
          name,
          description: automationMeta.description.trim() || null,
          enabled: automationMeta.isActive,
          triggers: processedTriggers,
          steps,
          notes,
          nodePositions,
        } as never);
        loadedAutomationRef.current = automationFromResource(updated);

        analytics.capture(AUTOMATION_UPDATED, {
          automation_id: automationId,
          trigger_count: processedTriggers.length,
          step_count: steps.length,
          trigger_types: triggers.map((t) => t.triggerType),
          step_types: steps.map((s) => s.type),
          is_active: automationMeta.isActive,
        });

        toast.success("Automation saved");
        resetDirty(triggers, steps, notes, nodePositions);
      }
    } catch (error) {
      console.error("Failed to save automation:", error);
      const details = getApiErrorDetails(error);
      toast.error(
        details.kind === "permission"
          ? "You do not have permission to save automations"
          : details.kind === "validation"
            ? details.message
            : details.kind === "conflict"
              ? `This automation could not be saved: ${details.message}`
              : `Automation could not be saved: ${details.message}`
      );
    } finally {
      submitRef.current = false;
      setIsSaving(false);
    }
  }, [
    automationMeta,
    canManageSocials,
    connectionsQuery.data,
    socialProviders,
    flowIssues,
    isSaving,
    isNew,
    automationId,
    triggers,
    steps,
    notes,
    nodePositions,
    createAutomation,
    updateAutomation,
    router,
    resetDirty,
    registry,
    detailResource,
  ]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedStepId(nodeId);
    },
    [setSelectedStepId]
  );

  const handleUpdateTrigger = useCallback(
    (id: string, updated: TriggerStep) => {
      updateTrigger(id, updated);
    },
    [updateTrigger]
  );

  const handleUpdateStep = useCallback(
    (id: string, patch: Partial<AutomationStep>) => {
      updateStepById(id, patch);
    },
    [updateStepById]
  );

  const handleDeleteStep = useCallback(
    (id: string) => {
      removeStepById(id);
    },
    [removeStepById]
  );

  const handleCreateStepForButton = useCallback(
    (
      stepId: string,
      buttonIndex: number,
      stepType: "send_dm" | "condition"
    ) => {
      const newStep =
        stepType === "send_dm" ? createSendDmStep() : createConditionStep();

      // Update the button's nextStepId to point to the new step
      setSteps((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== stepId || s.type !== "send_dm") {
            return s;
          }
          const buttons = [...(s.buttons ?? [])];
          const btn = buttons[buttonIndex];
          if (btn?.type === "quick_reply") {
            buttons[buttonIndex] = { ...btn, nextStepId: newStep.id };
          }
          return { ...s, buttons };
        });
        return [...updated, newStep];
      });
      markDirty();
      setSelectedStepId(newStep.id);
    },
    [setSteps, markDirty, setSelectedStepId]
  );

  const handleRemoveStepForButton = useCallback(
    (stepId: string, buttonIndex: number) => {
      setSteps((prev) => {
        const parentStep = prev.find((s) => s.id === stepId);
        if (parentStep?.type !== "send_dm") {
          return prev;
        }
        const btn = parentStep.buttons?.[buttonIndex];
        const targetStepId =
          btn?.type === "quick_reply" && "nextStepId" in btn
            ? btn.nextStepId
            : undefined;

        // Clear the button's nextStepId
        let updated = prev.map((s) => {
          if (s.id !== stepId || s.type !== "send_dm") {
            return s;
          }
          const buttons = [...(s.buttons ?? [])];
          const b = buttons[buttonIndex];
          if (b?.type === "quick_reply") {
            buttons[buttonIndex] = { ...b, nextStepId: undefined };
          }
          return { ...s, buttons };
        });

        // Remove the orphaned step if it exists and nothing else references it
        if (targetStepId) {
          updated = updated.filter((s) => s.id !== targetStepId);
        }

        return updated;
      });
      markDirty();
    },
    [setSteps, markDirty]
  );

  // Loading state for edit mode
  if (
    (!isNew && automationQuery.isPending) ||
    connectionsQuery.isPending ||
    socialProviders === undefined
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Icon
          className="animate-spin text-muted-foreground"
          icon={Loading03Icon}
          size={24}
        />
      </div>
    );
  }

  if ((!isNew && automationQuery.isError) || connectionsQuery.isError) {
    const error = automationQuery.error ?? connectionsQuery.error;
    const details = getApiErrorDetails(error);
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="font-medium">
          {details.kind === "not-found"
            ? "Automation not found"
            : details.kind === "permission"
              ? "You do not have permission to view this automation"
              : "The automation editor is unavailable"}
        </p>
        <p className="max-w-md text-muted-foreground text-sm">
          {details.message}
        </p>
        {details.kind === "transport" ? (
          <Button
            onClick={async () => {
              await Promise.all([
                automationQuery.refetch(),
                connectionsQuery.refetch(),
              ]);
            }}
            variant="outline"
          >
            Try again
          </Button>
        ) : null}
        <Link href="/automations">
          <Button variant="link">Back to Automations</Button>
        </Link>
      </div>
    );
  }

  if (staleEditor) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div>
          <h2 className="font-semibold text-lg">
            This automation changed elsewhere
          </h2>
          <p className="mt-1 max-w-md text-muted-foreground text-sm">
            Your draft was not submitted. Reload the latest version before
            making more changes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/automations">
            <Button variant="outline">Back to Automations</Button>
          </Link>
          <Button onClick={() => window.location.reload()}>
            Reload latest
          </Button>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileFlowEditor
        canSave={canManageSocials}
        instagramProviders={instagramProviders}
        isNew={isNew}
        isSaving={isSaving}
        onSave={handleSave}
        state={state}
        templateFirstStepId={templateFirstStepRef.current}
        templateTriggerType={templateTriggerType}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <FlowToolbar
        automationMeta={automationMeta}
        canSave={canManageSocials}
        isDirty={isDirty}
        isNew={isNew}
        isSaving={isSaving}
        issues={flowIssues}
        onMetaChange={handleMetaChange}
        onSave={handleSave}
        onToggleActive={handleToggleActive}
      />
      <div className="relative min-h-0 flex-1">
        <FlowActionsProvider value={canManageSocials ? flowActions : null}>
          <FlowCanvas
            edges={edges}
            focusRequest={focusRequest}
            nodes={nodes}
            onConnect={handleConnect}
            onEdgeDelete={handleEdgeDelete}
            onNodeClick={handleNodeClick}
            onNodeDragStop={handleNodeDragStop}
            onPaneClick={() => setSelectedStepId(null)}
          />
        </FlowActionsProvider>

        {canManageSocials ? (
          <div className="pointer-events-none absolute top-3 bottom-36 left-3 flex items-start">
            <StepPalette
              insertTargetLabel={paletteTargetLabel}
              onAddNote={handleAddNote}
              onAddStep={(type) => addStepAt(paletteSlot, type)}
              onAddTrigger={() => setShowTriggerWizard(true)}
            />
          </div>
        ) : null}

        <FlowSidebarPanel
          instagramProviders={instagramProviders}
          isFreePlan={isFreePlan}
          notes={notes}
          onAddNextStep={canManageSocials ? handleAddNextStep : undefined}
          onClose={() => setSelectedStepId(null)}
          onCreateStepForButton={handleCreateStepForButton}
          onDeleteNote={removeNote}
          onDeleteStep={handleDeleteStep}
          onDeleteTrigger={removeTrigger}
          onRemoveStepForButton={handleRemoveStepForButton}
          onSocialProviderChange={(id) => {
            setAutomationMeta((prev) => ({ ...prev, socialProviderId: id }));
            markDirty();
          }}
          onUpdateNote={updateNote}
          onUpdateStep={handleUpdateStep}
          onUpdateTrigger={handleUpdateTrigger}
          selectedId={selectedStepId}
          socialProviderId={automationMeta.socialProviderId}
          steps={steps}
          triggers={triggers}
        />
      </div>

      <TriggerWizard
        currentSocialProviderId={
          automationMeta.socialProviderId ||
          // Nothing to choose between, so skip the account step
          (instagramProviders.length === 1
            ? instagramProviders[0]._id
            : undefined)
        }
        defaultTriggerType={templateTriggerType}
        instagramProviders={instagramProviders}
        onClose={() => setShowTriggerWizard(false)}
        onComplete={handleTriggerWizardComplete}
        open={showTriggerWizard}
      />
    </div>
  );
}

export function FlowBuilder({ automationId, templateSlug }: FlowBuilderProps) {
  const isMobile = useIsMobile();
  const workspace = useAutomationWorkspace();

  if (workspace.isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Icon
          className="animate-spin text-muted-foreground"
          icon={Loading03Icon}
          size={24}
        />
      </div>
    );
  }

  if (workspace.isError || !workspace.scope) {
    const details = getApiErrorDetails(
      workspace.error ?? new Error("No workspace is available for this account")
    );
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-medium">The automation editor is unavailable</p>
        <p className="max-w-md text-muted-foreground text-sm">
          {details.message}
        </p>
        <Link href="/automations">
          <Button variant="link">Back to Automations</Button>
        </Link>
      </div>
    );
  }

  if (isMobile) {
    return (
      <FlowBuilderInner
        automationId={automationId}
        scope={workspace.scope}
        templateSlug={templateSlug}
      />
    );
  }

  return (
    <ReactFlowProvider>
      <FlowBuilderInner
        automationId={automationId}
        scope={workspace.scope}
        templateSlug={templateSlug}
      />
    </ReactFlowProvider>
  );
}
