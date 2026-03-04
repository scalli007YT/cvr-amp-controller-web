import { create } from "zustand";

interface PollingStore {
  isPolling: boolean;
  lastUpdated: Record<string, number>; // mac -> timestamp
  errors: Record<string, string>; // mac -> error message
  pollingInterval: number; // milliseconds between amps (default 100ms)
  updateInterval: number; // milliseconds between full polling cycles (default 5000ms)
  shouldInterrupt: boolean; // Flag to trigger immediate poll
  setIsPolling: (isPolling: boolean) => void;
  setLastUpdated: (mac: string, timestamp: number) => void;
  setError: (mac: string, error: string | null) => void;
  clearErrors: () => void;
  setPollingInterval: (interval: number) => void;
  setUpdateInterval: (interval: number) => void;
  triggerInterrupt: () => void;
  clearInterrupt: () => void;
}

export const usePollingStore = create<PollingStore>((set) => ({
  isPolling: false,
  lastUpdated: {},
  errors: {},
  pollingInterval: 100,
  updateInterval: 5000,
  shouldInterrupt: false,

  setIsPolling: (isPolling) => set({ isPolling }),

  setLastUpdated: (mac, timestamp) =>
    set((state) => ({
      lastUpdated: { ...state.lastUpdated, [mac]: timestamp },
    })),

  setError: (mac, error) =>
    set((state) => ({
      errors: error
        ? { ...state.errors, [mac]: error }
        : (() => {
            const { [mac]: _, ...rest } = state.errors;
            return rest;
          })(),
    })),

  clearErrors: () => set({ errors: {} }),

  setPollingInterval: (interval) => set({ pollingInterval: interval }),

  setUpdateInterval: (interval) => set({ updateInterval: interval }),

  triggerInterrupt: () => set({ shouldInterrupt: true }),

  clearInterrupt: () => set({ shouldInterrupt: false }),
}));
