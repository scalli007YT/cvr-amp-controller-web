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

interface ScannedDevice {
  ip: string;
  mac: string;
  name: string;
  deviceVersion: string;
  identifier: string;
  runtime: string;
}

export function AssignAmpsDialog() {
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
      alert("Please enter a MAC address");
      return;
    }

    setIsSaving(true);
    try {
      await addAmpToProject(selectedProject.id, macInput);
      setMacInput("");
    } catch (error) {
      alert(`Error adding amp: ${error instanceof Error ? error.message : "Unknown error"}`);
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
      alert(`Error adding amp: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAmp = async (mac: string) => {
    setIsSaving(true);
    try {
      await deleteAmpFromProject(selectedProject.id, mac);
    } catch (error) {
      alert(`Error deleting amp: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        setScanError("No devices found or scan failed");
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
          setScanError("All discovered devices are already assigned");
        }
      } else {
        setScanError("Invalid response format");
      }
    } catch (error) {
      setScanError(`Scan error: ${error instanceof Error ? error.message : "Unknown error"}`);
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
          Manage Amps
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {reachableAmps}/{totalAmps}
            <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Assigned Amps</DialogTitle>
          <DialogDescription>Add or remove amplifiers from this project</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* List of assigned amps */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Assigned Amps</Label>
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
                                {ampInfo ? getDisplayName(ampInfo) : "Unknown Amp"}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{amp.mac}</p>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p>Status: {ampInfo?.reachable ? "Reachable" : "Unreachable"}</p>
                          <p>MAC: {amp.mac}</p>
                          <p>Name: {ampInfo ? getDisplayName(ampInfo) : "—"}</p>
                          <p>Version: {ampInfo?.version ?? "—"}</p>
                          <p>ID: {ampInfo?.id ?? "—"}</p>
                          <p>
                            Runtime:{" "}
                            {ampInfo?.run_time !== undefined
                              ? `${Math.floor(ampInfo.run_time / 60)}h ${ampInfo.run_time % 60}min`
                              : "—"}
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
              <p className="text-sm text-muted-foreground py-4 text-center">No amps assigned yet</p>
            )}
          </div>

          {/* Add new amp section */}
          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm font-semibold">Add New Amp</Label>

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
                Manual Entry
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
                Scan Network
              </Button>
            </div>

            {/* Manual entry mode */}
            {mode === "manual" && (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="mac-input" className="text-xs">
                    MAC Address
                  </Label>
                  <Input
                    id="mac-input"
                    placeholder="e.g., 6A:20:67:18:B5:8A"
                    value={macInput}
                    onChange={(e) => setMacInput(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <Button onClick={handleAddAmp} disabled={isSaving} className="w-full" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Amp
                </Button>
              </div>
            )}

            {/* Scan mode */}
            {mode === "scan" && (
              <div className="space-y-2">
                <Button onClick={handleScan} disabled={isScanning || isSaving} className="w-full" size="sm">
                  <Wifi className="h-4 w-4 mr-2" />
                  {isScanning ? "Scanning..." : "Start Scan"}
                </Button>

                <p className="text-xs text-muted-foreground text-center italic">
                  Note: Other devices may become unreachable for a few seconds during scanning.
                </p>

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
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving || isScanning}>
            {isSaving ? "Saving..." : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
