import { create } from "zustand";

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
  setSelectedProject: (project) => set({ selectedProject: project }),
  setLoading: (loading) => set({ loading }),

  selectProjectById: (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (project) {
      set({ selectedProject: project });
    }
  },
}));
