"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Download, Upload } from "lucide-react";
import { useTabStore } from "@/stores/TabStore";
import { useToolboxStore } from "@/stores/ToolboxStore";
import { TOOL_DEFINITIONS } from "@/lib/toolbox/tools";
import { ToolboxCanvas } from "@/components/toolbox/toolbox-canvas";
import { GroupControllerDialog } from "@/components/dialogs/group-controller-dialog";
import { MonitorDialog } from "@/components/dialogs/monitor-dialog";
import { Button } from "@/components/ui/button";

export function ToolboxPage() {
  const setCurrentView = useTabStore((state) => state.setCurrentView);
  const loadToolbox = useToolboxStore((s) => s.loadToolbox);
  const loaded = useToolboxStore((s) => s.loaded);
  const nodes = useToolboxStore((s) => s.nodes);

  const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
  const selectedNodeId = useToolboxStore((s) => s.selectedNodeId);

  // When a node's settings button is clicked (sets selectedNodeId), open dialog
  useEffect(() => {
    if (selectedNodeId && !dialogNodeId) {
      setDialogNodeId(selectedNodeId);
      useToolboxStore.getState().setSelectedNodeId(null);
    }
  }, [selectedNodeId, dialogNodeId]);

  useEffect(() => {
    setCurrentView("toolbox");
  }, [setCurrentView]);

  useEffect(() => {
    if (!loaded) void loadToolbox();
  }, [loaded, loadToolbox]);

  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const { nodes, edges } = useToolboxStore.getState();
    const json = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "toolbox-view.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed?.nodes) {
          const store = useToolboxStore.getState();
          store.setNodes(parsed.nodes);
          if (parsed.edges) store.setEdges(parsed.edges);
          void store.saveToolbox();
        }
      } catch {
        // invalid JSON — ignore
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleToolDragStart = useCallback((event: DragEvent, toolType: string) => {
    event.dataTransfer.setData("application/toolbox-tool", toolType);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const handleNodeDrop = useCallback((nodeId: string) => {
    setDialogNodeId(nodeId);
  }, []);

  // Determine which dialog to show based on node type
  const dialogNode = nodes.find((n) => n.id === dialogNodeId);
  const dialogType = dialogNode?.type;

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <div className="flex min-h-0 flex-1">
        <div className="grid min-h-0 w-full flex-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
          {/* Toolbox sidebar + action buttons */}
          <aside className="flex max-h-48 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/25 xl:max-h-none">
            <div className="flex-1 overflow-y-auto p-2">
              <div className="mb-2 flex items-center justify-between border-b border-border/50 px-2 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] leading-tight text-muted-foreground">
                  Toolbox
                </p>
              </div>
              <div className="flex flex-col gap-1 px-1">
                {TOOL_DEFINITIONS.map((tool) => (
                  <div
                    key={tool.type}
                    className="flex cursor-grab items-center gap-2 rounded-md border border-border/40 bg-card/50 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent/50 active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => handleToolDragStart(e, tool.type)}
                  >
                    <tool.icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span>{tool.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Bottom action bar */}
            <div className="flex flex-col gap-1 border-t border-border/50 p-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={handleExport}>
                <Download className="size-3.5" /> Export View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-xs"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="size-3.5" /> Import View
              </Button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
          </aside>

          {/* Canvas area */}
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/20">
            <ReactFlowProvider>
              <ToolboxCanvas onNodeDrop={handleNodeDrop} />
            </ReactFlowProvider>
          </div>
        </div>
      </div>

      <GroupControllerDialog
        nodeId={dialogType === "groupController" ? dialogNodeId : null}
        open={dialogType === "groupController" && dialogNodeId !== null}
        onOpenChange={(open) => {
          if (!open) setDialogNodeId(null);
        }}
      />
      <MonitorDialog
        nodeId={dialogType === "monitor" ? dialogNodeId : null}
        open={dialogType === "monitor" && dialogNodeId !== null}
        onOpenChange={(open) => {
          if (!open) setDialogNodeId(null);
        }}
      />
    </div>
  );
}
