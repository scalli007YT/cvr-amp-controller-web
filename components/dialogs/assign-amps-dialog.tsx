"use client";

import { useState } from "react";
import { useProjectStore } from "@/stores/ProjectStore";
import { useAmpStore } from "@/stores/AmpStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Wifi } from "lucide-react";
import { useI18n } from "@/components/layout/i18n-provider";

interface ScannedDevice {
  ip: string;
  mac: string;
  name: string;
  deviceVersion: string;
  identifier: string;
  runtime: string;
}

export function AssignAmpsDialog() {
  const dict = useI18n();
  const { selectedProject, projects, addAmpToProject, deleteAmpFromProject } = useProjectStore();
  const { amps, getDisplayName } = useAmpStore();
  const [macInput, setMacInput] = useState("");
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<"manual" | "scan">("manual");
  const [scannedDevices, setScannedDevices] = useState<ScannedDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  if (!selectedProject) return null;

  const currentProject = projects.find((p) => p.id === selectedProject.id);
  if (!currentProject) return null;

  const handleAddAmp = async () => {
    if (!macInput.trim()) {
      alert(dict.dialogs.assignAmps.enterMac);
      return;
    }

    setIsSaving(true);
    try {
      await addAmpToProject(selectedProject.id, macInput);
      setMacInput("");
    } catch (error) {
      alert(
        `${dict.dialogs.assignAmps.errorAddingAmp}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFromScan = async (mac: string) => {
    setIsSaving(true);
    try {
      await addAmpToProject(selectedProject.id, mac);
      // Remove from scanned devices list after adding
      setScannedDevices(scannedDevices.filter((d) => d.mac !== mac));
    } catch (error) {
      alert(
        `${dict.dialogs.assignAmps.errorAddingAmp}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAmp = async (mac: string) => {
    setIsSaving(true);
    try {
      await deleteAmpFromProject(selectedProject.id, mac);
    } catch (error) {
      alert(
        `${dict.dialogs.assignAmps.errorDeletingAmp}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanError("");
    try {
      const response = await fetch("/api/scan");
      if (!response.ok) {
        setScanError(dict.dialogs.assignAmps.scanFailedNoDevices);
        setScannedDevices([]);
        return;
      }

      const data = await response.json();
      if (data.devices && Array.isArray(data.devices)) {
        // Filter out already assigned devices
        const assignedMacs = currentProject.assigned_amps.map((a) => a.mac.toUpperCase());
        const unassignedDevices = data.devices.filter(
          (d: ScannedDevice) => !assignedMacs.includes(d.mac.toUpperCase())
        );
        setScannedDevices(unassignedDevices);
        if (unassignedDevices.length === 0) {
          setScanError(dict.dialogs.assignAmps.allDiscoveredAssigned);
        }
      } else {
        setScanError(dict.dialogs.assignAmps.invalidResponseFormat);
      }
    } catch (error) {
      setScanError(
        `${dict.dialogs.assignAmps.scanError}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = () => {
    setOpen(false);
  };

  const totalAmps = currentProject.assigned_amps.length;
  const reachableAmps = currentProject.assigned_amps.filter(
    (a) => amps.find((s) => s.mac === a.mac)?.reachable === true
  ).length;
  const statusColor =
    totalAmps === 0
      ? "bg-muted/40"
      : reachableAmps === totalAmps
        ? "bg-green-500"
        : reachableAmps === 0
          ? "bg-red-500"
          : "bg-orange-400";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {dict.dialogs.assignAmps.manageAmps}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {reachableAmps}/{totalAmps}
            <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.dialogs.assignAmps.title}</DialogTitle>
          <DialogDescription>{dict.dialogs.assignAmps.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* List of assigned amps */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{dict.dialogs.assignAmps.assignedAmps}</Label>
            {currentProject.assigned_amps.length > 0 ? (
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {currentProject.assigned_amps.map((amp) => {
                  const ampInfo = amps.find((a) => a.mac === amp.mac);
                  return (
                    <div key={amp.mac} className="flex items-center justify-between p-3 hover:bg-accent gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3 flex-1 min-w-0 cursor-default">
                            {/* Reachability indicator */}
                            <div className="flex-shrink-0">
                              <div
                                className={`h-3 w-3 rounded-full ${ampInfo?.reachable ? "bg-green-500" : "bg-red-500"}`}
                              />
                            </div>

                            {/* Amp info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">
                                {ampInfo ? getDisplayName(ampInfo) : dict.dialogs.assignAmps.unknownAmp}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{amp.mac}</p>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p>
                            {dict.dialogs.assignAmps.status}:{" "}
                            {ampInfo?.reachable
                              ? dict.dialogs.assignAmps.reachable
                              : dict.dialogs.assignAmps.unreachable}
                          </p>
                          <p>
                            {dict.dialogs.assignAmps.mac}: {amp.mac}
                          </p>
                          <p>
                            {dict.dialogs.assignAmps.name}: {ampInfo ? getDisplayName(ampInfo) : "-"}
                          </p>
                          <p>
                            {dict.dialogs.assignAmps.version}: {ampInfo?.version ?? "-"}
                          </p>
                          <p>
                            {dict.dialogs.assignAmps.id}: {ampInfo?.id ?? "-"}
                          </p>
                          <p>
                            {dict.dialogs.assignAmps.runtime}:
                            {ampInfo?.run_time !== undefined
                              ? `${Math.floor(ampInfo.run_time / 60)}h ${ampInfo.run_time % 60}min`
                              : "-"}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAmp(amp.mac)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">{dict.dialogs.assignAmps.noAmpsAssigned}</p>
            )}
          </div>

          {/* Add new amp section */}
          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm font-semibold">{dict.dialogs.assignAmps.addNewAmp}</Label>

            {/* Mode selector */}
            <div className="flex gap-2">
              <Button
                variant={mode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMode("manual");
                  setScanError("");
                }}
                className="flex-1"
              >
                {dict.dialogs.assignAmps.manualEntry}
              </Button>
              <Button
                variant={mode === "scan" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMode("scan");
                  setScanError("");
                }}
                className="flex-1"
              >
                <Wifi className="h-4 w-4 mr-2" />
                {dict.dialogs.assignAmps.scanNetwork}
              </Button>
            </div>

            {/* Manual entry mode */}
            {mode === "manual" && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="mac-input" className="text-xs">
                    {dict.dialogs.assignAmps.macAddress}
                  </Label>
                  <Input
                    id="mac-input"
                    placeholder={dict.dialogs.assignAmps.macPlaceholder}
                    value={macInput}
                    onChange={(e) => setMacInput(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <Button onClick={handleAddAmp} disabled={isSaving} className="w-full" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {dict.dialogs.assignAmps.addAmp}
                </Button>
              </div>
            )}

            {/* Scan mode */}
            {mode === "scan" && (
              <div className="space-y-2">
                <Button onClick={handleScan} disabled={isScanning || isSaving} className="w-full" size="sm">
                  <Wifi className="h-4 w-4 mr-2" />
                  {isScanning ? dict.dialogs.assignAmps.scanning : dict.dialogs.assignAmps.startScan}
                </Button>

                <p className="text-xs text-muted-foreground text-center italic">{dict.dialogs.assignAmps.scanNote}</p>

                {scanError && <p className="text-xs text-destructive text-center">{scanError}</p>}

                {scannedDevices.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {scannedDevices.map((device) => (
                      <div key={device.mac} className="flex items-center justify-between p-3 hover:bg-accent">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{device.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{device.mac}</p>
                          <p className="text-xs text-muted-foreground truncate">{device.ip}</p>
                        </div>
                        <Button
                          onClick={() => handleAddFromScan(device.mac)}
                          disabled={isSaving}
                          size="sm"
                          variant="outline"
                          className="ml-2 flex-shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSaving || isScanning}>
              {dict.dialogs.common.cancel}
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving || isScanning}>
            {isSaving ? dict.dialogs.common.saving : dict.dialogs.common.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
