import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AppView = "control" | "unknown";
export type AmpSection = "main" | "matrix" | "linking" | "preferences" | "speaker-config";

interface TabStore {
  currentView: AppView;
  selectedAmpMac: string | null;
  selectedSection: AmpSection;
  setCurrentView: (view: AppView) => void;
  setSelectedAmpMac: (mac: string | null) => void;
  setSelectedSection: (section: AmpSection) => void;
  clearSelection: () => void;
}

export const useTabStore = create<TabStore>()(
  persist(
    (set) => ({
      currentView: "unknown",
      selectedAmpMac: null,
      selectedSection: "main",

      setCurrentView: (view) => set({ currentView: view }),

      setSelectedAmpMac: (mac) => set({ selectedAmpMac: mac }),

      setSelectedSection: (section) => set({ selectedSection: section }),

      clearSelection: () =>
        set({
          selectedAmpMac: null,
          selectedSection: "main"
        })
    }),
    {
      name: "tab-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentView: state.currentView,
        selectedAmpMac: state.selectedAmpMac,
        selectedSection: state.selectedSection
      })
    }
  )
);
