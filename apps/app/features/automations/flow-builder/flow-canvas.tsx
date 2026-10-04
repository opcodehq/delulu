"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, CenterFocusIcon, MinusSignIcon } from "@delulu/icons";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeChange,
  type FitViewOptions,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  Panel,
  ReactFlow,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConditionNode } from "@/features/automations/flow-builder/nodes/condition-node";
import { NoteNode } from "@/features/automations/flow-builder/nodes/note-node";
import { SendDmNode } from "@/features/automations/flow-builder/nodes/send-dm-node";
import { TriggerNode } from "@/features/automations/flow-builder/nodes/trigger-node";
import { NODE_WIDTH } from "@/features/automations/flow-builder/utils/auto-layout";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  send_dm: SendDmNode,
  note: NoteNode,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  style: { strokeWidth: 1.5, stroke: "var(--muted-foreground)" },
  labelBgPadding: [6, 2],
  labelBgBorderRadius: 999,
  labelStyle: {
    fontSize: 11,
    fontWeight: 500,
    fill: "var(--foreground)",
  },
  labelBgStyle: { fill: "var(--background)", stroke: "var(--border)" },
};

// The steps palette floats over the left of the canvas, the inspector over
// the right; keep the flow clear of the palette when fitting.
const PALETTE_CLEARANCE = 232;
const INSPECTOR_CLEARANCE = 352;
const FIT_VIEW_OPTIONS: FitViewOptions = {
  padding: {
    top: "48px",
    bottom: "48px",
    right: "48px",
    left: `${PALETTE_CLEARANCE}px`,
  },
  maxZoom: 1,
};

/** A request to scroll a node into view; the nonce repeats requests. */
export interface FocusRequest {
  nodeId: string;
  nonce: number;
}

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (nodeId: string) => void;
  onPaneClick?: () => void;
  onConnect: (connection: Connection) => void;
  onEdgeDelete: (edge: Edge) => void;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
  focusRequest?: FocusRequest | null;
}

export function FlowCanvas({
  nodes: propNodes,
  edges: propEdges,
  onNodeClick,
  onPaneClick,
  onConnect,
  onEdgeDelete,
  onNodeDragStop,
  focusRequest,
}: FlowCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>(propNodes);
  const [edges, setEdges] = useState<Edge[]>(propEdges);
  const edgesRef = useRef(propEdges);
  edgesRef.current = propEdges;
  const { zoomIn, zoomOut, fitView, setCenter, getZoom, getNode, getViewport } =
    useReactFlow();
  const canvasWidth = useStore((state) => state.width);

  // Sync from props when steps change
  useEffect(() => {
    setNodes(propNodes);
  }, [propNodes]);

  useEffect(() => {
    setEdges(propEdges);
  }, [propEdges]);

  /** Center a node in the strip between the palette and the inspector. */
  const centerNode = useCallback(
    (node: Node, zoom: number) => {
      const height = node.measured?.height ?? 120;
      const offset = (INSPECTOR_CLEARANCE - PALETTE_CLEARANCE) / 2 / zoom;
      setCenter(
        node.position.x + NODE_WIDTH / 2 + offset,
        node.position.y + height / 2,
        { zoom, duration: 300 }
      );
    },
    [setCenter]
  );

  // Reveal newly added steps; the node may only be measured a frame later
  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const node = getNode(focusRequest.nodeId);
      if (node) {
        centerNode(node, Math.max(getZoom(), 0.8));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, getNode, getZoom, centerNode]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove") {
          const edge = edgesRef.current.find((e) => e.id === change.id);
          if (edge) {
            onEdgeDelete(edge);
          }
        }
      }
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [onEdgeDelete]
  );

  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      onNodeDragStop?.(node.id, node.position);
    },
    [onNodeDragStop]
  );

  return (
    <ReactFlow
      defaultEdgeOptions={defaultEdgeOptions}
      edges={edges}
      elementsSelectable={true}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      maxZoom={1.5}
      minZoom={0.3}
      nodes={nodes}
      nodesConnectable={true}
      nodesDraggable={true}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        onNodeClick(node.id);
        // The inspector opens over the right; bring a covered node back out
        const { x, zoom } = getViewport();
        const right = node.position.x * zoom + x + NODE_WIDTH * zoom;
        if (right > canvasWidth - INSPECTOR_CLEARANCE) {
          centerNode(node, zoom);
        }
      }}
      onNodeDragStop={handleNodeDragStop}
      onNodesChange={onNodesChange}
      onPaneClick={onPaneClick}
      proOptions={{ hideAttribution: true }}
    >
      <Panel
        className="flex flex-col gap-0.5 rounded-lg border bg-background p-0.5 shadow-xs"
        position="bottom-left"
      >
        <Button
          aria-label="Zoom in"
          onClick={() => zoomIn({ duration: 200 })}
          size="icon-sm"
          variant="ghost"
        >
          <Icon icon={Add01Icon} size={16} />
        </Button>
        <Button
          aria-label="Zoom out"
          onClick={() => zoomOut({ duration: 200 })}
          size="icon-sm"
          variant="ghost"
        >
          <Icon icon={MinusSignIcon} size={16} />
        </Button>
        <Button
          aria-label="Fit flow to screen"
          onClick={() => fitView({ ...FIT_VIEW_OPTIONS, duration: 300 })}
          size="icon-sm"
          variant="ghost"
        >
          <Icon icon={CenterFocusIcon} size={16} />
        </Button>
      </Panel>
    </ReactFlow>
  );
}
