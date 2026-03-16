import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { useAmpStore } from "./AmpStore";
import {
  createDefaultAmpLinkConfig,
  DEFAULT_AMP_LINK_CONFIG,
  normalizeAmpLinkConfig,
  serializeAmpLinkConfig,
  type AmpLinkConfig
} from "@/lib/amp-action-linking";
import { useAmpActionLinkStore } from "./AmpActionLinkStore";

export interface AmpChannelConstants {
  ohms: number;
}

export interface AssignedAmpConstants {
  channels: AmpChannelConstants[];
  linking: AmpLinkConfig;
}

const defaultAmpLinking: AmpLinkConfig = createDefaultAmpLinkConfig();

export const DEFAULT_AMP_CONSTANTS: AssignedAmpConstants = {
  channels: [],
  linking: defaultAmpLinking
};

export interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  assigned_amps: Array<{
    id: string;
    mac: string;
    constants: AssignedAmpConstants;
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
  createProject: (name: string, description?: string) => Promise<Project>;
  renameProject: (id: string, name: string, description: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addAmpToProject: (projectId: string, mac: string) => Promise<void>;
  deleteAmpFromProject: (projectId: string, mac: string) => Promise<void>;
  updateAmpChannelOhms: (mac: string, channelIndex: number, ohms: number) => Promise<void>;
  updateAmpLinking: (mac: string, linking: AmpLinkConfig) => Promise<void>;
}

function serializeProjectForPersistence(project: Project): Project {
  return {
    ...project,
    assigned_amps: project.assigned_amps.map((amp) => ({
      ...amp,
      constants: {
        ...amp.constants,
        linking: serializeAmpLinkConfig(amp.constants.linking) as unknown as AmpLinkConfig
      }
    }))
  };
}

function syncAmpLinkingFromProject(project: Project | null) {
  if (!project) {
    useAmpActionLinkStore.getState().clear();
    return;
  }

  useAmpActionLinkStore.getState().hydrateMany(
    project.assigned_amps.map((amp) => ({
      mac: amp.mac,
      profile: amp.constants.linking
    }))
  );
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  selectedProject: null,
  loading: true,

  setProjects: (projects) => set({ projects }),

  setSelectedProject: (project) => {
    set({ selectedProject: project });
    // Seed AmpStore with config-only entries from the selected project
    if (project) {
      const configs = project.assigned_amps.map((amp) => ({
        mac: amp.mac,
        id: amp.id,
        constants: amp.constants
      }));
      useAmpStore.getState().seedAmps(configs);
    } else {
      useAmpStore.getState().clearAmps();
    }

    syncAmpLinkingFromProject(project);
  },

  setLoading: (loading) => set({ loading }),

  selectProjectById: (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (project) {
      get().setSelectedProject(project);
    }
  },

  createProject: async (name: string, description = "") => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error ?? "Failed to create project");
    }

    const newProject: Project = data.project;
    set((state) => ({ projects: [...state.projects, newProject] }));
    get().setSelectedProject(newProject);
    return newProject;
  },

  renameProject: async (id: string, name: string, description: string) => {
    const { projects, selectedProject } = get();
    const project = projects.find((p) => p.id === id);
    if (!project) throw new Error("Project not found");

    const updatedProject: Project = { ...project, name, description };

    set({
      projects: projects.map((p) => (p.id === id ? updatedProject : p)),
      ...(selectedProject?.id === id ? { selectedProject: updatedProject } : {})
    });

    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeProjectForPersistence(updatedProject))
    });
  },

  deleteProject: async (id: string) => {
    const { projects, selectedProject } = get();

    set({ projects: projects.filter((p) => p.id !== id) });

    if (selectedProject?.id === id) {
      const remaining = get().projects;
      get().setSelectedProject(remaining[0] ?? null);
    }

    await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },

  addAmpToProject: async (projectId: string, mac: string) => {
    const { projects, selectedProject } = get();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Check if already exists
    if (project.assigned_amps.some((amp) => amp.mac.toUpperCase() === mac.toUpperCase())) {
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
          constants: {
            ...DEFAULT_AMP_CONSTANTS,
            linking: normalizeAmpLinkConfig(DEFAULT_AMP_LINK_CONFIG)
          }
        }
      ]
    };

    const updatedProjects = projects.map((p) => (p.id === projectId ? updatedProject : p));

    set({ projects: updatedProjects });

    // Update selected project if it's the one being modified
    if (selectedProject?.id === projectId) {
      set({ selectedProject: updatedProject });
      // Sync with AmpStore — seed new config, preserving live status of existing amps
      const configs = updatedProject.assigned_amps.map((amp) => ({
        mac: amp.mac,
        id: amp.id,
        constants: amp.constants
      }));
      useAmpStore.getState().seedAmps(configs);
      syncAmpLinkingFromProject(updatedProject);
    }

    // Persist to API
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeProjectForPersistence(updatedProject))
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
      assigned_amps: project.assigned_amps.filter((a) => a.mac !== mac)
    };

    const updatedProjects = projects.map((p) => (p.id === projectId ? updatedProject : p));

    set({ projects: updatedProjects });

    // Update selected project if it's the one being modified
    if (selectedProject?.id === projectId) {
      set({ selectedProject: updatedProject });
      // Sync with AmpStore — seed new config (removed amp is excluded)
      const configs = updatedProject.assigned_amps.map((amp) => ({
        mac: amp.mac,
        id: amp.id,
        constants: amp.constants
      }));
      useAmpStore.getState().seedAmps(configs);
      syncAmpLinkingFromProject(updatedProject);
    }

    // Persist to API
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeProjectForPersistence(updatedProject))
    });
  },

  updateAmpChannelOhms: async (mac, channelIndex, ohms) => {
    const { projects, selectedProject } = get();
    if (!selectedProject) return;

    const updatedProject: Project = {
      ...selectedProject,
      assigned_amps: selectedProject.assigned_amps.map((amp) => {
        if (amp.mac.toUpperCase() !== mac.toUpperCase()) return amp;
        return {
          ...amp,
          constants: {
            channels: amp.constants.channels.map((ch, i) => (i === channelIndex ? { ...ch, ohms } : ch)),
            linking: normalizeAmpLinkConfig(amp.constants.linking)
          }
        };
      })
    };

    set({
      projects: projects.map((p) => (p.id === selectedProject.id ? updatedProject : p)),
      selectedProject: updatedProject
    });

    // Reflect in AmpStore so next syncChannelParams uses updated ohms
    useAmpStore.getState().updateAmpChannelOhms(mac, channelIndex, ohms);

    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeProjectForPersistence(updatedProject))
    });
  },

  updateAmpLinking: async (mac, linking) => {
    const { projects, selectedProject } = get();
    if (!selectedProject) return;

    const normalizedMac = mac.toUpperCase();
    const normalizedLinking = normalizeAmpLinkConfig(linking);
    const updatedProject: Project = {
      ...selectedProject,
      assigned_amps: selectedProject.assigned_amps.map((amp) => {
        if (amp.mac.toUpperCase() !== normalizedMac) return amp;
        return {
          ...amp,
          constants: {
            ...amp.constants,
            linking: normalizedLinking
          }
        };
      })
    };

    set({
      projects: projects.map((project) => (project.id === selectedProject.id ? updatedProject : project)),
      selectedProject: updatedProject
    });

    useAmpActionLinkStore.getState().setAmpConfig(mac, normalizedLinking);

    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeProjectForPersistence(updatedProject))
    });
  }
}));
