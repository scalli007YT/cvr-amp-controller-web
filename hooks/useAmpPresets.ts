"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useAmpStore } from "@/stores/AmpStore";
import type { AmpPreset } from "@/stores/AmpStore";
import { presetNameSchema, presetStoreRequestSchema } from "@/lib/validation/presets";

interface UseAmpPresetsReturn {
  /** Fetch preset names from the device and write them into AmpStore. */
  fetchPresets: (mac: string) => Promise<void>;
  /** Recall a preset slot on the device. */
  recallPreset: (mac: string, slot: number, name?: string) => Promise<boolean>;
  /** Store current state into a preset slot with a name. */
  storePreset: (mac: string, slot: number, name: string) => Promise<boolean>;
  /** True while a fetch is in flight. */
  fetching: boolean;
  /** Slot currently being recalled, or null if none. */
  recallingSlot: number | null;
  /** Slot currently being stored, or null if none. */
  storingSlot: number | null;
  /** Last error message, or null if none. */
  error: string | null;
  /** Clear the last error. */
  clearError: () => void;
}

/**
 * Hook for on-demand preset fetching.
 *
 * Responsibility boundary:
 *   - Owns the fetch lifecycle (loading / error state)
 *   - Reads `ip` from AmpStore (set by the polling layer)
 *   - Writes fetched presets back to AmpStore via `setPresets`
 *   - Never touches polling concerns
 *
 * Usage:
 *   const { fetchPresets, fetching, error } = useAmpPresets();
 *   await fetchPresets(amp.mac);
 */
export function useAmpPresets(): UseAmpPresetsReturn {
  const { amps, setPresets } = useAmpStore();
  const [fetching, setFetching] = useState(false);
  const [recallingSlot, setRecallingSlot] = useState<number | null>(null);
  const [storingSlot, setStoringSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPresets = useCallback(
    async (mac: string) => {
      const amp = amps.find((a) => a.mac === mac);

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
        } else {
          setError(data.error ?? "Unknown error from server");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fetch failed");
      } finally {
        setFetching(false);
      }
    },
    [amps, setPresets]
  );

  const clearError = useCallback(() => setError(null), []);

  const recallPreset = useCallback(
    async (mac: string, slot: number, name?: string) => {
      const amp = amps.find((a) => a.mac === mac);

      if (!amp?.ip) {
        const message = "No IP address known for this amp yet. Wait for a poll cycle.";
        setError(message);
        toast.error(message);
        return false;
      }

      setRecallingSlot(slot);
      setError(null);

      try {
        const res = await fetch("/api/amp-presets/recall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: amp.ip, mac, slot })
        });

        const data = (await res.json()) as {
          success: boolean;
          error?: string;
        };

        if (!res.ok || !data.success) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        toast.success(name ? `Recalled preset ${slot}: ${name}` : `Recalled preset ${slot}`);
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
    [amps]
  );

  const storePreset = useCallback(
    async (mac: string, slot: number, name: string) => {
      const amp = amps.find((a) => a.mac === mac);

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

        const res = await fetch("/api/amp-presets/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadValidation.data)
        });

        const data = (await res.json()) as {
          success: boolean;
          error?: string;
        };

        if (!res.ok || !data.success) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
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
    [amps, setPresets]
  );

  return {
    fetchPresets,
    recallPreset,
    storePreset,
    fetching,
    recallingSlot,
    storingSlot,
    error,
    clearError
  };
}
