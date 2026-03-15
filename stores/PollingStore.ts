import { create } from "zustand";

interface PollingStore {
  isPolling: boolean;
  lastUpdated: Record<string, number>; // mac -> timestamp
  errors: Record<string, string>; // mac -> error message
  setIsPolling: (isPolling: boolean) => void;
  setLastUpdated: (mac: string, timestamp: number) => void;
  setError: (mac: string, error: string | null) => void;
  clearErrors: () => void;
}

export const usePollingStore = create<PollingStore>((set) => ({
  isPolling: false,
  lastUpdated: {},
  errors: {},

  setIsPolling: (isPolling) => set({ isPolling }),

  setLastUpdated: (mac, timestamp) =>
    set((state) => ({
      lastUpdated: { ...state.lastUpdated, [mac]: timestamp }
    })),

  setError: (mac, error) =>
    set((state) => ({
      errors: error
        ? { ...state.errors, [mac]: error }
        : (() => {
            const { [mac]: _, ...rest } = state.errors;
            return rest;
          })()
    })),

  clearErrors: () => set({ errors: {} })
}));
