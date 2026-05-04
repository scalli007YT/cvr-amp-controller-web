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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useToolboxStore,
  type GroupAssignee,
  type EqGroupAssignee,
  type EqGroupProperty,
  type GroupMode,
  type GroupControllerNodeData
} from "@/stores/ToolboxStore";
import { useAmpStore } from "@/stores/AmpStore";
import { EQ_BAND_LABELS } from "@/lib/eq";
import { EqBandPickerDialog } from "@/components/dialogs/eq-band-picker-dialog";
import { ChannelPickerDialog } from "@/components/dialogs/channel-picker-dialog";

interface GroupControllerDialogProps {
  nodeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GroupControllerDialog({ nodeId, open, onOpenChange }: GroupControllerDialogProps) {
  const nodes = useToolboxStore((s) => s.nodes);
  const updateNodeData = useToolboxStore((s) => s.updateNodeData);
  const removeNode = useToolboxStore((s) => s.removeNode);
  const { amps, getDisplayName } = useAmpStore();

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data as GroupControllerNodeData | undefined;

  const [label, setLabel] = useState("Group");
  const [mode, setMode] = useState<GroupMode>("volume");
  const [assignees, setAssignees] = useState<(GroupAssignee | EqGroupAssignee)[]>([]);
  const [properties, setProperties] = useState<EqGroupProperty[]>(["gain", "bypass"]);
  const [muteTarget, setMuteTarget] = useState<"input" | "output">("output");
  const [delayTarget, setDelayTarget] = useState<"input" | "output">("output");

  const [eqPickerOpen, setEqPickerOpen] = useState(false);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);

  useEffect(() => {
    if (nodeData) {
      setLabel(nodeData.label);
      setMode(nodeData.mode);
      setAssignees(nodeData.assignees ?? []);
      setProperties(nodeData.properties ?? ["gain", "bypass"]);
      setMuteTarget(nodeData.muteTarget ?? "output");
      setDelayTarget(nodeData.delayTarget ?? "output");
    }
  }, [nodeData]);

  const handleEqPickerSelect = useCallback((assignee: EqGroupAssignee) => {
    setAssignees((prev) => [...prev, assignee]);
  }, []);

  const handleChannelPickerSelect = useCallback((assignee: GroupAssignee) => {
    setAssignees((prev) => [...prev, assignee]);
  }, []);

  const removeAssignee = useCallback((index: number) => {
    setAssignees((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const eqAssignees = assignees.filter((a): a is EqGroupAssignee => "band" in a);

  const handleSave = () => {
    if (!nodeId) return;
    updateNodeData(nodeId, { label, mode, assignees, properties, muteTarget, delayTarget });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!nodeId) return;
    removeNode(nodeId);
    onOpenChange(false);
  };

  const handleModeChange = (newMode: string) => {
    if (!newMode) return;
    setMode(newMode as GroupMode);
    setAssignees([]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Group Controller</DialogTitle>
            <DialogDescription>Configure this group controller node.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Group" />
            </div>

            <div className="space-y-1.5">
              <Label>Mode</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={mode}
                onValueChange={handleModeChange}
                className="justify-start flex-wrap"
              >
                <ToggleGroupItem value="volume" className="px-3">
                  Volume
                </ToggleGroupItem>
                <ToggleGroupItem value="mute" className="px-3">
                  Mute
                </ToggleGroupItem>
                <ToggleGroupItem value="eq" className="px-3">
                  EQ
                </ToggleGroupItem>
                <ToggleGroupItem value="delay" className="px-3">
                  Delay
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {mode === "eq" && (
              <div className="space-y-1.5">
                <Label>EQ Controls</Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  value={properties}
                  onValueChange={(v) => {
                    if (v.length > 0) setProperties(v as EqGroupProperty[]);
                  }}
                  className="justify-start flex-wrap"
                >
                  <ToggleGroupItem value="gain" className="px-3">
                    Level (dB)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="freq" className="px-3">
                    Freq (Hz)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="q" className="px-3">
                    Q
                  </ToggleGroupItem>
                  <ToggleGroupItem value="bypass" className="px-3">
                    Bypass
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {mode === "mute" && (
              <div className="space-y-1.5">
                <Label>Target</Label>
                <Select value={muteTarget} onValueChange={(v) => setMuteTarget(v as "input" | "output")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="output">Output Mute</SelectItem>
                    <SelectItem value="input">Input Mute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "delay" && (
              <div className="space-y-1.5">
                <Label>Target</Label>
                <Select value={delayTarget} onValueChange={(v) => setDelayTarget(v as "input" | "output")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="output">Output Delay (max 20ms)</SelectItem>
                    <SelectItem value="input">Input Delay (max 100ms)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Assignees</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (mode === "eq" ? setEqPickerOpen(true) : setChannelPickerOpen(true))}
                >
                  <Plus className="mr-1 size-3.5" /> Add
                </Button>
              </div>

              {assignees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {mode === "eq"
                    ? "No assignees yet. Click Add to browse EQ bands."
                    : "No assignees yet. Click Add to select channels."}
                </p>
              )}

              <div className="max-h-48 space-y-1 overflow-y-auto">
                {assignees.map((assignee, index) => {
                  const amp = amps.find((a) => a.mac === assignee.mac);
                  const ampName = amp ? getDisplayName(amp) : assignee.mac.slice(-8);
                  const isEq = "band" in assignee;
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-card/30 px-3 py-1.5"
                    >
                      <span className="text-xs">
                        <span className="font-medium">{ampName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          &middot; Ch {assignee.channel + 1}
                          {isEq && (
                            <>
                              {" "}
                              &middot; {(assignee as EqGroupAssignee).target === "input" ? "In" : "Out"} &middot;{" "}
                              {EQ_BAND_LABELS[(assignee as EqGroupAssignee).band]}
                            </>
                          )}
                        </span>
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

      <EqBandPickerDialog
        open={eqPickerOpen}
        onOpenChange={setEqPickerOpen}
        onSelect={handleEqPickerSelect}
        existing={eqAssignees}
      />
      <ChannelPickerDialog
        open={channelPickerOpen}
        onOpenChange={setChannelPickerOpen}
        onSelect={handleChannelPickerSelect}
        existing={assignees as GroupAssignee[]}
      />
    </>
  );
}
