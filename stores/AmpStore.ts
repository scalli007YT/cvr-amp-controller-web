import { create } from "zustand";

export interface Amp {
  mac: string;
  name?: string;
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
      amps: state.amps.map((amp) =>
        amp.mac === mac ? { ...amp, ...updates } : amp,
      ),
    })),

  clearAmps: () => set({ amps: [] }),
}));
