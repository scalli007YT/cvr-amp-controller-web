import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal, Activity } from "lucide-react";
import type { GroupControllerNodeData, MonitorNodeData } from "@/stores/ToolboxStore";

export interface ToolDefinition {
  type: string;
  displayName: string;
  icon: LucideIcon;
  defaultData: () => GroupControllerNodeData | MonitorNodeData;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "groupController",
    displayName: "Group Controller",
    icon: SlidersHorizontal,
    defaultData: (): GroupControllerNodeData => ({
      label: "Group",
      mode: "volume",
      assignees: []
    })
  },
  {
    type: "monitor",
    displayName: "Monitor",
    icon: Activity,
    defaultData: (): MonitorNodeData => ({
      label: "Monitor",
      metric: "vu",
      assignees: []
    })
  }
];

export function getToolDefinition(type: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.type === type);
}
