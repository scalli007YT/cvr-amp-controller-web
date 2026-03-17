"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { ampActionRequestSchema } from "@/lib/validation/amp-actions";
import {
  MATRIX_GAIN_MAX_DB,
  MATRIX_GAIN_MIN_DB,
  OUTPUT_VOLUME_MAX_DB,
  OUTPUT_VOLUME_MIN_DB,
  OUTPUT_TRIM_MAX_DB,
  OUTPUT_TRIM_MIN_DB,
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
  PEAK_LIMITER_RELEASE_MAX_MS
} from "@/lib/constants";
import { getLinkedChannels, type LinkScope } from "@/lib/amp-action-linking";
import { useAmpStore } from "@/stores/AmpStore";
import { rmsToPeakVoltage } from "@/lib/generic";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = number;
type BridgePair = number;
type SourceType = 0 | 1 | 2;
type SourceFamily = 0 | 1 | 2;
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
  setBridgePair: (mac: string, pair: BridgePair, bridged: boolean) => Promise<void>;
  muteIn: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  setVolumeOut: (mac: string, channel: Channel, db: number) => Promise<void>;
  muteOut: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  setDelayIn: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setDelayOut: (mac: string, channel: Channel, ms: number) => Promise<void>;
  setTrimOut: (mac: string, channel: Channel, db: number) => Promise<void>;
  setPowerModeOut: (mac: string, channel: Channel, mode: number) => Promise<void>;
  setCrossoverEnabled: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    enabled: boolean,
    filterType: number
  ) => Promise<void>;
  setCrossoverFreq: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    kind: CrossoverKind,
    hz: number
  ) => Promise<void>;
  setEqBandType: (
    mac: string,
    channel: Channel,
    target: CrossoverTarget,
    band: number,
    type: number,
    bypass: boolean
  ) => Promise<void>;
  setEqBandFreq: (mac: string, channel: Channel, target: CrossoverTarget, band: number, hz: number) => Promise<void>;
  setEqBandGain: (mac: string, channel: Channel, target: CrossoverTarget, band: number, db: number) => Promise<void>;
  setEqBandQ: (mac: string, channel: Channel, target: CrossoverTarget, band: number, q: number) => Promise<void>;
  invertPolarityOut: (mac: string, channel: Channel, inverted: boolean) => Promise<void>;
  noiseGateOut: (mac: string, channel: Channel, enabled: boolean) => Promise<void>;
  rmsLimiterOut: (mac: string, channel: Channel, enabled: boolean, params?: RmsLimiterParams) => Promise<void>;
  setRmsLimiterAttack: (
    mac: string,
    channel: Channel,
    attackMs: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setRmsLimiterReleaseMultiplier: (
    mac: string,
    channel: Channel,
    releaseMultiplier: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setRmsLimiterThreshold: (
    mac: string,
    channel: Channel,
    thresholdVrms: number,
    config: RmsLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  peakLimiterOut: (mac: string, channel: Channel, enabled: boolean, params?: PeakLimiterParams) => Promise<void>;
  setPeakLimiterHold: (
    mac: string,
    channel: Channel,
    holdMs: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setPeakLimiterRelease: (
    mac: string,
    channel: Channel,
    releaseMs: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  setPeakLimiterThreshold: (
    mac: string,
    channel: Channel,
    thresholdVp: number,
    config: PeakLimiterParams & { enabled: boolean }
  ) => Promise<void>;
  /** Set crosspoint gain (dB) for a matrix cell. */
  setMatrixGain: (mac: string, channel: Channel, source: Channel, gainDb: number) => Promise<void>;
  /** Toggle a matrix crosspoint on/off. */
  setMatrixActive: (mac: string, channel: Channel, source: Channel, active: boolean) => Promise<void>;
  setSourceType: (mac: string, channel: Channel, sourceType: SourceType) => Promise<void>;
  setSourceDelay: (
    mac: string,
    channel: Channel,
    source: SourceFamily,
    delayMs: number,
    trimDb: number
  ) => Promise<void>;
  setSourceTrim: (
    mac: string,
    channel: Channel,
    source: SourceFamily,
    trimDb: number,
    delayMs: number
  ) => Promise<void>;
  setAnalogType: (mac: string, channel: Channel, analogType: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAmpActions(): AmpActionsHook {
  const { amps } = useAmpStore();

  /** Returns the rated RMS voltage for a given mac, or undefined if unknown. */
  const getRatedRmsV = useCallback((mac: string) => amps.find((a) => a.mac === mac)?.ratedRmsV, [amps]);

  const getLinkedTargets = useCallback((mac: string, channel: Channel, scope: LinkScope) => {
    const config = getStoredAmpLinkConfig(useAmpActionLinkStore.getState().byMac, mac);
    return getLinkedChannels(config, scope, channel);
  }, []);

  /** Send a POST to /api/amp-actions. UI updates from polled amp state. */
  const send = useCallback(
    async (
      mac: string,
      action: string,
      channel: Channel,
      value: boolean | number,
      extra?: Record<string, unknown>,
      opts?: { suppressToast?: boolean; throwOnError?: boolean }
    ) => {
      try {
        const res = await fetch("/api/amp-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac, action, channel, value, ...extra })
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!opts?.suppressToast) {
          toast.error(`Command failed: ${msg}`);
        }
        if (opts?.throwOnError) {
          throw err instanceof Error ? err : new Error(msg);
        }
        return false;
      }
    },
    []
  );

  const runLinked = useCallback(
    async (mac: string, channel: Channel, scope: LinkScope, task: (targetChannel: Channel) => Promise<boolean>) => {
      const targets = getLinkedTargets(mac, channel, scope);
      const results = await Promise.allSettled(targets.map((targetChannel) => task(targetChannel)));
      const failedCount = results.filter((result) => result.status === "rejected" || result.value !== true).length;

      if (failedCount > 0) {
        const linkedCount = targets.length;
        const firstRejected = results.find((result) => result.status === "rejected");
        const reason =
          firstRejected?.status === "rejected"
            ? firstRejected.reason instanceof Error
              ? firstRejected.reason.message
              : String(firstRejected.reason)
            : null;
        const baseMessage =
          linkedCount > 1
            ? `Linked command partially failed (${linkedCount - failedCount}/${linkedCount})`
            : "Command failed";
        toast.error(reason ? `${baseMessage}: ${reason}` : baseMessage);
      }
    },
    [getLinkedTargets]
  );

  const sendLinked = useCallback(
    async (
      mac: string,
      action: string,
      channel: Channel,
      value: boolean | number,
      scope: LinkScope,
      extra?: Record<string, unknown>
    ) => {
      await runLinked(mac, channel, scope, (targetChannel) =>
        send(mac, action, targetChannel, value, extra, { suppressToast: true, throwOnError: true })
      );
    },
    [runLinked, send]
  );

  // ---------------------------------------------------------------------------
  // setBridgePair
  // ---------------------------------------------------------------------------
  const setBridgePair = useCallback(
    async (mac: string, pair: BridgePair, bridged: boolean) => {
      await send(mac, "bridgePair", pair, bridged);
    },
    [send]
  );

  // ---------------------------------------------------------------------------
  // muteIn
  // ---------------------------------------------------------------------------
  const muteIn = useCallback(
    async (mac: string, channel: Channel, muted: boolean) => {
      await sendLinked(mac, "muteIn", channel, muted, "muteIn");
    },
    [sendLinked]
  );

  // ---------------------------------------------------------------------------
  // setVolumeOut
  // ---------------------------------------------------------------------------
  const setVolumeOut = useCallback(
    async (mac: string, channel: Channel, db: number) => {
      const clamped = Math.max(OUTPUT_VOLUME_MIN_DB, Math.min(OUTPUT_VOLUME_MAX_DB, db));
      const payload = {
        mac,
        action: "volumeOut" as const,
        channel,
        value: clamped
      };
      const parsed = ampActionRequestSchema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid volumeOut payload";
        toast.error(message);
        throw new Error(message);
      }
      await sendLinked(mac, "volumeOut", channel, clamped, "volumeOut");
    },
    [sendLinked]
  );

  // ---------------------------------------------------------------------------
  // muteOut
  // ---------------------------------------------------------------------------
  const muteOut = useCallback(
    async (mac: string, channel: Channel, muted: boolean) => {
      await sendLinked(mac, "muteOut", channel, muted, "muteOut");
    },
    [sendLinked]
  );

  // ---------------------------------------------------------------------------
  // invertPolarityOut
  // ---------------------------------------------------------------------------
  const invertPolarityOut = useCallback(
    async (mac: string, channel: Channel, inverted: boolean) => {
      await sendLinked(mac, "invertPolarityOut", channel, inverted, "polarityOut");
    },
    [sendLinked]
  );

  // ---------------------------------------------------------------------------
  // noiseGateOut
  // ---------------------------------------------------------------------------
  const noiseGateOut = useCallback(
    async (mac: string, channel: Channel, enabled: boolean) => {
      await sendLinked(mac, "noiseGateOut", channel, enabled, "noiseGateOut");
    },
    [sendLinked]
  );

  const rmsLimiterOut = useCallback(
    async (mac: string, channel: Channel, enabled: boolean, params?: RmsLimiterParams) => {
      await sendLinked(mac, "rmsLimiterOut", channel, enabled, "limiters", params);
    },
    [sendLinked]
  );

  const setRmsLimiterAttack = useCallback(
    async (mac: string, channel: Channel, attackMs: number, config: RmsLimiterParams & { enabled: boolean }) => {
      const clampedAttack = Math.max(0, Math.min(RMS_LIMITER_ATTACK_MAX_MS, attackMs));
      await sendLinked(mac, "rmsLimiterOut", channel, config.enabled, "limiters", {
        attackMs: clampedAttack,
        releaseMultiplier: config.releaseMultiplier,
        thresholdVrms: config.thresholdVrms
      });
    },
    [sendLinked]
  );

  const setRmsLimiterReleaseMultiplier = useCallback(
    async (
      mac: string,
      channel: Channel,
      releaseMultiplier: number,
      config: RmsLimiterParams & { enabled: boolean }
    ) => {
      const clamped = Math.max(0, Math.min(RMS_LIMITER_RELEASE_MAX_MULTIPLIER, releaseMultiplier));
      await sendLinked(mac, "rmsLimiterOut", channel, config.enabled, "limiters", {
        attackMs: config.attackMs,
        releaseMultiplier: clamped,
        thresholdVrms: config.thresholdVrms
      });
    },
    [sendLinked]
  );

  const setRmsLimiterThreshold = useCallback(
    async (mac: string, channel: Channel, thresholdVrms: number, config: RmsLimiterParams & { enabled: boolean }) => {
      const maxVrms = getRatedRmsV(mac);
      const clamped =
        maxVrms != null
          ? Math.max(RMS_LIMITER_THRESHOLD_MIN_VRMS, Math.min(maxVrms, thresholdVrms))
          : Math.max(RMS_LIMITER_THRESHOLD_MIN_VRMS, thresholdVrms);
      await sendLinked(mac, "rmsLimiterOut", channel, config.enabled, "limiters", {
        attackMs: config.attackMs,
        releaseMultiplier: config.releaseMultiplier,
        thresholdVrms: clamped
      });
    },
    [sendLinked, getRatedRmsV]
  );

  const peakLimiterOut = useCallback(
    async (mac: string, channel: Channel, enabled: boolean, params?: PeakLimiterParams) => {
      await sendLinked(mac, "peakLimiterOut", channel, enabled, "limiters", params);
    },
    [sendLinked]
  );

  const setPeakLimiterHold = useCallback(
    async (mac: string, channel: Channel, holdMs: number, config: PeakLimiterParams & { enabled: boolean }) => {
      const clamped = Math.max(0, Math.min(PEAK_LIMITER_HOLD_MAX_MS, holdMs));
      await sendLinked(mac, "peakLimiterOut", channel, config.enabled, "limiters", {
        holdMs: clamped,
        releaseMs: config.releaseMs,
        thresholdVp: config.thresholdVp
      });
    },
    [sendLinked]
  );

  const setPeakLimiterRelease = useCallback(
    async (mac: string, channel: Channel, releaseMs: number, config: PeakLimiterParams & { enabled: boolean }) => {
      const clamped = Math.max(0, Math.min(PEAK_LIMITER_RELEASE_MAX_MS, releaseMs));
      await sendLinked(mac, "peakLimiterOut", channel, config.enabled, "limiters", {
        holdMs: config.holdMs,
        releaseMs: clamped,
        thresholdVp: config.thresholdVp
      });
    },
    [sendLinked]
  );

  const setPeakLimiterThreshold = useCallback(
    async (mac: string, channel: Channel, thresholdVp: number, config: PeakLimiterParams & { enabled: boolean }) => {
      const maxVp = rmsToPeakVoltage(getRatedRmsV(mac));
      const clamped =
        maxVp != null
          ? Math.max(PEAK_LIMITER_THRESHOLD_MIN_VP, Math.min(maxVp, thresholdVp))
          : Math.max(PEAK_LIMITER_THRESHOLD_MIN_VP, thresholdVp);
      await sendLinked(mac, "peakLimiterOut", channel, config.enabled, "limiters", {
        holdMs: config.holdMs,
        releaseMs: config.releaseMs,
        thresholdVp: clamped
      });
    },
    [sendLinked, getRatedRmsV]
  );

  const setMatrixGain = useCallback(
    async (mac: string, channel: Channel, source: Channel, gainDb: number) => {
      const clampedGainDb = Math.max(MATRIX_GAIN_MIN_DB, Math.min(MATRIX_GAIN_MAX_DB, gainDb));
      await send(mac, "matrixGain", channel, clampedGainDb, { source });
    },
    [send]
  );

  // ---------------------------------------------------------------------------
  // setMatrixActive
  // ---------------------------------------------------------------------------
  const setMatrixActive = useCallback(
    async (mac: string, channel: Channel, source: Channel, active: boolean) => {
      await send(mac, "matrixActive", channel, active, { source });
    },
    [send]
  );

  // ---------------------------------------------------------------------------
  // Source controls
  // ---------------------------------------------------------------------------
  const setSourceType = useCallback(
    async (mac: string, channel: Channel, sourceType: SourceType) => {
      await send(mac, "sourceType", channel, sourceType);
    },
    [send]
  );

  const setSourceDelay = useCallback(
    async (mac: string, channel: Channel, source: SourceFamily, delayMs: number, trimDb: number) => {
      const payload = {
        mac,
        action: "sourceDelay" as const,
        channel,
        value: delayMs,
        source,
        trim: trimDb
      };
      const parsed = ampActionRequestSchema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid sourceDelay payload";
        toast.error(message);
        throw new Error(message);
      }
      await send(mac, "sourceDelay", channel, delayMs, { source, trim: trimDb }, { throwOnError: true });
    },
    [send]
  );

  const setSourceTrim = useCallback(
    async (mac: string, channel: Channel, source: SourceFamily, trimDb: number, delayMs: number) => {
      const payload = {
        mac,
        action: "sourceTrim" as const,
        channel,
        value: trimDb,
        source,
        delay: delayMs
      };
      const parsed = ampActionRequestSchema.safeParse(payload);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid sourceTrim payload";
        toast.error(message);
        throw new Error(message);
      }
      await send(mac, "sourceTrim", channel, trimDb, { source, delay: delayMs }, { throwOnError: true });
    },
    [send]
  );

  const setAnalogType = useCallback(
    async (mac: string, channel: Channel, analogType: number) => {
      await send(mac, "analogType", channel, analogType);
    },
    [send]
  );

  // ---------------------------------------------------------------------------
  // setDelayIn
  // ---------------------------------------------------------------------------
  const setDelayIn = useCallback(
    async (mac: string, channel: Channel, ms: number) => {
      const clamped = Math.max(DELAY_MIN_MS, Math.min(DELAY_IN_MAX_MS, ms));
      await send(mac, "delayIn", channel, clamped);
    },
    [send]
  );

  // ---------------------------------------------------------------------------
  // setDelayOut
  // ---------------------------------------------------------------------------
  const setDelayOut = useCallback(
    async (mac: string, channel: Channel, ms: number) => {
      const clamped = Math.max(DELAY_MIN_MS, Math.min(DELAY_OUT_MAX_MS, ms));
      await sendLinked(mac, "delayOut", channel, clamped, "delayOut");
    },
    [sendLinked]
  );

  const setTrimOut = useCallback(
    async (mac: string, channel: Channel, db: number) => {
      const clamped = Math.max(OUTPUT_TRIM_MIN_DB, Math.min(OUTPUT_TRIM_MAX_DB, db));
      await sendLinked(mac, "outputTrim", channel, clamped, "trimOut");
    },
    [sendLinked]
  );

  const setPowerModeOut = useCallback(
    async (mac: string, channel: Channel, mode: number) => {
      const normalized = Number.isInteger(mode) ? mode : 0;
      const clamped = Math.max(0, Math.min(2, normalized));
      await send(mac, "powerModeOut", channel, clamped);
    },
    [send]
  );

  const setCrossoverEnabled = useCallback(
    async (
      mac: string,
      channel: Channel,
      target: CrossoverTarget,
      kind: CrossoverKind,
      enabled: boolean,
      filterType: number
    ) => {
      await sendLinked(mac, "crossoverEnabled", channel, enabled, target === "input" ? "inputEq" : "outputEq", {
        target,
        kind,
        filterType
      });
    },
    [sendLinked]
  );

  const setCrossoverFreq = useCallback(
    async (mac: string, channel: Channel, target: CrossoverTarget, kind: CrossoverKind, hz: number) => {
      const clamped = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, hz));
      await sendLinked(mac, "crossoverFreq", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
        target,
        kind
      });
    },
    [sendLinked]
  );

  const setEqBandType = useCallback(
    async (mac: string, channel: Channel, target: CrossoverTarget, band: number, type: number, bypass: boolean) => {
      await sendLinked(mac, "eqBandType", channel, type, target === "input" ? "inputEq" : "outputEq", {
        target,
        band,
        bypass
      });
    },
    [sendLinked]
  );

  const setEqBandFreq = useCallback(
    async (mac: string, channel: Channel, target: CrossoverTarget, band: number, hz: number) => {
      const clamped = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, hz));
      await sendLinked(mac, "eqBandFreq", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
        target,
        band
      });
    },
    [sendLinked]
  );

  const setEqBandGain = useCallback(
    async (mac: string, channel: Channel, target: CrossoverTarget, band: number, db: number) => {
      const clamped = Math.max(EQ_BAND_GAIN_MIN_DB, Math.min(EQ_BAND_GAIN_MAX_DB, db));
      await sendLinked(mac, "eqBandGain", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
        target,
        band
      });
    },
    [sendLinked]
  );

  const setEqBandQ = useCallback(
    async (mac: string, channel: Channel, target: CrossoverTarget, band: number, q: number) => {
      const clamped = Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, q));
      await sendLinked(mac, "eqBandQ", channel, clamped, target === "input" ? "inputEq" : "outputEq", {
        target,
        band
      });
    },
    [sendLinked]
  );

  return {
    setBridgePair,
    muteIn,
    setVolumeOut,
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
    setSourceType,
    setSourceDelay,
    setSourceTrim,
    setAnalogType,
    setDelayIn,
    setDelayOut,
    setTrimOut,
    setPowerModeOut,
    setCrossoverEnabled,
    setCrossoverFreq,
    setEqBandType,
    setEqBandFreq,
    setEqBandGain,
    setEqBandQ
  };
}
