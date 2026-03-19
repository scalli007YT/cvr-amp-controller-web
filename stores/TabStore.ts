import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AppView = "monitor" | "scanner" | "unknown";
export type AmpSection = "main" | "matrix" | "linking" | "preferences";

interface TabStore {
  currentView: AppView;
  selectedAmpMac: string | null;
  selectedSectionByAmpMac: Record<string, AmpSection>;
  setCurrentView: (view: AppView) => void;
  setSelectedAmpMac: (mac: string | null) => void;
  setSelectedSectionForAmp: (mac: string, section: AmpSection) => void;
  clearSelection: () => void;
}

export const useTabStore = create<TabStore>()(
  persist(
    (set) => ({
      currentView: "unknown",
      selectedAmpMac: null,
      selectedSectionByAmpMac: {},

      setCurrentView: (view) => set({ currentView: view }),

      setSelectedAmpMac: (mac) => set({ selectedAmpMac: mac }),

      setSelectedSectionForAmp: (mac, section) =>
        set((state) => ({
          selectedSectionByAmpMac: {
            ...state.selectedSectionByAmpMac,
            [mac]: section
          }
        })),

      clearSelection: () =>
        set({
          selectedAmpMac: null,
          selectedSectionByAmpMac: {}
        })
    }),
    {
      name: "tab-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentView: state.currentView,
        selectedAmpMac: state.selectedAmpMac,
        selectedSectionByAmpMac: state.selectedSectionByAmpMac
      })
    }
  )
);
