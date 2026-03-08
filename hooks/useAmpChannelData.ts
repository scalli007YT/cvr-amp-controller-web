"use client";

import { useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import { parseFC27Channels } from "@/lib/parse-fc27";

/**
 * useAmpChannelData — Polls channel data for all reachable amps
 *
 * Every 250ms, fetches the latest channel data from all reachable amps,
 * parses the FC=27 response into 4 channel configurations, and stores in AmpStore.
 * This is separate from the heartbeat poller.
 */
export function useAmpChannelData(): void {
  useEffect(() => {
    console.log("[useAmpChannelData] Starting polling (every 250ms)");

    const channelDataTimer = setInterval(() => {
      const amps = useAmpStore.getState().amps;
      const reachableAmps = amps.filter((amp) => amp.reachable);

      if (reachableAmps.length > 0) {
        console.log(
          `[useAmpChannelData] Polling ${reachableAmps.length} reachable amp(s)`,
        );
      }

      reachableAmps.forEach((amp) => {
        fetch(`/api/amp-channel-data?mac=${encodeURIComponent(amp.mac)}`)
          .then((r) => r.json())
          .then((response) => {
            if (response.success && response.hex) {
              console.log(
                `[useAmpChannelData] Got data for ${amp.mac}, parsing...`,
              );
              const {
                updateChannelData,
                updateParsedChannels,
                syncChannelParams,
              } = useAmpStore.getState();
              updateChannelData(amp.mac, response.hex);

              // Parse the raw hex into 4 channel configurations
              const channels = parseFC27Channels(response.hex);
              updateParsedChannels(amp.mac, channels);

              // Also sync into the structured ChannelParams for easy access
              syncChannelParams(amp.mac, channels);
              console.log(
                `[useAmpChannelData] Updated ${amp.mac} with ${channels.length} channels`,
              );
            }
          })
          .catch((err) => {
            console.error(
              `[useAmpChannelData] Error fetching data for ${amp.mac}:`,
              err,
            );
          });
      });
    }, 250);

    return () => {
      console.log("[useAmpChannelData] Cleaning up polling");
      clearInterval(channelDataTimer);
    };
  }, []);
}
