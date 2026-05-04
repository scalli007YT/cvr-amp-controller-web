import { create } from "zustand";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";

// ---------------------------------------------------------------------------
// Group Controller
// ---------------------------------------------------------------------------

export type GroupMode = "volume" | "mute" | "eq" | "delay";

export interface GroupAssignee {
  mac: string;
  channel: number;
}

export interface EqGroupAssignee extends GroupAssignee {
  target: "input" | "output";
  band: number;
}

export type EqGroupProperty = "gain" | "freq" | "q" | "bypass";

export interface GroupControllerNodeData {
  label: string;
  mode: GroupMode;
  assignees: (GroupAssignee | EqGroupAssignee)[];
  properties?: EqGroupProperty[];
  muteTarget?: "input" | "output";
  delayTarget?: "input" | "output";
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export type MonitorMetric = "vu" | "temperature" | "impedance" | "voltage" | "limiter" | "headroom";

export interface MonitorAssignee {
  mac: string;
  channel: number;
}

export interface MonitorNodeData {
  label: string;
  metric: MonitorMetric;
  vuTarget?: "input" | "output";
  headroomType?: "rms" | "peak";
  assignees: MonitorAssignee[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Node union
// ---------------------------------------------------------------------------

export type GroupControllerNode = Node<GroupControllerNodeData, "groupController">;
export type MonitorNode = Node<MonitorNodeData, "monitor">;
export type ToolboxNode = GroupControllerNode | MonitorNode;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ToolboxStore {
  nodes: ToolboxNode[];
  edges: Edge[];
  loaded: boolean;
  selectedNodeId: string | null;

  loadToolbox: () => Promise<void>;
  saveToolbox: () => Promise<void>;

  onNodesChange: (changes: NodeChange<ToolboxNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  addNode: (node: ToolboxNode) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<GroupControllerNodeData> | Partial<MonitorNodeData>) => void;
  setNodes: (nodes: ToolboxNode[]) => void;
  setEdges: (edges: Edge[]) => void;

  setSelectedNodeId: (id: string | null) => void;
}

export const useToolboxStore = create<ToolboxStore>()((set, get) => ({
  nodes: [],
  edges: [],
  loaded: false,
  selectedNodeId: null,

  loadToolbox: async () => {
    try {
      const res = await fetch("/api/toolbox");
      if (!res.ok) return;
      const json = (await res.json()) as { success: boolean; data?: { nodes: ToolboxNode[]; edges: Edge[] } };
      if (json.success && json.data) {
        const nodes = (json.data.nodes ?? []).map((n) => {
          if ((n.type as string) === "eqGroup") {
            return { ...n, type: "groupController" as const, data: { ...n.data, mode: "eq" } } as GroupControllerNode;
          }
          return n;
        });
        set({ nodes, edges: json.data.edges ?? [], loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  saveToolbox: async () => {
    const { nodes, edges } = get();
    try {
      await fetch("/api/toolbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges })
      });
    } catch {
      // silent
    }
  },

  onNodesChange: (changes) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) as ToolboxNode[] }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }));
  },

  addNode: (node) => {
    set((state) => ({ nodes: [...state.nodes, node] }));
    void get().saveToolbox();
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId
    }));
    void get().saveToolbox();
  },

  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)) as ToolboxNode[]
    }));
    void get().saveToolbox();
  },

  setNodes: (nodes) => {
    set({ nodes });
  },

  setEdges: (edges) => {
    set({ edges });
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id })
}));
