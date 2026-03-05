import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
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
  addAmpToProject: (projectId: string, mac: string) => Promise<void>;
  deleteAmpFromProject: (projectId: string, mac: string) => Promise<void>;
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

  addAmpToProject: async (projectId: string, mac: string) => {
    const { projects, selectedProject } = get();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Check if already exists
    if (
      project.assigned_amps.some(
        (amp) => amp.mac.toUpperCase() === mac.toUpperCase(),
      )
    ) {
      throw new Error("This MAC address is already assigned");
    }

    // Update local state
    const updatedProject: Project = {
      ...project,
      assigned_amps: [
        ...project.assigned_amps,
        {
          id: uuidv4(),
          mac: mac.toUpperCase(),
        },
      ],
    };

    const updatedProjects = projects.map((p) =>
      p.id === projectId ? updatedProject : p,
    );

    set({ projects: updatedProjects });

    // Update selected project if it's the one being modified
    if (selectedProject?.id === projectId) {
      set({ selectedProject: updatedProject });
      // Sync with AmpStore
      const amps = updatedProject.assigned_amps.map((amp) => ({
        mac: amp.mac,
        id: amp.id,
        reachable: false,
      }));
      useAmpStore.getState().setAmps(amps);
    }

    // Persist to API
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedProject),
    });
  },

  deleteAmpFromProject: async (projectId: string, mac: string) => {
    const { projects, selectedProject } = get();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Update local state
    const updatedProject: Project = {
      ...project,
      assigned_amps: project.assigned_amps.filter((a) => a.mac !== mac),
    };

    const updatedProjects = projects.map((p) =>
      p.id === projectId ? updatedProject : p,
    );

    set({ projects: updatedProjects });

    // Update selected project if it's the one being modified
    if (selectedProject?.id === projectId) {
      set({ selectedProject: updatedProject });
      // Sync with AmpStore
      const amps = updatedProject.assigned_amps.map((amp) => ({
        mac: amp.mac,
        id: amp.id,
        reachable: false,
      }));
      useAmpStore.getState().setAmps(amps);
    }

    // Persist to API
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedProject),
    });
  },
}));
