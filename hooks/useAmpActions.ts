"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAmpStore } from "@/stores/AmpStore";
import { MATRIX_GAIN_MAX_DB, MATRIX_GAIN_MIN_DB } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = 0 | 1 | 2 | 3;

interface AmpActionsHook {
  muteIn: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
  muteOut: (mac: string, channel: Channel, muted: boolean) => Promise<void>;
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
  const { syncChannelParams, amps } = useAmpStore();

  /** Send a POST to /api/amp-actions and revert store + toast on failure. */
  const send = useCallback(
    async (
      mac: string,
      action: string,
      channel: Channel,
      value: boolean | number,
      revert: () => void,
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
        // Revert optimistic update
        revert();
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Command failed: ${msg}`);
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Helpers — snapshot and patch channelParams in-place
  // ---------------------------------------------------------------------------

  const patchChannelParams = useCallback(
    (
      mac: string,
      channel: Channel,
      patch: Partial<{
        muteIn: boolean;
        muteOut: boolean;
        invertedOut: boolean;
        noiseGateOut: boolean;
      }>,
    ) => {
      const amp = amps.find((a) => a.mac.toUpperCase() === mac.toUpperCase());
      if (!amp?.channelParams) return;

      const patched = amp.channelParams.channels.map((ch, i) => {
        if (i !== channel) return ch;
        return { ...ch, ...patch };
      });

      syncChannelParams(mac, patched);
    },
    [amps, syncChannelParams],
  );

  // ---------------------------------------------------------------------------
  // muteIn
  // ---------------------------------------------------------------------------
  const muteIn = useCallback(
    async (mac: string, channel: Channel, muted: boolean) => {
      // Optimistic update
      patchChannelParams(mac, channel, { muteIn: muted });

      await send(mac, "muteIn", channel, muted, () => {
        // Revert
        patchChannelParams(mac, channel, { muteIn: !muted });
      });
    },
    [patchChannelParams, send],
  );

  // ---------------------------------------------------------------------------
  // muteOut
  // ---------------------------------------------------------------------------
  const muteOut = useCallback(
    async (mac: string, channel: Channel, muted: boolean) => {
      // Optimistic update
      patchChannelParams(mac, channel, { muteOut: muted });

      await send(mac, "muteOut", channel, muted, () => {
        // Revert
        patchChannelParams(mac, channel, { muteOut: !muted });
      });
    },
    [patchChannelParams, send],
  );

  // ---------------------------------------------------------------------------
  // invertPolarityOut
  // ---------------------------------------------------------------------------
  const invertPolarityOut = useCallback(
    async (mac: string, channel: Channel, inverted: boolean) => {
      patchChannelParams(mac, channel, { invertedOut: inverted });

      await send(mac, "invertPolarityOut", channel, inverted, () => {
        patchChannelParams(mac, channel, { invertedOut: !inverted });
      });
    },
    [patchChannelParams, send],
  );

  // ---------------------------------------------------------------------------
  // noiseGateOut
  // ---------------------------------------------------------------------------
  const noiseGateOut = useCallback(
    async (mac: string, channel: Channel, enabled: boolean) => {
      patchChannelParams(mac, channel, { noiseGateOut: enabled });

      await send(mac, "noiseGateOut", channel, enabled, () => {
        patchChannelParams(mac, channel, { noiseGateOut: !enabled });
      });
    },
    [patchChannelParams, send],
  );

  // ---------------------------------------------------------------------------
  // setMatrixGain
  // ---------------------------------------------------------------------------
  const patchMatrix = useCallback(
    (
      mac: string,
      channel: Channel,
      source: Channel,
      patch: Partial<{ gain: number; active: boolean }>,
    ) => {
      const amp = amps.find((a) => a.mac.toUpperCase() === mac.toUpperCase());
      if (!amp?.channelParams) return;

      const patched = amp.channelParams.channels.map((ch, i) => {
        if (i !== channel) return ch;
        return {
          ...ch,
          matrix: ch.matrix.map((cell) =>
            cell.source === source ? { ...cell, ...patch } : cell,
          ),
        };
      });

      syncChannelParams(mac, patched);
    },
    [amps, syncChannelParams],
  );

  const setMatrixGain = useCallback(
    async (mac: string, channel: Channel, source: Channel, gainDb: number) => {
      const clampedGainDb = Math.max(
        MATRIX_GAIN_MIN_DB,
        Math.min(MATRIX_GAIN_MAX_DB, gainDb),
      );
      const amp = amps.find((a) => a.mac.toUpperCase() === mac.toUpperCase());
      const oldGain =
        amp?.channelParams?.channels[channel]?.matrix[source]?.gain ?? 0;

      patchMatrix(mac, channel, source, { gain: clampedGainDb });

      await send(
        mac,
        "matrixGain",
        channel,
        clampedGainDb,
        () => {
          patchMatrix(mac, channel, source, { gain: oldGain });
        },
        { source },
      );
    },
    [amps, patchMatrix, send],
  );

  // ---------------------------------------------------------------------------
  // setMatrixActive
  // ---------------------------------------------------------------------------
  const setMatrixActive = useCallback(
    async (mac: string, channel: Channel, source: Channel, active: boolean) => {
      patchMatrix(mac, channel, source, { active });

      await send(
        mac,
        "matrixActive",
        channel,
        active,
        () => {
          patchMatrix(mac, channel, source, { active: !active });
        },
        { source },
      );
    },
    [patchMatrix, send],
  );

  return {
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    setMatrixGain,
    setMatrixActive,
  };
}
