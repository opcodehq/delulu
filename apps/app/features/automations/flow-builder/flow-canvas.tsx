"use client";

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConditionNode } from "./nodes/condition-node";
import { NoteNode } from "./nodes/note-node";
import { SendDmNode } from "./nodes/send-dm-node";
import { TriggerNode } from "./nodes/trigger-node";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  send_dm: SendDmNode,
  note: NoteNode,
};

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: (nodeId: string) => void;
  onConnect: (connection: Connection) => void;
  onEdgeDelete: (edge: Edge) => void;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
}

export function FlowCanvas({
  nodes: propNodes,
  edges: propEdges,
  onNodeClick,
  onConnect,
  onEdgeDelete,
  onNodeDragStop,
}: FlowCanvasProps) {
  const [nodes, setNodes] = useState<Node[]>(propNodes);
  const [edges, setEdges] = useState<Edge[]>(propEdges);
  const edgesRef = useRef(propEdges);
  edgesRef.current = propEdges;

  // Sync from props when steps change
  useEffect(() => {
    setNodes(propNodes);
  }, [propNodes]);

  useEffect(() => {
    setEdges(propEdges);
  }, [propEdges]);

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
      edges={edges}
      elementsSelectable={true}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      maxZoom={1.5}
      minZoom={0.3}
      nodes={nodes}
      nodesConnectable={true}
      nodesDraggable={true}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      onNodeDragStop={handleNodeDragStop}
      onNodesChange={onNodesChange}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
      <Controls showInteractive={false} />
      <MiniMap className="!bg-background !border-border" nodeStrokeWidth={3} />
    </ReactFlow>
  );
}
