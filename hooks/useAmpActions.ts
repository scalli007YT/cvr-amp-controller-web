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
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_Q_MIN,
  EQ_BAND_Q_MAX,
  RMS_LIMITER_THRESHOLD_MIN_VRMS,
  RMS_LIMITER_ATTACK_MAX_MS,
  RMS_LIMITER_RELEASE_MAX_MULTIPLIER,
  PEAK_LIMITER_THRESHOLD_MIN_VP,
  PEAK_LIMITER_HOLD_MAX_MS,
  PEAK_LIMITER_RELEASE_MAX_MS,
} from "@/lib/constants";
import { useAmpStore } from "@/stores/AmpStore";
import { rmsToPeakVoltage } from "@/lib/generic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = 0 | 1 | 2 | 3;
type CrossoverTarget = "input" | "output";
type CrossoverKind = "hp" | "lp";

type RmsLimiterParams = {
  attackMs: number;
  releaseMultiplier: number;
  thresholdVrms: number;
};

type PeakLimiterParams = {
  holdMs: number;
  releaseMs: number;
  thresholdVp: number;
};

interface AmpActionsHook {
  muteIn: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  muteOut: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  setDelayIn: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setDelayOut: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setPowerModeOut: (
    mac: string,
    channel: Channel,
    mode: number,
  ) => Promise<void>;
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
  setEqBandType: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    type: number,
    bypass: boolean,
  ) => Promise<void>;
  setEqBandFreq: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    hz: number,
  ) => Promise<void>;
  setEqBandGain: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    db: number,
  ) => Promise<void>;
  setEqBandQ: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    q: number,
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
  rmsLimiterOut: (
    mac: string,
    channel: Channel,
    enabled: boolean,
    params?: RmsLimiterParams,
  ) => Promise<void>;
  setRmsLimiterAttack: (
    mac: string,
    channel: Channel,
    attackMs: number,
    config: RmsLimiterParams & { enabled: boolean },
  ) => Promise<void>;
  setRmsLimiterReleaseMultiplier: (
    mac: string,
    channel: Channel,
    releaseMultiplier: number,
    config: RmsLimiterParams & { enabled: boolean },
  ) => Promise<void>;
  setRmsLimiterThreshold: (
    mac: string,
    channel: Channel,
    thresholdVrms: number,
    config: RmsLimiterParams & { enabled: boolean },
  ) => Promise<void>;
  peakLimiterOut: (
    mac: string,
    channel: Channel,
    enabled: boolean,
    params?: PeakLimiterParams,
  ) => Promise<void>;
  setPeakLimiterHold: (
    mac: string,
    channel: Channel,
    holdMs: number,
    config: PeakLimiterParams & { enabled: boolean },
  ) => Promise<void>;
  setPeakLimiterRelease: (
    mac: string,
    channel: Channel,
    releaseMs: number,
    config: PeakLimiterParams & { enabled: boolean },
  ) => Promise<void>;
  setPeakLimiterThreshold: (
    mac: string,
    channel: Channel,
    thresholdVp: number,
    config: PeakLimiterParams & { enabled: boolean },
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
  const { amps } = useAmpStore();

  /** Returns the rated RMS voltage for a given mac, or undefined if unknown. */
  const getRatedRmsV = useCallback(
    (mac: string) => amps.find((a) => a.mac === mac)?.ratedRmsV,
    [amps],
  );

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

  const rmsLimiterOut = useCallback(
    async (
      mac: string,
      channel: Channel,
      enabled: boolean,
      params?: RmsLimiterParams,
    ) => {
      await send(mac, "rmsLimiterOut", channel, enabled, params);
    },
    [send],
  );

  const setRmsLimiterAttack = useCallback(
    async (
      mac: string,
      channel: Channel,
      attackMs: number,
      config: RmsLimiterParams & { enabled: boolean },
    ) => {
      const clampedAttack = Math.max(
        0,
        Math.min(RMS_LIMITER_ATTACK_MAX_MS, attackMs),
      );
      await send(mac, "rmsLimiterOut", channel, config.enabled, {
        attackMs: clampedAttack,
        releaseMultiplier: config.releaseMultiplier,
        thresholdVrms: config.thresholdVrms,
      });
    },
    [send],
  );

  const setRmsLimiterReleaseMultiplier = useCallback(
    async (
      mac: string,
      channel: Channel,
      releaseMultiplier: number,
      config: RmsLimiterParams & { enabled: boolean },
    ) => {
      const clamped = Math.max(
        0,
        Math.min(RMS_LIMITER_RELEASE_MAX_MULTIPLIER, releaseMultiplier),
      );
      await send(mac, "rmsLimiterOut", channel, config.enabled, {
        attackMs: config.attackMs,
        releaseMultiplier: clamped,
        thresholdVrms: config.thresholdVrms,
      });
    },
    [send],
  );

  const setRmsLimiterThreshold = useCallback(
    async (
      mac: string,
      channel: Channel,
      thresholdVrms: number,
      config: RmsLimiterParams & { enabled: boolean },
    ) => {
      const maxVrms = getRatedRmsV(mac);
      const clamped =
        maxVrms != null
          ? Math.max(
              RMS_LIMITER_THRESHOLD_MIN_VRMS,
              Math.min(maxVrms, thresholdVrms),
            )
          : Math.max(RMS_LIMITER_THRESHOLD_MIN_VRMS, thresholdVrms);
      await send(mac, "rmsLimiterOut", channel, config.enabled, {
        attackMs: config.attackMs,
        releaseMultiplier: config.releaseMultiplier,
        thresholdVrms: clamped,
      });
    },
    [send, getRatedRmsV],
  );

  const peakLimiterOut = useCallback(
    async (
      mac: string,
      channel: Channel,
      enabled: boolean,
      params?: PeakLimiterParams,
    ) => {
      await send(mac, "peakLimiterOut", channel, enabled, params);
    },
    [send],
  );

  const setPeakLimiterHold = useCallback(
    async (
      mac: string,
      channel: Channel,
      holdMs: number,
      config: PeakLimiterParams & { enabled: boolean },
    ) => {
      const clamped = Math.max(0, Math.min(PEAK_LIMITER_HOLD_MAX_MS, holdMs));
      await send(mac, "peakLimiterOut", channel, config.enabled, {
        holdMs: clamped,
        releaseMs: config.releaseMs,
        thresholdVp: config.thresholdVp,
      });
    },
    [send],
  );

  const setPeakLimiterRelease = useCallback(
    async (
      mac: string,
      channel: Channel,
      releaseMs: number,
      config: PeakLimiterParams & { enabled: boolean },
    ) => {
      const clamped = Math.max(
        0,
        Math.min(PEAK_LIMITER_RELEASE_MAX_MS, releaseMs),
      );
      await send(mac, "peakLimiterOut", channel, config.enabled, {
        holdMs: config.holdMs,
        releaseMs: clamped,
        thresholdVp: config.thresholdVp,
      });
    },
    [send],
  );

  const setPeakLimiterThreshold = useCallback(
    async (
      mac: string,
      channel: Channel,
      thresholdVp: number,
      config: PeakLimiterParams & { enabled: boolean },
    ) => {
      const maxVp = rmsToPeakVoltage(getRatedRmsV(mac));
      const clamped =
        maxVp != null
          ? Math.max(
              PEAK_LIMITER_THRESHOLD_MIN_VP,
              Math.min(maxVp, thresholdVp),
            )
          : Math.max(PEAK_LIMITER_THRESHOLD_MIN_VP, thresholdVp);
      await send(mac, "peakLimiterOut", channel, config.enabled, {
        holdMs: config.holdMs,
        releaseMs: config.releaseMs,
        thresholdVp: clamped,
      });
    },
    [send, getRatedRmsV],
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

  const setPowerModeOut = useCallback(
    async (mac: string, channel: Channel, mode: number) => {
      const normalized = Number.isInteger(mode) ? mode : 0;
      const clamped = Math.max(0, Math.min(2, normalized));
      await send(mac, "powerModeOut", channel, clamped);
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

  const setEqBandType = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      band: number,
      type: number,
      bypass: boolean,
    ) => {
      await send(mac, "eqBandType", channel, type, { target, band, bypass });
    },
    [send],
  );

  const setEqBandFreq = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      band: number,
      hz: number,
    ) => {
      const clamped = Math.max(
        CROSSOVER_FREQ_MIN_HZ,
        Math.min(CROSSOVER_FREQ_MAX_HZ, hz),
      );
      await send(mac, "eqBandFreq", channel, clamped, { target, band });
    },
    [send],
  );

  const setEqBandGain = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      band: number,
      db: number,
    ) => {
      const clamped = Math.max(
        EQ_BAND_GAIN_MIN_DB,
        Math.min(EQ_BAND_GAIN_MAX_DB, db),
      );
      await send(mac, "eqBandGain", channel, clamped, { target, band });
    },
    [send],
  );

  const setEqBandQ = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      band: number,
      q: number,
    ) => {
      const clamped = Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, q));
      await send(mac, "eqBandQ", channel, clamped, { target, band });
    },
    [send],
  );

  return {
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    rmsLimiterOut,
    peakLimiterOut,
    setRmsLimiterAttack,
    setRmsLimiterReleaseMultiplier,
    setRmsLimiterThreshold,
    setPeakLimiterHold,
    setPeakLimiterRelease,
    setPeakLimiterThreshold,
    setMatrixGain,
    setMatrixActive,
    setDelayIn,
    setDelayOut,
    setPowerModeOut,
    setCrossoverEnabled,
    setCrossoverFreq,
    setEqBandType,
    setEqBandFreq,
    setEqBandGain,
    setEqBandQ,
  };
}
