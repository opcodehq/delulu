"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AutomationMeta,
  AutomationStep,
  Note,
  TriggerStep,
} from "../utils/flow-types";
import {
  insertStepAfter,
  removeStep,
  removeStepFromTriggers,
  updateStep,
} from "../utils/step-helpers";

export type NodePositions = Record<string, { x: number; y: number }>;

export type UseAutomationStateReturn = ReturnType<typeof useAutomationState>;

export function useAutomationState() {
  const [triggers, setTriggers] = useState<TriggerStep[]>([]);
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [nodePositions, setNodePositions] = useState<NodePositions>({});
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [automationMeta, setAutomationMeta] = useState<AutomationMeta>({
    name: "",
    description: "",
    isActive: true,
    socialProviderId: "",
  });

  const initialStateRef = useRef<string>("");

  const markDirty = useCallback(() => setIsDirty(true), []);

  const resetDirty = useCallback(
    (
      currentTriggers: TriggerStep[],
      currentSteps: AutomationStep[],
      currentNotes?: Note[],
      currentNodePositions?: NodePositions
    ) => {
      initialStateRef.current = JSON.stringify({
        triggers: currentTriggers,
        steps: currentSteps,
        notes: currentNotes ?? [],
        nodePositions: currentNodePositions ?? {},
      });
      setIsDirty(false);
    },
    []
  );

  // Trigger operations
  const addTrigger = useCallback(
    (trigger: TriggerStep) => {
      setTriggers((prev) => [...prev, trigger]);
      markDirty();
    },
    [markDirty]
  );

  const updateTrigger = useCallback(
    (id: string, patch: Partial<TriggerStep>) => {
      setTriggers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
      markDirty();
    },
    [markDirty]
  );

  const removeTrigger = useCallback(
    (id: string) => {
      setTriggers((prev) => prev.filter((t) => t.id !== id));
      markDirty();
    },
    [markDirty]
  );

  // Step operations
  const addStepAfterSync = useCallback(
    (
      parentId: string,
      branch: "next" | "yes" | "no",
      newStep: AutomationStep
    ) => {
      const result = insertStepAfter(
        triggers,
        steps,
        parentId,
        branch,
        newStep
      );
      setTriggers(result.triggers);
      setSteps(result.steps);
      markDirty();
    },
    [triggers, steps, markDirty]
  );

  const updateStepById = useCallback(
    (id: string, patch: Partial<AutomationStep>) => {
      setSteps((prev) => updateStep(prev, id, patch));
      markDirty();
    },
    [markDirty]
  );

  const removeStepById = useCallback(
    (id: string) => {
      setSteps((prev) => removeStep(prev, id));
      setTriggers((prev) => removeStepFromTriggers(prev, id));
      if (selectedStepId === id) {
        setSelectedStepId(null);
      }
      markDirty();
    },
    [selectedStepId, markDirty]
  );

  // Note operations
  const addNote = useCallback(
    (note: Note) => {
      setNotes((prev) => [...prev, note]);
      markDirty();
    },
    [markDirty]
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...patch } : n))
      );
      markDirty();
    },
    [markDirty]
  );

  const removeNote = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedStepId === id) {
        setSelectedStepId(null);
      }
      markDirty();
    },
    [selectedStepId, markDirty]
  );

  // Node position operations
  const updateNodePosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setNodePositions((prev) => ({ ...prev, [id]: position }));
      markDirty();
    },
    [markDirty]
  );

  return {
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
    setIsDirty,
    resetDirty,
    automationMeta,
    setAutomationMeta,
    markDirty,
    addTrigger,
    updateTrigger,
    removeTrigger,
    addStepAfterSync,
    updateStepById,
    removeStepById,
    addNote,
    updateNote,
    removeNote,
    updateNodePosition,
  };
}
