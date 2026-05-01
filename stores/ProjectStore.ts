import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { useAmpStore } from "./AmpStore";
import {
  createDefaultAmpLinkConfig,
  DEFAULT_AMP_LINK_CONFIG,
  normalizeAmpLinkConfig,
  serializeAmpLinkConfig,
  type AmpLinkConfig
} from "@/lib/amp-action-linking";
import { isSimulatedMac } from "@/lib/simulated-amp-identity";
import { useAmpActionLinkStore } from "./AmpActionLinkStore";
import {
  DEFAULT_CHANNEL_OHMS,
  DEFAULT_PROJECT_CHANNEL_COUNT,
  type ProjectMode,
  type AmpChannelConstants,
  type AssignedAmpConstants,
  type Project
} from "@/lib/types/project";
export type { ProjectMode, AmpChannelConstants, AssignedAmpConstants, Project };

const defaultAmpLinking: AmpLinkConfig = createDefaultAmpLinkConfig();
const assignedAmpNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function createDefaultChannels(count: number, ohms = DEFAULT_CHANNEL_OHMS): AmpChannelConstants[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : DEFAULT_PROJECT_CHANNEL_COUNT;
  return Array.from({ length: safeCount }, () => ({ ohms }));
}

export const DEFAULT_AMP_CONSTANTS: AssignedAmpConstants = {
  channels: createDefaultChannels(DEFAULT_PROJECT_CHANNEL_COUNT),
  linking: defaultAmpLinking
};

