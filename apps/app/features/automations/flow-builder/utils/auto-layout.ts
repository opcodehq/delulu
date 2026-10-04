import type { Edge, Node } from "@xyflow/react";
import type {
  AutomationStep,
  SendDmStep,
  TriggerStep,
} from "@/features/automations/flow-builder/utils/flow-types";

/** Every step card renders at this width so parent and child handles line up. */
export const NODE_WIDTH = 232;
const NODE_HEIGHT = 92;
const HORIZONTAL_GAP = 40;
// Leaves room under open branches for their "+" slot
const VERTICAL_GAP = 80;
const TRIGGER_SECTION_Y = 0;
const STEPS_START_Y = NODE_HEIGHT + VERTICAL_GAP;

interface LayoutNode {
  id: string;
  width: number;
  height: number;
  children: LayoutNode[];
  branch?: "yes" | "no" | string; // "yes"/"no" for conditions, "button_N" for button branches
}

/**
 * Get branching button children from a send_dm step.
 */
function getButtonBranches(
  step: SendDmStep
): { index: number; nextStepId: string }[] {
  if (!step.buttons) {
    return [];
  }
  const branches: { index: number; nextStepId: string }[] = [];
  for (let i = 0; i < step.buttons.length; i++) {
    const btn = step.buttons[i];
    if (btn.type === "quick_reply" && "nextStepId" in btn && btn.nextStepId) {
      branches.push({ index: i, nextStepId: btn.nextStepId });
    }
  }
  return branches;
}

/**
 * Convert step-based data into React Flow nodes and edges for rendering.
 * Positions are computed — never stored.
 */
export function stepsToFlow(
  triggers: TriggerStep[],
  steps: AutomationStep[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const positionedIds = new Set<string>();

  // --- Trigger nodes (horizontal row at top) ---
  const triggerGroupWidth =
    triggers.length * NODE_WIDTH + (triggers.length - 1) * HORIZONTAL_GAP;
  const triggerStartX = -triggerGroupWidth / 2 + NODE_WIDTH / 2;

  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    nodes.push({
      id: trigger.id,
      type: "trigger",
      position: {
        x: triggerStartX + i * (NODE_WIDTH + HORIZONTAL_GAP),
        y: TRIGGER_SECTION_Y,
      },
      data: { step: trigger },
    });
  }

  // --- Build step tree from first trigger's nextStepId ---
  // All triggers share the same step chain (OR logic — any trigger fires it)
  const rootStepId = triggers[0]?.nextStepId;

  if (rootStepId) {
    // Connect all triggers to the root step
    for (const trigger of triggers) {
      if (trigger.nextStepId) {
        edges.push({
          id: `edge-${trigger.id}-${trigger.nextStepId}`,
          source: trigger.id,
          target: trigger.nextStepId,
          type: "smoothstep",
        });
      }
    }

    // Recursively layout the step tree
    const { layoutNodes, layoutEdges } = layoutStepTree(rootStepId, stepMap);

    // Children are spread around their parent, so the root sits directly
    // under the (centered) trigger row
    positionLayoutNodes(layoutNodes, stepMap, rootStepId, 0, STEPS_START_Y);

    for (const n of layoutNodes) {
      positionedIds.add(n.id);
    }
    nodes.push(...layoutNodes);
    edges.push(...layoutEdges);
  }

  // --- Orphan nodes (not connected to any trigger chain) ---
  const orphanSteps = steps.filter((s) => !positionedIds.has(s.id));
  if (orphanSteps.length > 0) {
    const orphanStartX = 400;

    for (let i = 0; i < orphanSteps.length; i++) {
      const step = orphanSteps[i];
      nodes.push({
        id: step.id,
        type: step.type,
        position: {
          x: orphanStartX,
          y: STEPS_START_Y + i * (NODE_HEIGHT + VERTICAL_GAP),
        },
        data: { step },
      });
      positionedIds.add(step.id);
    }

    // Draw edges between orphan nodes (and from orphans to main tree nodes)
    for (const step of orphanSteps) {
      if (step.type === "send_dm") {
        if (step.nextStepId && positionedIds.has(step.nextStepId)) {
          edges.push({
            id: `edge-${step.id}-${step.nextStepId}`,
            source: step.id,
            target: step.nextStepId,
            type: "smoothstep",
          });
        }
        const btnBranches = getButtonBranches(step);
        for (const branch of btnBranches) {
          if (positionedIds.has(branch.nextStepId)) {
            const btn = step.buttons![branch.index];
            edges.push({
              id: `edge-${step.id}-btn${branch.index}-${branch.nextStepId}`,
              source: step.id,
              target: branch.nextStepId,
              sourceHandle: `button_${branch.index}`,
              type: "smoothstep",
              label: btn.title || `Button ${branch.index + 1}`,
            });
          }
        }
      } else if (step.type === "condition") {
        if (step.yesStepId && positionedIds.has(step.yesStepId)) {
          edges.push({
            id: `edge-${step.id}-yes-${step.yesStepId}`,
            source: step.id,
            target: step.yesStepId,
            sourceHandle: "yes",
            type: "smoothstep",
            label: "Yes",
          });
        }
        if (step.noStepId && positionedIds.has(step.noStepId)) {
          edges.push({
            id: `edge-${step.id}-no-${step.noStepId}`,
            source: step.id,
            target: step.noStepId,
            sourceHandle: "no",
            type: "smoothstep",
            label: "No",
          });
        }
      }
    }
  }

  return { nodes, edges };
}

