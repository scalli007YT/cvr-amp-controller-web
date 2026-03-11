"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAmpStore } from "@/stores/AmpStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = 0 | 1 | 2 | 3;

interface AmpActionsHook {
  /**
   * Mute or unmute an input channel.
   * Optimistically updates the store immediately, then sends the UDP command.
   * Reverts and toasts on error.
   */
  muteIn: (mac: string, channel: Channel, muted: boolean) => Promise<void>;

  /**
   * Mute or unmute an output channel.
   * Optimistically updates the store immediately, then sends the UDP command.
   * Reverts and toasts on error.
   */
  muteOut: (mac: string, channel: Channel, muted: boolean) => Promise<void>;

  /**
   * Invert or restore output polarity.
   * Optimistically updates the store immediately, then sends the UDP command.
   * Reverts and toasts on error.
   */
  invertPolarityOut: (
    mac: string,
    channel: Channel,
    inverted: boolean,
  ) => Promise<void>;

  /**
   * Enable or disable the output noise gate.
   * Optimistically updates the store immediately, then sends the UDP command.
   * Reverts and toasts on error.
   */
  noiseGateOut: (
    mac: string,
    channel: Channel,
    enabled: boolean,
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
      action: "muteIn" | "muteOut" | "invertPolarityOut" | "noiseGateOut",
      channel: Channel,
      value: boolean,
      revert: () => void,
    ) => {
      try {
        const res = await fetch("/api/amp-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac, action, channel, value }),
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

  return { muteIn, muteOut, invertPolarityOut, noiseGateOut };
}
