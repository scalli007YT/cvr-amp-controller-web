import { create } from "zustand";

export interface Amp {
  mac: string;
  name?: string;
  lastKnownName?: string; // Fallback when device is unreachable
  version?: string;
  id?: string;
  run_time?: number;
  reachable: boolean; // Always true or false, never undefined
}

interface AmpStore {
  amps: Amp[];
  setAmps: (amps: Amp[]) => void;
  addAmp: (amp: Amp) => void;
  updateAmp: (mac: string, updates: Partial<Amp>) => void;
  clearAmps: () => void;
  getDisplayName: (amp: Amp) => string; // Helper to get name or lastKnownName
}

export const useAmpStore = create<AmpStore>((set) => ({
  amps: [],

  setAmps: (amps) => set({ amps }),

  addAmp: (amp) =>
    set((state) => ({
      amps: [...state.amps.filter((a) => a.mac !== amp.mac), amp],
    })),

  updateAmp: (mac, updates) =>
    set((state) => ({
      amps: state.amps.map((amp) => {
        if (amp.mac === mac) {
          const updated = { ...amp, ...updates };
          // If updating with a new name and device is reachable, save as lastKnownName
          if (updates.name && updates.reachable !== false) {
            updated.lastKnownName = updates.name;
          }
          return updated;
        }
        return amp;
      }),
    })),

  clearAmps: () => set({ amps: [] }),

  getDisplayName: (amp) => {
    // Return current name if available, otherwise fall back to lastKnownName
    return amp.name || amp.lastKnownName || "Unknown Amp";
  },
}));
