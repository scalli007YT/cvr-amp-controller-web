"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToolboxStore, type MonitorAssignee, type MonitorMetric, type MonitorNodeData } from "@/stores/ToolboxStore";
import { useAmpStore } from "@/stores/AmpStore";
import { ChannelPickerDialog } from "@/components/dialogs/channel-picker-dialog";

interface MonitorDialogProps {
  nodeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MonitorDialog({ nodeId, open, onOpenChange }: MonitorDialogProps) {
  const nodes = useToolboxStore((s) => s.nodes);
  const updateNodeData = useToolboxStore((s) => s.updateNodeData);
  const removeNode = useToolboxStore((s) => s.removeNode);
  const { amps, getDisplayName } = useAmpStore();

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data as MonitorNodeData | undefined;

  const [label, setLabel] = useState("Monitor");
  const [metric, setMetric] = useState<MonitorMetric>("vu");
  const [vuTarget, setVuTarget] = useState<"input" | "output">("output");
  const [headroomType, setHeadroomType] = useState<"rms" | "peak">("rms");
  const [assignees, setAssignees] = useState<MonitorAssignee[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (nodeData) {
      setLabel(nodeData.label);
      setMetric(nodeData.metric);
      setVuTarget(nodeData.vuTarget ?? "output");
      setHeadroomType(nodeData.headroomType ?? "rms");
      setAssignees(nodeData.assignees ?? []);
    }
  }, [nodeData]);

  const handlePickerSelect = useCallback((assignee: MonitorAssignee) => {
    setAssignees((prev) => [...prev, assignee]);
  }, []);

  const removeAssignee = useCallback((index: number) => {
    setAssignees((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = () => {
    if (!nodeId) return;
    updateNodeData(nodeId, { label, metric, vuTarget, headroomType, assignees });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!nodeId) return;
    removeNode(nodeId);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Monitor</DialogTitle>
            <DialogDescription>Configure which channels to monitor.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Monitor" />
            </div>

            <div className="space-y-1.5">
              <Label>Metric</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={metric}
                onValueChange={(v) => {
                  if (v) setMetric(v as MonitorMetric);
                }}
                className="justify-start flex-wrap"
              >
                <ToggleGroupItem value="vu" className="px-3">
                  VU (dB)
                </ToggleGroupItem>
                <ToggleGroupItem value="temperature" className="px-3">
                  Temp
                </ToggleGroupItem>
                <ToggleGroupItem value="impedance" className="px-3">
                  Impedance
                </ToggleGroupItem>
                <ToggleGroupItem value="voltage" className="px-3">
                  Voltage
                </ToggleGroupItem>
                <ToggleGroupItem value="limiter" className="px-3">
                  Limiter
                </ToggleGroupItem>
                <ToggleGroupItem value="headroom" className="px-3">
                  Headroom
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {metric === "headroom" && (
              <div className="space-y-1.5">
                <Label>Limiter Type</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={headroomType}
                  onValueChange={(v) => {
                    if (v) setHeadroomType(v as "rms" | "peak");
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="rms" className="px-3">
                    RMS Limiter
                  </ToggleGroupItem>
                  <ToggleGroupItem value="peak" className="px-3">
                    Peak Limiter
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {metric === "vu" && (
              <div className="space-y-1.5">
                <Label>Signal Path</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={vuTarget}
                  onValueChange={(v) => {
                    if (v) setVuTarget(v as "input" | "output");
                  }}
                  className="justify-start"
                >
                  <ToggleGroupItem value="output" className="px-3">
                    Output (dBu)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="input" className="px-3">
                    Input (dBFS)
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Channels</Label>
                <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                  <Plus className="mr-1 size-3.5" /> Add
                </Button>
              </div>

              {assignees.length === 0 && (
                <p className="text-xs text-muted-foreground">No channels yet. Click Add to select.</p>
              )}

              <div className="max-h-48 space-y-1 overflow-y-auto">
                {assignees.map((assignee, index) => {
                  const amp = amps.find((a) => a.mac === assignee.mac);
                  const ampName = amp ? getDisplayName(amp) : assignee.mac.slice(-8);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-card/30 px-3 py-1.5"
                    >
                      <span className="text-xs">
                        <span className="font-medium">{ampName}</span>
                        <span className="text-muted-foreground"> &middot; Ch {assignee.channel + 1}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => removeAssignee(index)}
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {node && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete Node
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChannelPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handlePickerSelect}
        existing={assignees}
      />
    </>
  );
}
