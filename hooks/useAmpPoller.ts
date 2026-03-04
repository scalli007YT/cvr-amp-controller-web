"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { pollAllAmpsOnce } from "@/lib/amp-polling-controller";
import { usePollingStore } from "@/stores/PollingStore";
import { useAmpStore } from "@/stores/AmpStore";

interface UseAmpPollerReturn {
  isPolling: boolean;
  lastUpdated: Record<string, number>;
  errors: Record<string, string>;
}

/**
 * React hook for polling amps from AmpStore
 * - Starts polling automatically on mount
 * - Stops and cleans up on unmount
 * - Calls server action to fetch device info
 * - Updates AmpStore with results
 * - Returns current polling state
 *
 * Usage:
 * const { isPolling, lastUpdated, errors } = useAmpPoller();
 */
export function useAmpPoller(): UseAmpPollerReturn {
  const pollingStore = usePollingStore();
  const ampStore = useAmpStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const interruptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Don't start polling if no amps
    if (!ampStore.amps || ampStore.amps.length === 0) {
      pollingStore.setIsPolling(false);
      return;
    }

    // Start polling
    pollingStore.setIsPolling(true);

    const pollFunction = async () => {
      try {
        // Call server action to poll amps
        const { succeeded, failed } = await pollAllAmpsOnce(ampStore.amps);

        let reachabilityChanged = false;

        // Update AmpStore with succeeded results only if values changed
        succeeded.forEach((amp) => {
          const existing = ampStore.amps.find((a) => a.mac === amp.mac);

          // Check if reachability changed
          const wasUnreachable = existing?.reachable === false;
          const isNowReachable = amp.reachable === true;

          if (
            !existing ||
            existing.name !== amp.name ||
            existing.version !== amp.version ||
            existing.id !== amp.id ||
            existing.run_time !== amp.run_time ||
            existing.reachable !== amp.reachable
          ) {
            ampStore.updateAmp(amp.mac, {
              name: amp.name,
              version: amp.version,
              id: amp.id,
              run_time: amp.run_time,
              reachable: true,
            });
            pollingStore.setLastUpdated(amp.mac, Date.now());

            // Notify if reachability changed
            if (wasUnreachable && isNowReachable) {
              toast.success(`${amp.name || amp.mac} is now reachable`);
              reachabilityChanged = true;
            }
          }
          pollingStore.setError(amp.mac, null);
        });

        // Mark failed amps as unreachable only if not already marked
        failed.forEach((mac) => {
          const existing = ampStore.amps.find((a) => a.mac === mac);
          if (existing && existing.reachable !== false) {
            ampStore.updateAmp(mac, { reachable: false });

            // Notify that amp became unreachable
            toast.error(`${existing.name || mac} is now unreachable`);
            reachabilityChanged = true;
          }
          pollingStore.setError(mac, "Failed to poll");
        });

        // Trigger interrupt if reachability changed (quick re-poll in 50ms)
        if (reachabilityChanged) {
          pollingStore.triggerInterrupt();
          if (interruptTimeoutRef.current) {
            clearTimeout(interruptTimeoutRef.current);
          }
          interruptTimeoutRef.current = setTimeout(() => {
            pollFunction();
            pollingStore.clearInterrupt();
          }, 50);
        }
      } catch (error) {
        // Silent fail - don't log errors to console
        ampStore.amps.forEach((amp) => {
          pollingStore.setError(amp.mac, "Polling failed");
        });
      }
    };

    // Run first poll immediately
    void pollFunction();

    // Then set up interval for subsequent polls
    intervalRef.current = setInterval(
      pollFunction,
      pollingStore.updateInterval,
    );

    // Cleanup on unmount or when deps change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (interruptTimeoutRef.current) {
        clearTimeout(interruptTimeoutRef.current);
        interruptTimeoutRef.current = null;
      }
      pollingStore.setIsPolling(false);
    };
  }, [ampStore.amps, pollingStore.updateInterval]);

  return {
    isPolling: pollingStore.isPolling,
    lastUpdated: pollingStore.lastUpdated,
    errors: pollingStore.errors,
  };
}
