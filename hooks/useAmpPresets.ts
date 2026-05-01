"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useAmpStore } from "@/stores/AmpStore";
import type { AmpPreset } from "@/stores/AmpStore";
import { presetNameSchema, presetStoreRequestSchema } from "@/lib/validation/presets";
import { dispatch } from "@/lib/queue-dispatch";

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

interface UseAmpPresetsReturn {
  /** Fetch preset names from the device and write them into AmpStore. */
  fetchPresets: (mac: string) => Promise<void>;
  /** Refresh current preset/scenario name from device runtime state. */
  refreshCurrentPreset: (mac: string) => Promise<void>;
  /** Recall a preset slot on the device. */
  recallPreset: (mac: string, slot: number, name?: string) => Promise<boolean>;
  /** Store current state into a preset slot with a name. */
  storePreset: (mac: string, slot: number, name: string) => Promise<boolean>;
  /** Clear all preset slots on the device (FC59 mode=3). */
  clearAllPresets: (mac: string) => Promise<boolean>;
  /** Factory reset the device (FC16). */
  factoryReset: (mac: string) => Promise<boolean>;
  /** Set all specified output channels to a volume (dB) — used before export to silence outputs. */
  muteOutputsForExport: (mac: string, channelIndices: number[]) => Promise<boolean>;
  /** Export full device state as a .sd file (original CVR software format). */
  exportSdFile: (mac: string, presetName?: string) => Promise<boolean>;
  /** Restore device state from a .sd binary backup file (original CVR software format). */
  importSdFile: (mac: string, file: File) => Promise<boolean>;
  /** True while a fetch is in flight. */
  fetching: boolean;
  /** Slot currently being recalled, or null if none. */
  recallingSlot: number | null;
  /** Slot currently being stored, or null if none. */
  storingSlot: number | null;
  /** True while a clear-all or factory-reset is in flight. */
  resetting: boolean;
  /** True while an export or import is in progress. */
  transferring: boolean;
  /** Last error message, or null if none. */
  error: string | null;
  /** Clear the last error. */
  clearError: () => void;
}

/**
 * Hook for on-demand preset management.
 *
 * Responsibility boundary:
 *   - Owns the fetch lifecycle (loading / error state)
 *   - Reads `ip` from AmpStore (set by the polling layer)
 *   - Writes fetched presets back to AmpStore via `setPresets`
 *   - Never touches polling concerns
 */
