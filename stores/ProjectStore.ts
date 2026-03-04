import { create } from "zustand";
import { useAmpStore } from "./AmpStore";

export interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  assigned_amps: Array<{
    id: string;
    mac: string;
  }>;
}

interface ProjectStore {
  projects: Project[];
  selectedProject: Project | null;
  loading: boolean;
  setProjects: (projects: Project[]) => void;
  setSelectedProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  selectProjectById: (id: string) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  selectedProject: null,
  loading: true,

  setProjects: (projects) => set({ projects }),

  setSelectedProject: (project) => {
    set({ selectedProject: project });
    // Populate AmpStore with assigned amps from the selected project
    if (project) {
      const amps = project.assigned_amps.map((amp) => ({
        mac: amp.mac,
        id: amp.id,
        reachable: false, // Default to unreachable until polling updates it
      }));
      useAmpStore.getState().setAmps(amps);
    } else {
      useAmpStore.getState().clearAmps();
    }
  },

  setLoading: (loading) => set({ loading }),

  selectProjectById: (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (project) {
      get().setSelectedProject(project);
    }
  },
}));
