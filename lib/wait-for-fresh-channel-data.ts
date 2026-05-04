import { useAmpStore } from "@/stores/AmpStore";

/**
 * Wait for the channel-data poller to deliver fresh params for a given amp.
 * Subscribes to the AmpStore and resolves when channelParams reference changes
 * (indicating a new poll result), or when the timeout elapses (returns whatever
 * is available at that point — may still be stale).
 *
 * Best-effort utility: callers should not rely on this for correctness-critical flows.
 */
export function waitForFreshChannelData(
  mac: string,
  timeoutMs = 600
): Promise<ReturnType<typeof useAmpStore.getState>["amps"][number]["channelParams"] | null> {
  return new Promise((resolve) => {
    const before = useAmpStore.getState().amps.find((a) => a.mac === mac)?.channelParams;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsub();
        resolve(useAmpStore.getState().amps.find((a) => a.mac === mac)?.channelParams ?? null);
      }
    }, timeoutMs);

    const unsub = useAmpStore.subscribe((state) => {
      if (settled) return;
      const current = state.amps.find((a) => a.mac === mac)?.channelParams;
      if (current && current !== before) {
        settled = true;
        clearTimeout(timer);
        unsub();
        resolve(current);
      }
    });
  });
}
