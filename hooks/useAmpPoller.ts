"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePollingStore } from "@/stores/PollingStore";
import { useAmpStore } from "@/stores/AmpStore";
import type { HeartbeatData } from "@/stores/AmpStore";
import type { AmpBasicInfo } from "@/stores/AmpStore";
import type { BridgeReadback } from "@/stores/AmpStore";
import { smoothHeartbeat, resetSmootherForMac } from "@/lib/heartbeat-smoother";
import { ratedRmsVFromDeviceName } from "@/lib/amp-model";
import { deriveSourceCapabilities } from "@/lib/source-capabilities";

// ---------------------------------------------------------------------------
// SSE event shapes (mirroring what /api/amp-events sends)
// ---------------------------------------------------------------------------
interface DiscoverySseEvent {
  type: "discovery";
  ip: string;
  mac: string;
  name: string;
  version: string;
  basicInfo: AmpBasicInfo;
}

interface HeartbeatSseEvent {
  type: "heartbeat";
  ip: string;
  mac: string;
  name: string;
  version: string;
  heartbeat: HeartbeatData;
  bridgePairs?: BridgeReadback[];
}

interface OfflineSseEvent {
  type: "offline";
  mac: string;
}

interface PingEvent {
  type: "ping";
}

type AmpSseEvent = DiscoverySseEvent | HeartbeatSseEvent | OfflineSseEvent | PingEvent;

// ---------------------------------------------------------------------------

interface UseAmpPollerReturn {
  isPolling: boolean;
  lastUpdated: Record<string, number>;
  errors: Record<string, string>;
}

/** Find an amp by MAC (case-insensitive). */
function findAmp(amps: ReturnType<typeof useAmpStore.getState>["amps"], mac: string) {
  return amps.find((a) => a.mac.toUpperCase() === mac.toUpperCase());
}

/** Fetch & store run-time minutes for an amp — non-critical, silent on failure. */
function fetchRuntime(mac: string): void {
  fetch(`/api/amp-runtime/${encodeURIComponent(mac)}`)
    .then((r) => r.json())
    .then((data: { success: boolean; minutes: number }) => {
      if (data.success && typeof data.minutes === "number") {
        useAmpStore.getState().updateAmpStatus(mac, { run_time: data.minutes });
      }
    })
    .catch(() => {
      /* non-critical */
    });
}

/**
 * useAmpPoller — SSE-based poller
 *
 * Connects to /api/amp-events (Server-Sent Events).
 * The server side owns:
 *   • A persistent UDP socket (Receive_Thread equivalent, always listening)
 *   • 140 ms FC=6 HEARTBEAT broadcast loop  (queryT_V_A equivalent)
 *   • 4 000 ms FC=0 BASIC_INFO broadcast timer (refrash equivalent)
 *
 * This hook subscribes to the event stream and writes into the stores.
 */