export function useAmpPresets(): UseAmpPresetsReturn {
  const setPresets = useAmpStore((state) => state.setPresets);
  const updateAmpStatus = useAmpStore((state) => state.updateAmpStatus);

  const [fetching, setFetching] = useState(false);
  const [recallingSlot, setRecallingSlot] = useState<number | null>(null);
  const [storingSlot, setStoringSlot] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAmp = useCallback((mac: string) => useAmpStore.getState().amps.find((amp) => amp.mac === mac), []);

  const syncCurrentPreset = useCallback(
    (mac: string, currentPreset: string | null | undefined) => {
      if (typeof currentPreset !== "string") return;

      const amp = getAmp(mac);
      if (amp?.current_preset === currentPreset) return;

      updateAmpStatus(mac, { current_preset: currentPreset });
    },
    [getAmp, updateAmpStatus]
  );

  const fetchPresets = useCallback(
    async (mac: string) => {
      const amp = getAmp(mac);

      if (!amp?.ip) {
        setError("No IP address known for this amp yet. Wait for a poll cycle.");
        return;
      }

      setFetching(true);
      setError(null);

      try {
        const res = await fetch("/api/amp-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: amp.ip, mac })
        });

        const data = (await res.json()) as {
          success: boolean;
          presets?: AmpPreset[];
          error?: string;
        };

        if (data.success && data.presets) {
          setPresets(mac, data.presets);

          const currentRes = await fetch("/api/amp-presets/current", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip: amp.ip, mac })
          });

          const currentData = (await currentRes.json()) as {
            success: boolean;
            currentPreset?: string | null;
          };

          if (currentRes.ok && currentData.success) {
            syncCurrentPreset(mac, currentData.currentPreset);
          }
        } else {
          setError(data.error ?? "Unknown error from server");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fetch failed");
      } finally {
        setFetching(false);
      }
    },
    [getAmp, setPresets, syncCurrentPreset]
  );

  const refreshCurrentPreset = useCallback(
    async (mac: string) => {
      const amp = getAmp(mac);
      if (!amp?.ip) return;

      try {
        const currentRes = await fetch("/api/amp-presets/current", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: amp.ip, mac })
        });

        const currentData = (await currentRes.json()) as {
          success: boolean;
          currentPreset?: string | null;
        };

        if (currentRes.ok && currentData.success) {
          syncCurrentPreset(mac, currentData.currentPreset);
        }
      } catch {
        // Non-critical background refresh.
      }
    },
    [getAmp, syncCurrentPreset]
  );

  const clearError = useCallback(() => setError(null), []);

  const recallPreset = useCallback(
    async (mac: string, slot: number, name?: string) => {
      const amp = getAmp(mac);

      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      setRecallingSlot(slot);
      setError(null);

      try {
        const packet = await dispatch({
          origin: "useAmpPresets.recallPreset",
          action: "recallPreset",
          priority: "reliable",
          targets: [{ mac }],
          endpoint: "/api/amp-presets/recall",
          buildPayload: () => ({ ip: amp.ip, mac, slot }),
          suppressToast: true,
          throwOnError: true
        });

        if (packet.status === "failed") {
          throw new Error(packet.steps[0]?.error ?? "Recall failed");
        }

        // Optimistic update: set the preset name immediately from known slot data
        const optimisticName = amp.presets?.find((preset) => preset.slot === slot)?.name?.trim() || name?.trim();
        if (optimisticName) {
          updateAmpStatus(mac, { current_preset: optimisticName });
        }

        toast.success(name ? `Recalled preset ${slot}: ${name}` : `Recalled preset ${slot}`);

        // Background readback after a short delay to confirm the device applied the preset
        const ip = amp.ip;
        setTimeout(async () => {
          try {
            const currentRes = await fetch("/api/amp-presets/current", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ip, mac })
            });

            const currentData = (await currentRes.json()) as {
              success: boolean;
              currentPreset?: string | null;
            };

            if (currentRes.ok && currentData.success) {
              syncCurrentPreset(mac, currentData.currentPreset);
            }
          } catch {
            // Non-critical: optimistic name is already set
          }
        }, 500);

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Recall failed";
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setRecallingSlot(null);
      }
    },
    [getAmp, syncCurrentPreset, updateAmpStatus]
  );

  const storePreset = useCallback(
    async (mac: string, slot: number, name: string) => {
      const amp = getAmp(mac);

      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      const trimmedName = name.trim();
      const nameValidation = presetNameSchema.safeParse(trimmedName);
      if (!nameValidation.success) {
        const message = nameValidation.error.issues[0]?.message ?? "Invalid preset name";
        setError(message);
        toast.error(message);
        return false;
      }

      setStoringSlot(slot);
      setError(null);

      try {
        const payloadValidation = presetStoreRequestSchema.safeParse({
          ip: amp.ip,
          mac,
          slot,
          name: nameValidation.data
        });

        if (!payloadValidation.success) {
          throw new Error(payloadValidation.error.issues[0]?.message ?? "Invalid store request");
        }

        const packet = await dispatch({
          origin: "useAmpPresets.storePreset",
          action: "storePreset",
          priority: "reliable",
          targets: [{ mac }],
          endpoint: "/api/amp-presets/store",
          buildPayload: () => payloadValidation.data,
          suppressToast: true,
          throwOnError: true
        });

        if (packet.status === "failed") {
          throw new Error(packet.steps[0]?.error ?? "Store failed");
        }

        if (amp.presets) {
          const next = amp.presets.some((p) => p.slot === slot)
            ? amp.presets.map((p) => (p.slot === slot ? { ...p, name: nameValidation.data } : p))
            : [...amp.presets, { slot, name: nameValidation.data }].sort((a, b) => a.slot - b.slot);
          setPresets(mac, next);
        }

        toast.success(`Stored preset ${slot}: ${nameValidation.data}`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Store failed";
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setStoringSlot(null);
      }
    },
    [getAmp, setPresets]
  );

  const clearAllPresets = useCallback(
    async (mac: string) => {
      const amp = getAmp(mac);
      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      setResetting(true);
      setError(null);

      try {
        const packet = await dispatch({
          origin: "useAmpPresets.clearAllPresets",
          action: "clearAllPresets",
          priority: "reliable",
          targets: [{ mac }],
          endpoint: "/api/amp-presets/clear-all",
          buildPayload: () => ({ ip: amp.ip, mac }),
          suppressToast: true,
          throwOnError: true
        });
        if (packet.status === "failed") throw new Error(packet.steps[0]?.error ?? "Clear failed");

        setPresets(mac, []);
        toast.success("All presets cleared");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Clear all failed";
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setResetting(false);
      }
    },
    [getAmp, setPresets]
  );

  const factoryReset = useCallback(
    async (mac: string) => {
      const amp = getAmp(mac);
      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      setResetting(true);
      setError(null);

      try {
        const packet = await dispatch({
          origin: "useAmpPresets.factoryReset",
          action: "factoryReset",
          priority: "reliable",
          targets: [{ mac }],
          endpoint: "/api/amp-presets/factory-reset",
          buildPayload: () => ({ ip: amp.ip, mac }),
          suppressToast: true,
          throwOnError: true
        });
        if (packet.status === "failed") throw new Error(packet.steps[0]?.error ?? "Factory reset failed");

        toast.success("Factory reset sent to device");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Factory reset failed";
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setResetting(false);
      }
    },
    [getAmp]
  );

  const muteOutputsForExport = useCallback(async (mac: string, channelIndices: number[]) => {
    try {
      const packet = await dispatch({
        origin: "useAmpPresets.muteOutputsForExport",
        action: "volumeOut",
        priority: "reliable",
        targets: channelIndices.map((ch) => ({ mac, channel: ch })),
        endpoint: "/api/amp-actions",
        buildPayload: (t) => ({ mac: t.mac, channel: t.channel, action: "volumeOut", value: -80 }),
        suppressToast: true,
        throwOnError: true
      });
      return packet.status === "completed";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mute failed";
      setError(message);
      toast.error(message);
      return false;
    }
  }, []);

  const exportSdFile = useCallback(
    async (mac: string, presetName?: string) => {
      const amp = getAmp(mac);
      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      setTransferring(true);
      setError(null);

      try {
        const outputChannels = amp.output_chx ?? 4;
        const res = await fetch("/api/amp-presets/export-sd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: amp.ip, mac, outputChannels })
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const safeName = (presetName ?? "amp-backup").replace(/[^a-z0-9_\-]/gi, "_");
        const date = new Date().toISOString().slice(0, 10);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}_${date}.sd`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Device state exported as .sd");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed";
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setTransferring(false);
      }
    },
    [getAmp]
  );

  const importSdFile = useCallback(
    async (mac: string, file: File) => {
      const amp = getAmp(mac);
      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      setTransferring(true);
      setError(null);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const binary = Array.from(uint8)
          .map((b) => String.fromCharCode(b))
          .join("");
        const fileBase64 = btoa(binary);

        const outputChannels = amp.output_chx ?? 4;
        const res = await fetch("/api/amp-presets/import-sd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: amp.ip, mac, fileBase64, outputChannels })
        });

        const data = (await res.json()) as {
          success: boolean;
          error?: string;
          syncBytes?: number;
          firChannels?: number;
        };

        if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`);

        toast.success(
          `Device state restored from .sd file (${data.syncBytes}B sync, ${data.firChannels ?? 0} FIR channels)`
        );
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setTransferring(false);
      }
    },
    [getAmp]
  );

  return {
    fetchPresets,
    refreshCurrentPreset,
    recallPreset,
    storePreset,
    clearAllPresets,
    factoryReset,
    muteOutputsForExport,
    exportSdFile,
    importSdFile,
    fetching,
    recallingSlot,
    storingSlot,
    resetting,
    transferring,
    error,
    clearError
  };
}
