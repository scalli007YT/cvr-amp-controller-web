"use client";

import { useCallback, useRef, type DragEvent } from "react";
import { ReactFlow, Background, Controls, BackgroundVariant, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useToolboxStore, type ToolboxNode } from "@/stores/ToolboxStore";
import { getToolDefinition } from "@/lib/toolbox/tools";
import { GroupControllerNodeComponent } from "@/components/toolbox/nodes/group-controller-node";
import { MonitorNodeComponent } from "@/components/toolbox/nodes/monitor-node";

const GRID = 16;
const OFFSET = 8;
function snapToGrid(v: number): number {
  return Math.round((v - OFFSET) / GRID) * GRID + OFFSET;
}

const nodeTypes = { groupController: GroupControllerNodeComponent, monitor: MonitorNodeComponent };

let idCounter = 0;
function generateNodeId(): string {
  return `node_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
}

interface ToolboxCanvasProps {
  onNodeDrop: (nodeId: string) => void;
}

export function ToolboxCanvas({ onNodeDrop }: ToolboxCanvasProps) {
  const nodes = useToolboxStore((s) => s.nodes);
  const edges = useToolboxStore((s) => s.edges);
  const onNodesChange = useToolboxStore((s) => s.onNodesChange);
  const onEdgesChange = useToolboxStore((s) => s.onEdgesChange);
  const addNode = useToolboxStore((s) => s.addNode);
  const saveToolbox = useToolboxStore((s) => s.saveToolbox);
  const setSelectedNodeId = useToolboxStore((s) => s.setSelectedNodeId);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const toolType = event.dataTransfer.getData("application/toolbox-tool");
      if (!toolType) return;

      const definition = getToolDefinition(toolType);
      if (!definition) return;

      const raw = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      const position = {
        x: snapToGrid(raw.x),
        y: snapToGrid(raw.y)
      };

      const newNode = {
        id: generateNodeId(),
        type: definition.type as ToolboxNode["type"],
        position,
        data: definition.defaultData()
      } as ToolboxNode;

      addNode(newNode);
      onNodeDrop(newNode.id);
    },
    [screenToFlowPosition, addNode, onNodeDrop]
  );

  const onNodeDrag = useCallback((_: unknown, node: ToolboxNode) => {
    useToolboxStore.setState((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, position: { x: snapToGrid(node.position.x), y: snapToGrid(node.position.y) } } : n
      )
    }));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: ToolboxNode) => {
      useToolboxStore.setState((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === node.id ? { ...n, position: { x: snapToGrid(n.position.x), y: snapToGrid(n.position.y) } } : n
        )
      }));
      void saveToolbox();
    },
    [saveToolbox]
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => setSelectedNodeId(null)}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        fitView
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-30" />
        <Controls className="!rounded-lg !border !border-border/50 !bg-card !shadow-md [&>button]:!bg-card [&>button]:!fill-foreground [&>button]:!border-border/50 [&>button:hover]:!bg-accent [&>button>svg]:!fill-foreground" />
      </ReactFlow>
    </div>
  );
}