interface ProjectStore {
  projects: Project[];
  selectedProject: Project | null;
  selectedProjectId: string | null;
  loading: boolean;
  load: () => Promise<void>;
  setProjects: (projects: Project[]) => void;
  setSelectedProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
  selectProjectById: (id: string) => void;
  createProject: (name: string, description?: string, projectMode?: ProjectMode) => Promise<Project>;
  renameProject: (id: string, name: string, description: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addAmpToProject: (projectId: string, mac: string) => Promise<void>;
  deleteAmpFromProject: (projectId: string, mac: string) => Promise<void>;
  reorderAssignedAmps: (projectId: string, orderedMacs: string[]) => Promise<void>;
  updateAmpChannelOhms: (mac: string, channelIndex: number, ohms: number) => Promise<void>;
  updateAmpLinking: (mac: string, linking: AmpLinkConfig) => Promise<void>;
  updateAmpLastKnownName: (mac: string, lastKnownName: string) => Promise<void>;
  updateAmpLastKnownIp: (mac: string, lastKnownIp: string) => Promise<void>;
  updateAmpChannelCount: (mac: string, channelCount: number) => void;
}

function mapAssignedAmpToConfig(amp: Project["assigned_amps"][number]) {
  return {
    mac: amp.mac,
    id: amp.id,
    lastKnownName: amp.lastKnownName,
    constants: amp.constants
  };
}

function sortAssignedAmpsAlphabetically(assignedAmps: Project["assigned_amps"]): Project["assigned_amps"] {
  const runtimeAmps = useAmpStore.getState().amps;
  const sortLabelByMac = new Map(
    runtimeAmps.map((amp) => [amp.mac.toUpperCase(), (amp.name ?? amp.lastKnownName ?? amp.mac).trim()])
  );

  return [...assignedAmps].sort((leftAmp, rightAmp) => {
    const leftLabel = sortLabelByMac.get(leftAmp.mac.toUpperCase()) ?? (leftAmp.lastKnownName ?? leftAmp.mac).trim();
    const rightLabel =
      sortLabelByMac.get(rightAmp.mac.toUpperCase()) ?? (rightAmp.lastKnownName ?? rightAmp.mac).trim();
    const labelComparison = assignedAmpNameCollator.compare(leftLabel, rightLabel);

    if (labelComparison !== 0) {
      return labelComparison;
    }

    return assignedAmpNameCollator.compare(leftAmp.mac, rightAmp.mac);
  });
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

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      selectedProject: null,
      selectedProjectId: null,
      loading: true,

      load: async () => {
        try {
          const res = await fetch("/api/projects");
          const data = await res.json();
          if (data.success) {
            get().setProjects(data.projects);
          }
        } catch {
          // silently ignore
        } finally {
          set({ loading: false });
        }
      },

      setProjects: (projects) => {
        const { selectedProjectId } = get();
        const matched = selectedProjectId
          ? (projects.find((project) => project.id === selectedProjectId) ?? null)
          : null;

        // If nothing matched (no persisted selection, or ID is stale) and there
        // are projects available, fall back to the most recently updated one.
        const nextSelectedProject = matched ?? projects[0] ?? null;

        set({
          projects,
          selectedProject: nextSelectedProject,
          selectedProjectId: nextSelectedProject?.id ?? null
        });

        if (nextSelectedProject) {
          const configs = nextSelectedProject.assigned_amps.map(mapAssignedAmpToConfig);
          useAmpStore.getState().seedAmps(configs);
        } else {
          useAmpStore.getState().clearAmps();
        }

        syncAmpLinkingFromProject(nextSelectedProject);
      },

      setSelectedProject: (project) => {
        set({ selectedProject: project, selectedProjectId: project?.id ?? null });
        if (project) {
          const configs = project.assigned_amps.map(mapAssignedAmpToConfig);
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

      createProject: async (name: string, description = "", projectMode: ProjectMode = "real") => {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, projectMode })
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
        const normalizedMac = mac.toUpperCase();
        const simulated = isSimulatedMac(normalizedMac);

        if (!project) {
          throw new Error("Project not found");
        }

        // Check if already exists
        if (project.assigned_amps.some((amp) => amp.mac.toUpperCase() === normalizedMac)) {
          throw new Error("This MAC address is already assigned");
        }

        if (project.projectMode === "demo" && !simulated) {
          throw new Error("Demo projects accept simulated amps only");
        }

        if (project.projectMode === "real" && simulated) {
          throw new Error("Real projects cannot contain simulated amps");
        }

        const runtimeAmp = useAmpStore.getState().amps.find((amp) => amp.mac.toUpperCase() === normalizedMac);
        // Prefer output_chx from discovery (FC=0) as authoritative channel count
        const detectedChannelCount =
          runtimeAmp?.output_chx ??
          runtimeAmp?.channelParams?.channels.length ??
          runtimeAmp?.constants.channels.length ??
          DEFAULT_PROJECT_CHANNEL_COUNT;

        // Update local state
        const updatedProject: Project = {
          ...project,
          assigned_amps: sortAssignedAmpsAlphabetically([
            ...project.assigned_amps,
            {
              id: uuidv4(),
              mac: normalizedMac,
              lastKnownName: undefined,
              constants: {
                ...DEFAULT_AMP_CONSTANTS,
                channels: createDefaultChannels(detectedChannelCount),
                linking: normalizeAmpLinkConfig(DEFAULT_AMP_LINK_CONFIG)
              }
            }
          ])
        };

        const updatedProjects = projects.map((p) => (p.id === projectId ? updatedProject : p));

        set({ projects: updatedProjects });

        // Update selected project if it's the one being modified
        if (selectedProject?.id === projectId) {
          set({ selectedProject: updatedProject });
          // Sync with AmpStore — seed new config, preserving live status of existing amps
          const configs = updatedProject.assigned_amps.map(mapAssignedAmpToConfig);
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
          assigned_amps: sortAssignedAmpsAlphabetically(project.assigned_amps.filter((a) => a.mac !== mac))
        };

        const updatedProjects = projects.map((p) => (p.id === projectId ? updatedProject : p));

        set({ projects: updatedProjects });

        // Update selected project if it's the one being modified
        if (selectedProject?.id === projectId) {
          set({ selectedProject: updatedProject });
          // Sync with AmpStore — seed new config (removed amp is excluded)
          const configs = updatedProject.assigned_amps.map(mapAssignedAmpToConfig);
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

      reorderAssignedAmps: async (projectId, orderedMacs) => {
        const { projects, selectedProject } = get();
        const project = projects.find((p) => p.id === projectId);

        if (!project) {
          throw new Error("Project not found");
        }

        const currentOrder = project.assigned_amps.map((amp) => amp.mac.toUpperCase());
        const normalizedOrder = orderedMacs.map((mac) => mac.toUpperCase());

        if (currentOrder.length !== normalizedOrder.length) {
          throw new Error("Invalid amp order");
        }

        if (currentOrder.every((mac, index) => mac === normalizedOrder[index])) {
          return;
        }

        const ampByMac = new Map(project.assigned_amps.map((amp) => [amp.mac.toUpperCase(), amp]));
        const reorderedAmps = normalizedOrder.map((mac) => {
          const amp = ampByMac.get(mac);
          if (!amp) {
            throw new Error("Invalid amp order");
          }
          return amp;
        });

        const updatedProject: Project = {
          ...project,
          assigned_amps: reorderedAmps
        };

        const updatedProjects = projects.map((p) => (p.id === projectId ? updatedProject : p));

        set({ projects: updatedProjects });

        if (selectedProject?.id === projectId) {
          set({ selectedProject: updatedProject });
          const configs = updatedProject.assigned_amps.map(mapAssignedAmpToConfig);
          useAmpStore.getState().seedAmps(configs);
          syncAmpLinkingFromProject(updatedProject);
        }

        await fetch("/api/projects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serializeProjectForPersistence(updatedProject))
        });
      },

      updateAmpChannelOhms: async (mac, channelIndex, ohms) => {
        const { projects, selectedProject } = get();
        if (!selectedProject) return;
        const normalizedMac = mac.toUpperCase();
        const runtimeAmp = useAmpStore.getState().amps.find((amp) => amp.mac.toUpperCase() === normalizedMac);

        const updatedProject: Project = {
          ...selectedProject,
          assigned_amps: selectedProject.assigned_amps.map((amp) => {
            if (amp.mac.toUpperCase() !== normalizedMac) return amp;

            const targetChannelCount = Math.max(
              amp.constants.channels.length,
              runtimeAmp?.channelParams?.channels.length ?? 0,
              runtimeAmp?.output_chx ?? 0,
              channelIndex + 1
            );

            return {
              ...amp,
              constants: {
                channels: Array.from({ length: targetChannelCount }, (_, i) => ({
                  ohms: i === channelIndex ? ohms : (amp.constants.channels[i]?.ohms ?? DEFAULT_CHANNEL_OHMS)
                })),
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
      },

      updateAmpLastKnownName: async (mac, lastKnownName) => {
        const { projects, selectedProject } = get();
        if (!selectedProject) return;

        const normalizedMac = mac.toUpperCase();
        const normalizedName = lastKnownName.trim();
        if (!normalizedName) return;

        const currentAmp = selectedProject.assigned_amps.find((amp) => amp.mac.toUpperCase() === normalizedMac);
        if (!currentAmp) return;
        if (currentAmp.lastKnownName === normalizedName) return;

        const updatedProject: Project = {
          ...selectedProject,
          assigned_amps: selectedProject.assigned_amps.map((amp) => {
            if (amp.mac.toUpperCase() !== normalizedMac) return amp;
            return {
              ...amp,
              lastKnownName: normalizedName
            };
          })
        };

        set({
          projects: projects.map((project) => (project.id === selectedProject.id ? updatedProject : project)),
          selectedProject: updatedProject
        });

        useAmpStore.getState().updateAmpStatus(mac, { lastKnownName: normalizedName });

        await fetch("/api/projects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serializeProjectForPersistence(updatedProject))
        });
      },

      updateAmpLastKnownIp: async (mac, lastKnownIp) => {
        const { projects, selectedProject } = get();
        if (!selectedProject) return;

        const normalizedMac = mac.toUpperCase();
        const normalizedIp = lastKnownIp.trim();
        if (!normalizedIp) return;

        const currentAmp = selectedProject.assigned_amps.find((amp) => amp.mac.toUpperCase() === normalizedMac);
        if (!currentAmp) return;
        if (currentAmp.lastKnownIp === normalizedIp) return;

        const updatedProject: Project = {
          ...selectedProject,
          assigned_amps: selectedProject.assigned_amps.map((amp) => {
            if (amp.mac.toUpperCase() !== normalizedMac) return amp;
            return {
              ...amp,
              lastKnownIp: normalizedIp
            };
          })
        };

        set({
          projects: projects.map((project) => (project.id === selectedProject.id ? updatedProject : project)),
          selectedProject: updatedProject
        });

        await fetch("/api/projects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serializeProjectForPersistence(updatedProject))
        });
      },

      updateAmpChannelCount: (mac, channelCount) => {
        const { projects, selectedProject } = get();
        if (!selectedProject) return;

        const normalizedMac = mac.toUpperCase();
        const safeCount = Math.max(1, Math.floor(channelCount));

        const currentAmp = selectedProject.assigned_amps.find((amp) => amp.mac.toUpperCase() === normalizedMac);
        if (!currentAmp) return;
        if (currentAmp.constants.channels.length === safeCount) return;

        // Resize channels array: preserve existing ohms, pad with defaults
        const newChannels = Array.from({ length: safeCount }, (_, i) => ({
          channel: i,
          ohms: currentAmp.constants.channels[i]?.ohms ?? DEFAULT_CHANNEL_OHMS
        }));

        const updatedProject: Project = {
          ...selectedProject,
          assigned_amps: selectedProject.assigned_amps.map((amp) => {
            if (amp.mac.toUpperCase() !== normalizedMac) return amp;
            return {
              ...amp,
              constants: {
                ...amp.constants,
                channels: newChannels
              }
            };
          })
        };

        set({
          projects: projects.map((project) => (project.id === selectedProject.id ? updatedProject : project)),
          selectedProject: updatedProject
        });

        // Note: We don't persist this immediately — it's a runtime optimization.
        // The persisted project file uses defaults anyway and gets updated on next save.
      }
    }),
    {
      name: "project-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ selectedProjectId: state.selectedProjectId })
    }
  )
);
