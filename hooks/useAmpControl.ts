import { useState } from "react";
import { toast } from "sonner";

interface LoadingState {
  [key: string]: boolean; // key format: "mac:channel:action" e.g., "AA:BB:CC:DD:EE:FF:A:mute"
}

export function useAmpControl() {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});

  const setChannelMute = async (
    macAddress: string,
    channel: string,
    muted: boolean,
  ) => {
    const stateKey = `${macAddress}:${channel}:${muted ? "mute" : "unmute"}`;
    setLoadingStates((prev) => ({
      ...prev,
      [stateKey]: true,
    }));

    try {
      const response = await fetch("/api/amp-control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          macAddress,
          channel,
          muted,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to control amp");
      }

      toast.success(data.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Control failed: ${message}`);
    } finally {
      setLoadingStates((prev) => ({
        ...prev,
        [stateKey]: false,
      }));
    }
  };

  const isLoading = (
    macAddress: string,
    channel: string,
    muted: boolean,
  ): boolean => {
    const stateKey = `${macAddress}:${channel}:${muted ? "mute" : "unmute"}`;
    return loadingStates[stateKey] || false;
  };

  return { setChannelMute, isLoading };
}