/** Placeholder subtree with no node of its own. */
function emptyBranch(): LayoutNode {
  return { id: "", width: NODE_WIDTH, height: 0, children: [] };
}

function buildLayoutTree(
  stepId: string,
  stepMap: Map<string, AutomationStep>,
  visited = new Set<string>()
): LayoutNode | null {
  if (visited.has(stepId)) {
    return null;
  }
  visited.add(stepId);

  const step = stepMap.get(stepId);
  if (!step) {
    return null;
  }

  const node: LayoutNode = {
    id: step.id,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    children: [],
  };

  if (step.type === "condition") {
    const yesChild = step.yesStepId
      ? buildLayoutTree(step.yesStepId, stepMap, visited)
      : null;
    const noChild = step.noStepId
      ? buildLayoutTree(step.noStepId, stepMap, visited)
      : null;
    // Keep each branch on its own side: an empty branch still reserves a
    // column for its "+" slot instead of the other branch sliding under it
    if (yesChild || noChild) {
      node.children.push(
        { ...(yesChild ?? emptyBranch()), branch: "yes" },
        { ...(noChild ?? emptyBranch()), branch: "no" }
      );
    }
  } else if (step.type === "send_dm") {
    // Linear chain via nextStepId
    if (step.nextStepId) {
      const nextChild = buildLayoutTree(step.nextStepId, stepMap, visited);
      if (nextChild) {
        node.children.push(nextChild);
      }
    }
    // Button branches
    const buttonBranches = getButtonBranches(step);
    for (const branch of buttonBranches) {
      const btnChild = buildLayoutTree(branch.nextStepId, stepMap, visited);
      if (btnChild) {
        btnChild.branch = `button_${branch.index}`;
        node.children.push(btnChild);
      }
    }
  }

  return node;
}

function getSubtreeWidth(node: LayoutNode | null): number {
  if (!node) {
    return 0;
  }
  if (node.children.length === 0) {
    return NODE_WIDTH;
  }

  const childrenWidth = node.children.reduce(
    (sum, child) => sum + getSubtreeWidth(child),
    0
  );
  const gaps = Math.max(0, node.children.length - 1) * HORIZONTAL_GAP;

  return Math.max(NODE_WIDTH, childrenWidth + gaps);
}

function layoutStepTree(
  rootId: string,
  stepMap: Map<string, AutomationStep>
): { layoutNodes: Node[]; layoutEdges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function walk(stepId: string, visited: Set<string>) {
    if (visited.has(stepId)) {
      return;
    }
    visited.add(stepId);

    const step = stepMap.get(stepId);
    if (!step) {
      return;
    }

    const nodeType = step.type === "condition" ? "condition" : "send_dm";
    nodes.push({
      id: step.id,
      type: nodeType,
      position: { x: 0, y: 0 }, // will be positioned later
      data: { step },
    });

    if (step.type === "condition") {
      if (step.yesStepId) {
        edges.push({
          id: `edge-${step.id}-yes-${step.yesStepId}`,
          source: step.id,
          target: step.yesStepId,
          sourceHandle: "yes",
          type: "smoothstep",
          label: "Yes",
        });
        walk(step.yesStepId, visited);
      }
      if (step.noStepId) {
        edges.push({
          id: `edge-${step.id}-no-${step.noStepId}`,
          source: step.id,
          target: step.noStepId,
          sourceHandle: "no",
          type: "smoothstep",
          label: "No",
        });
        walk(step.noStepId, visited);
      }
    } else if (step.type === "send_dm") {
      // Linear chain
      if (step.nextStepId) {
        edges.push({
          id: `edge-${step.id}-${step.nextStepId}`,
          source: step.id,
          target: step.nextStepId,
          type: "smoothstep",
        });
        walk(step.nextStepId, visited);
      }
      // Button branches
      const buttonBranches = getButtonBranches(step);
      for (const branch of buttonBranches) {
        const btn = step.buttons![branch.index];
        const label = btn.title || `Button ${branch.index + 1}`;
        edges.push({
          id: `edge-${step.id}-btn${branch.index}-${branch.nextStepId}`,
          source: step.id,
          target: branch.nextStepId,
          sourceHandle: `button_${branch.index}`,
          type: "smoothstep",
          label,
        });
        walk(branch.nextStepId, visited);
      }
    }
  }

  walk(rootId, new Set());
  return { layoutNodes: nodes, layoutEdges: edges };
}

/**
 * Position nodes using the layout tree structure. Each node is centered over
 * its subtree, and sibling subtrees get as much width as they need so nested
 * branches never overlap.
 */
function positionLayoutNodes(
  nodes: Node[],
  stepMap: Map<string, AutomationStep>,
  rootId: string,
  rootX: number,
  startY: number
) {
  const tree = buildLayoutTree(rootId, stepMap);
  if (!tree) {
    return;
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  function place(node: LayoutNode, centerX: number, y: number) {
    const target = nodeMap.get(node.id);
    if (target) {
      target.position = { x: centerX - NODE_WIDTH / 2, y };
    }
    const widths = node.children.map(getSubtreeWidth);
    const total =
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, node.children.length - 1) * HORIZONTAL_GAP;
    let cursor = centerX - total / 2;
    node.children.forEach((child, i) => {
      place(child, cursor + widths[i] / 2, y + NODE_HEIGHT + VERTICAL_GAP);
      cursor += widths[i] + HORIZONTAL_GAP;
    });
  }

  place(tree, rootX + NODE_WIDTH / 2, startY);
}
