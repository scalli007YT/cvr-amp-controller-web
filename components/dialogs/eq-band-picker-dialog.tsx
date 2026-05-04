"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAmpStore, type Amp } from "@/stores/AmpStore";
import { useProjectStore } from "@/stores/ProjectStore";
import { EQ_BAND_LABELS } from "@/lib/eq";
import { EQ_FILTER_TYPE_NAMES } from "@/lib/parse-channel-data";
import type { EqGroupAssignee } from "@/stores/ToolboxStore";

interface EqBandPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (assignee: EqGroupAssignee) => void;
  existing?: EqGroupAssignee[];
}

export function EqBandPickerDialog({ open, onOpenChange, onSelect, existing = [] }: EqBandPickerDialogProps) {
  const { amps, getDisplayName } = useAmpStore();
  const { selectedProject } = useProjectStore();
  const [selectedAmp, setSelectedAmp] = useState<Amp | null>(null);
  const [target, setTarget] = useState<"input" | "output">("input");

  const assignedAmps =
    (selectedProject?.assigned_amps.map((a) => amps.find((amp) => amp.mac === a.mac)).filter(Boolean) as Amp[]) ?? [];

  const handleAmpSelect = (amp: Amp) => {
    setSelectedAmp(amp);
  };

  const handleBandSelect = (channel: number, band: number) => {
    if (!selectedAmp) return;
    onSelect({ mac: selectedAmp.mac, channel, target, band });
  };

  const handleBack = () => {
    setSelectedAmp(null);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) setSelectedAmp(null);
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!w-auto !max-w-[calc(100vw-4rem)] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{selectedAmp ? `${getDisplayName(selectedAmp)} — Select EQ Band` : "Select Amp"}</DialogTitle>
          <DialogDescription>
            {selectedAmp
              ? "Choose an EQ band to add to this group controller."
              : "Select an amp to browse its EQ bands."}
          </DialogDescription>
        </DialogHeader>

        {!selectedAmp ? (
          /* Step 1: Amp selection */
          <div className="grid gap-2 overflow-y-auto">
            {assignedAmps.map((amp) => (
              <Button
                key={amp.mac}
                variant="outline"
                className="h-auto justify-start gap-3 p-3"
                onClick={() => handleAmpSelect(amp)}
              >
                <div className={`size-2.5 rounded-full ${amp.reachable ? "bg-green-500" : "bg-red-500"}`} />
                <div className="text-left">
                  <div className="text-sm font-medium">{getDisplayName(amp)}</div>
                  <div className="text-xs text-muted-foreground">{amp.mac}</div>
                </div>
                {amp.channelParams && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {amp.channelParams.channels.length} ch
                  </Badge>
                )}
              </Button>
            ))}
            {assignedAmps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No amps assigned to the current project.</p>
            )}
          </div>
        ) : (
          /* Step 2: Table layout — channels × bands */
          <div className="flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="w-fit" onClick={handleBack}>
                ← Back
              </Button>
              <ToggleGroup
                type="single"
                variant="outline"
                value={target}
                onValueChange={(v) => {
                  if (v) setTarget(v as "input" | "output");
                }}
              >
                <ToggleGroupItem value="input" className="px-4 text-xs">
                  In
                </ToggleGroupItem>
                <ToggleGroupItem value="output" className="px-4 text-xs">
                  Out
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {selectedAmp.channelParams?.channels ? (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-xs">
                  {/* Band header row */}
                  <thead>
                    <tr>
                      <th className="w-20 py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Channel
                      </th>
                      {EQ_BAND_LABELS.slice(1, 9).map((lbl) => (
                        <th
                          key={lbl}
                          className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {lbl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {selectedAmp.channelParams.channels.map((ch, chIdx) => {
                      const bands = target === "input" ? ch.eqIn : ch.eqOut;
                      return (
                        <tr key={chIdx}>
                          <td className="py-2 pr-3 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                            Ch {chIdx + 1}
                          </td>
                          {bands.slice(1, 9).map((band, i) => {
                            const bandIdx = i + 1;
                            const typeName = EQ_FILTER_TYPE_NAMES[band.type] ?? "Off";
                            const shortType: Record<string, string> = {
                              Peaking: "Peak",
                              Low_Shelf: "L.Shelf",
                              High_Shelf: "H.Shelf",
                              "All_Pass-1st": "AP-1",
                              "All_Pass-2nd": "AP-2",
                              General_Low: "Gen LP",
                              General_High: "Gen HP",
                              Butterworth_Low: "BW LP",
                              Butterworth_High: "BW HP",
                              Bessel_Low: "Be LP",
                              Bessel_High: "Be HP"
                            };
                            const typeLabel = shortType[typeName] ?? typeName;
                            const isBypassed = band.bypass === true;
                            const isAssigned = existing.some(
                              (a) =>
                                a.mac === selectedAmp.mac &&
                                a.channel === chIdx &&
                                a.target === target &&
                                a.band === bandIdx
                            );
                            return (
                              <td key={bandIdx} className="px-1 py-1.5">
                                <button
                                  disabled={isAssigned}
                                  className={`min-w-[4.5rem] rounded-md border px-2 py-2 text-left transition-colors ${
                                    isAssigned
                                      ? "border-primary/40 bg-primary/10 opacity-60 cursor-default"
                                      : isBypassed
                                        ? "border-border/20 bg-background/10 opacity-40 hover:bg-accent hover:border-primary/40"
                                        : "border-border/40 bg-background/30 hover:bg-accent hover:border-primary/40"
                                  }`}
                                  onClick={() => !isAssigned && handleBandSelect(chIdx, bandIdx)}
                                >
                                  <div className="text-[10px] font-medium text-muted-foreground whitespace-nowrap leading-tight">
                                    {typeLabel}
                                  </div>
                                  <div className="font-mono text-[11px] whitespace-nowrap leading-snug">
                                    {band.freq >= 1000
                                      ? `${(band.freq / 1000).toFixed(1)}k`
                                      : `${Math.round(band.freq)}`}{" "}
                                    Hz
                                  </div>
                                  <div
                                    className={`font-mono text-[11px] whitespace-nowrap leading-snug ${band.gain > 0 ? "text-green-500" : band.gain < 0 ? "text-red-400" : ""}`}
                                  >
                                    {band.gain > 0 ? "+" : ""}
                                    {band.gain.toFixed(1)} dB
                                  </div>
                                  <div className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-tight">
                                    Q {band.q.toFixed(2)}
                                  </div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No channel data available. Amp may be offline.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
