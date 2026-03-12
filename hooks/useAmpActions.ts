"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  MATRIX_GAIN_MAX_DB,
  MATRIX_GAIN_MIN_DB,
  DELAY_MIN_MS,
  DELAY_IN_MAX_MS,
  DELAY_OUT_MAX_MS,
  CROSSOVER_FREQ_MIN_HZ,
  CROSSOVER_FREQ_MAX_HZ,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = 0 | 1 | 2 | 3;
type CrossoverTarget = "input" | "output";
type CrossoverKind = "hp" | "lp";

interface AmpActionsHook {
  muteIn: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  muteOut: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  setDelayIn: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setDelayOut: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setCrossoverEnabled: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    enabled: boolean,
    filterType: number,
  ) => Promise<void>;
  setCrossoverFreq: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    hz: number,
  ) => Promise<void>;
  invertPolarityOut: (
    mac: string,
    channel: Channel,
    inverted: boolean,
  ) => Promise<void>;
  noiseGateOut: (
    mac: string,
    channel: Channel,
    enabled: boolean,
  ) => Promise<void>;
  /** Set crosspoint gain (dB) for a matrix cell. */
  setMatrixGain: (
    mac: string,
    channel: Channel,
    source: Channel,
    gainDb: number,
  ) => Promise<void>;
  /** Toggle a matrix crosspoint on/off. */
  setMatrixActive: (
    mac: string,
    channel: Channel,
    source: Channel,
    active: boolean,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAmpActions(): AmpActionsHook {
  /** Send a POST to /api/amp-actions. UI updates from polled amp state. */
  const send = useCallback(
    async (
      mac: string,
      action: string,
      channel: Channel,
      value: boolean | number,
      extra?: Record<string, unknown>,
    ) => {
      try {
        const res = await fetch("/api/amp-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac, action, channel, value, ...extra }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Command failed: ${msg}`);
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // muteIn
  // ---------------------------------------------------------------------------
  const muteIn = useCallback(
    async (mac: string, channel: Channel, muted: boolean) => {
      await send(mac, "muteIn", channel, muted);
    },
    [send],
  );

  // ---------------------------------------------------------------------------
  // muteOut
  // ---------------------------------------------------------------------------
  const muteOut = useCallback(
    async (mac: string, channel: Channel, muted: boolean) => {
      await send(mac, "muteOut", channel, muted);
    },
    [send],
  );

  // ---------------------------------------------------------------------------
  // invertPolarityOut
  // ---------------------------------------------------------------------------
  const invertPolarityOut = useCallback(
    async (mac: string, channel: Channel, inverted: boolean) => {
      await send(mac, "invertPolarityOut", channel, inverted);
    },
    [send],
  );

  // ---------------------------------------------------------------------------
  // noiseGateOut
  // ---------------------------------------------------------------------------
  const noiseGateOut = useCallback(
    async (mac: string, channel: Channel, enabled: boolean) => {
      await send(mac, "noiseGateOut", channel, enabled);
    },
    [send],
  );

  const setMatrixGain = useCallback(
    async (mac: string, channel: Channel, source: Channel, gainDb: number) => {
      const clampedGainDb = Math.max(
        MATRIX_GAIN_MIN_DB,
        Math.min(MATRIX_GAIN_MAX_DB, gainDb),
      );
      await send(mac, "matrixGain", channel, clampedGainDb, { source });
    },
    [send],
  );

  // ---------------------------------------------------------------------------
  // setMatrixActive
  // ---------------------------------------------------------------------------
  const setMatrixActive = useCallback(
    async (mac: string, channel: Channel, source: Channel, active: boolean) => {
      await send(mac, "matrixActive", channel, active, { source });
    },
    [send],
  );

  // ---------------------------------------------------------------------------
  // setDelayIn
  // ---------------------------------------------------------------------------
  const setDelayIn = useCallback(
    async (mac: string, channel: Channel, ms: number) => {
      const clamped = Math.max(DELAY_MIN_MS, Math.min(DELAY_IN_MAX_MS, ms));
      await send(mac, "delayIn", channel, clamped);
    },
    [send],
  );

  // ---------------------------------------------------------------------------
  // setDelayOut
  // ---------------------------------------------------------------------------
  const setDelayOut = useCallback(
    async (mac: string, channel: Channel, ms: number) => {
      const clamped = Math.max(DELAY_MIN_MS, Math.min(DELAY_OUT_MAX_MS, ms));
      await send(mac, "delayOut", channel, clamped);
    },
    [send],
  );

  const setCrossoverEnabled = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      kind: CrossoverKind,
      enabled: boolean,
      filterType: number,
    ) => {
      await send(mac, "crossoverEnabled", channel, enabled, {
        target,
        kind,
        filterType,
      });
    },
    [send],
  );

  const setCrossoverFreq = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      kind: CrossoverKind,
      hz: number,
    ) => {
      const clamped = Math.max(
        CROSSOVER_FREQ_MIN_HZ,
        Math.min(CROSSOVER_FREQ_MAX_HZ, hz),
      );
      await send(mac, "crossoverFreq", channel, clamped, { target, kind });
    },
    [send],
  );

  return {
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    setMatrixGain,
    setMatrixActive,
    setDelayIn,
    setDelayOut,
    setCrossoverEnabled,
    setCrossoverFreq,
  };
}