export function useAmpPoller(): UseAmpPollerReturn {
  const pollingStore = usePollingStore();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref so event callbacks always see the latest amps without
  // being a useEffect dependency.
  const ampsRef = useRef(useAmpStore.getState().amps);
  useEffect(() => {
    const unsub = useAmpStore.subscribe((state) => {
      ampsRef.current = state.amps;
    });
    return unsub;
  }, []);

  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;

      const es = new EventSource("/api/amp-events");
      esRef.current = es;

      es.onopen = () => {
        usePollingStore.getState().setIsPolling(true);
        usePollingStore.getState().clearErrors();
      };

      es.onmessage = (raw) => {
        if (!active) return;
        let event: AmpSseEvent;
        try {
          event = JSON.parse(raw.data as string) as AmpSseEvent;
        } catch {
          return;
        }

        switch (event.type) {
          // ----------------------------------------------------------------
          // discovery — device replied to FC=0 broadcast
          // ----------------------------------------------------------------
          case "discovery": {
            const { ip, mac, name, version, basicInfo } = event;
            const amp = findAmp(ampsRef.current, mac);
            if (!amp) return;

            const wasUnreachable = amp.reachable === false;
            // Derive rated RMS voltage from version string (e.g. "42404B06-006118-DSP-2004")
            // which always contains the model — more reliable than the name field.
            const ratedRmsV = ratedRmsVFromDeviceName(version ?? name ?? "");
            const sourceCapabilities = deriveSourceCapabilities({
              machineName: version ?? name,
              analogInputCount: basicInfo.Analog_signal_Input_chx,
              digitalInputCount: basicInfo.Digital_signal_input_chx,
              outputCount: basicInfo.Output_chx
            });
            useAmpStore.getState().updateAmpStatus(amp.mac, {
              ip,
              name,
              version,
              reachable: true,
              ratedRmsV,
              sourceCapabilities,
              basic_info: basicInfo,
              analog_signal_input_chx: basicInfo.Analog_signal_Input_chx,
              output_chx: basicInfo.Output_chx,
              machine_state: basicInfo.Machine_state,
              gain_max: basicInfo.Gain_max
            });
            usePollingStore.getState().setLastUpdated(amp.mac, Date.now());
            usePollingStore.getState().setError(amp.mac, null);

            if (wasUnreachable) {
              resetSmootherForMac(amp.mac);
              toast.success(`${name || mac} is now reachable`);
              fetchRuntime(amp.mac);
            }
            break;
          }

          // ----------------------------------------------------------------
          // heartbeat — device replied to FC=6 broadcast (live sensor data)
          // ----------------------------------------------------------------
          case "heartbeat": {
            const { mac, name, version, heartbeat, bridgePairs } = event;
            const amp = findAmp(ampsRef.current, mac);
            if (!amp) return;

            // Use name/version from the event itself — always fresh from the server's
            // knownMacs table, never stale due to client-side store race on startup.
            const deviceName = name || version || (amp.name ?? amp.lastKnownName ?? amp.version ?? "");
            // Keep the meter reference stable: prefer the already-resolved rated RMS
            // voltage from store, and only derive from device strings as fallback.
            const derivedRatedRmsV = ratedRmsVFromDeviceName(deviceName);
            const meterRatedRmsV = amp.ratedRmsV ?? derivedRatedRmsV;
            const maxDb = 20 * Math.log10(meterRatedRmsV);

            // Store the rated RMS voltage once (avoids store churn on every heartbeat).
            // Also retries if a 0 was stored previously due to a name/version race on startup.
            if (!amp.ratedRmsV) {
              useAmpStore.getState().updateAmpStatus(amp.mac, {
                ratedRmsV: derivedRatedRmsV
              });
            }

            useAmpStore.getState().updateHeartbeat(amp.mac, smoothHeartbeat(amp.mac, heartbeat, maxDb), bridgePairs);
            usePollingStore.getState().setLastUpdated(amp.mac, Date.now());
            break;
          }

          // ----------------------------------------------------------------
          // offline — device stopped responding to discovery broadcasts
          // ----------------------------------------------------------------
          case "offline": {
            const { mac } = event;
            const amp = findAmp(ampsRef.current, mac);
            if (!amp || amp.reachable === false) return;

            useAmpStore.getState().updateAmpStatus(amp.mac, { reachable: false });
            usePollingStore.getState().setError(amp.mac, "Offline");
            toast.error(`${amp.name ?? amp.lastKnownName ?? mac} is now unreachable`);
            break;
          }

          case "ping":
          default:
            break;
        }
      };

      es.onerror = () => {
        if (!active) return;
        usePollingStore.getState().setIsPolling(false);
        es.close();
        esRef.current = null;

        // Reconnect after 2 s
        reconnectTimerRef.current = setTimeout(() => {
          if (active) connect();
        }, 2_000);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      usePollingStore.getState().setIsPolling(false);
    };
  }, []); // Run once — the SSE connection is long-lived

  return {
    isPolling: pollingStore.isPolling,
    lastUpdated: pollingStore.lastUpdated,
    errors: pollingStore.errors
  };
}
