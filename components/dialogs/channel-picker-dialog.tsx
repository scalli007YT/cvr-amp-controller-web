"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAmpStore } from "@/stores/AmpStore";
import { useProjectStore } from "@/stores/ProjectStore";
import type { GroupAssignee } from "@/stores/ToolboxStore";

interface ChannelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (assignee: GroupAssignee) => void;
  existing?: GroupAssignee[];
}

export function ChannelPickerDialog({ open, onOpenChange, onSelect, existing = [] }: ChannelPickerDialogProps) {
  const amps = useAmpStore((s) => s.amps);
  const getDisplayName = useAmpStore((s) => s.getDisplayName);
  const selectedProject = useProjectStore((s) => s.selectedProject);

  const [selectedMac, setSelectedMac] = useState<string | null>(null);

  const assignedMacs = new Set(selectedProject?.assigned_amps.map((a) => a.mac) ?? []);
  const reachableAmps = amps.filter((a) => a.reachable && assignedMacs.has(a.mac));
  const selectedAmp = reachableAmps.find((a) => a.mac === selectedMac);
  const channelCount = selectedAmp?.basic_info?.Output_chx ?? selectedAmp?.channelParams?.channels.length ?? 4;

  const handleChannelSelect = useCallback(
    (channel: number) => {
      if (!selectedMac) return;
      onSelect({ mac: selectedMac, channel });
    },
    [selectedMac, onSelect]
  );

  const handleClose = (v: boolean) => {
    if (!v) setSelectedMac(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Channel</DialogTitle>
          <DialogDescription>
            {selectedMac ? "Select a channel to add." : "Select an amplifier first."}
          </DialogDescription>
        </DialogHeader>

        {!selectedMac ? (
          <div className="space-y-1">
            {reachableAmps.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {assignedMacs.size === 0
                  ? "No amps assigned to the current project."
                  : "No assigned amps are currently reachable."}
              </p>
            )}
            {reachableAmps.map((amp) => (
              <Button
                key={amp.mac}
                variant="outline"
                className="w-full justify-start text-xs"
                onClick={() => setSelectedMac(amp.mac)}
              >
                {getDisplayName(amp)}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedMac(null)}>
              &#8592; Back to amps
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: channelCount }, (_, i) => {
                const alreadyAssigned = existing.some((a) => a.mac === selectedMac && a.channel === i);
                return (
                  <Button
                    key={i}
                    variant="outline"
                    className="text-xs"
                    disabled={alreadyAssigned}
                    onClick={() => handleChannelSelect(i)}
                  >
                    Ch {i + 1}
                    {alreadyAssigned && <span className="ml-1.5 text-[9px] text-muted-foreground">(added)</span>}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
