import { create } from "zustand";
import { toScopeKey } from "@/lib/speaker-config";
import { type PostApplyChannelAction, type PostApplyTopologyAction } from "@/lib/speaker-apply-policy";

// Re-export so store consumers can get it from their existing store import.
export { toScopeKey } from "@/lib/speaker-config";

export interface SpeakerDragItem {
  id: string;
  model: string;
  ways: string;
  wayCount: number;
}

/** A channel linking group created by Join or Bridge operations. */
export interface ChannelGroup {
  id: string;
  type: "join" | "bridge";
  channels: number[]; // sorted
}

/** A speaker assignment applied to a channel group (or single channel). */
export interface SpeakerOutputAssignment {
  channel: number;
  groupId: string;
  itemId: string;
  model: string;
  wayLabel: string;
  wayIndex: number;
  wayCount: number;
}

export interface PersistedSpeakerScopeState {
  selectedOutputChannels: number[];
  channelGroups: ChannelGroup[];
  outputAssignments: Record<number, SpeakerOutputAssignment>;
}

interface SpeakerConfigStore {
  selectedOutputChannelsByScope: Record<string, number[]>;
  channelGroupsByScope: Record<string, ChannelGroup[]>;
  outputAssignmentsByScope: Record<string, Record<number, SpeakerOutputAssignment>>;
  activeDraggedItem: SpeakerDragItem | null;
  dragHoverChannel: number | null;

  // Post-apply policy toggles
  postApplyEnabled: boolean;
  postApplyChannelActions: PostApplyChannelAction[];
  postApplyTopologyActions: PostApplyTopologyAction[];

  toggleOutputChannel: (channel: number, scope?: string | null) => void;
  setOutputChannels: (channels: number[], scope?: string | null) => void;
  clearOutputChannels: (scope?: string | null) => void;
  clearAllScope: (scope?: string | null) => void;
  splitReset: (scope?: string | null) => void;
  joinSelected: (scope?: string | null) => { ok: boolean; error?: string };
  bridgeSelected: (scope?: string | null) => { ok: boolean; error?: string };
  setActiveDraggedItem: (item: SpeakerDragItem | null) => void;
  setDragHoverChannel: (channel: number | null) => void;
  assignItemToOutputs: (params: {
    startChannel: number;
    maxChannels: number;
    item: SpeakerDragItem;
    scope?: string | null;
  }) => { ok: boolean; error?: string };
  hydrateScopeFromGlobalStore: (scope?: string | null) => Promise<void>;
  persistScopeToGlobalStore: (scope?: string | null) => Promise<void>;

  // Post-apply policy setters
  setPostApplyEnabled: (enabled: boolean) => void;
  togglePostApplyChannelAction: (action: PostApplyChannelAction) => void;
  togglePostApplyTopologyAction: (action: PostApplyTopologyAction) => void;
}

function sanitizeChannels(channels: number[]): number[] {
  return Array.from(new Set(channels.filter((v) => Number.isInteger(v) && v > 0))).sort((a, b) => a - b);
}

function sanitizeWayCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 1;
  return Math.max(1, Math.min(16, Math.round(count)));
}

function sanitizeGroupChannels(channels: unknown): number[] {
  if (!Array.isArray(channels)) return [];
  return sanitizeChannels(channels.filter((v): v is number => typeof v === "number"));
}

function sanitizeChannelGroups(groups: unknown): ChannelGroup[] {
  if (!Array.isArray(groups)) return [];

  const normalized: ChannelGroup[] = [];
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;

    const candidate = group as Partial<ChannelGroup>;
    const type = candidate.type === "bridge" ? "bridge" : candidate.type === "join" ? "join" : null;
    if (!type) continue;

    const channels = sanitizeGroupChannels(candidate.channels);
    if (type === "bridge" && channels.length !== 2) continue;
    if (type === "join" && channels.length < 2) continue;
    if (!isContiguous(channels)) continue;

    normalized.push({
      id:
        typeof candidate.id === "string" && candidate.id.trim().length > 0
          ? candidate.id
          : `${type}:${Date.now()}:${channels[0]}`,
      type,
      channels
    });
  }

  return normalized;
}

function sanitizeOutputAssignments(assignments: unknown): Record<number, SpeakerOutputAssignment> {
  if (!assignments || typeof assignments !== "object") return {};

  const normalized: Record<number, SpeakerOutputAssignment> = {};
  for (const [channelKey, value] of Object.entries(assignments as Record<string, unknown>)) {
    const channel = Number(channelKey);
    if (!Number.isInteger(channel) || channel <= 0) continue;
    if (!value || typeof value !== "object") continue;

    const candidate = value as Partial<SpeakerOutputAssignment>;
    if (typeof candidate.model !== "string" || typeof candidate.wayLabel !== "string") continue;

    normalized[channel] = {
      channel,
      groupId:
        typeof candidate.groupId === "string" && candidate.groupId.trim().length > 0
          ? candidate.groupId
          : `item:${Date.now()}:${channel}`,
      itemId:
        typeof candidate.itemId === "string" && candidate.itemId.trim().length > 0
          ? candidate.itemId
          : `item:${channel}`,
      model: candidate.model,
      wayLabel: candidate.wayLabel,
      wayIndex:
        typeof candidate.wayIndex === "number" && Number.isFinite(candidate.wayIndex)
          ? Math.max(0, Math.floor(candidate.wayIndex))
          : 0,
      wayCount:
        typeof candidate.wayCount === "number" && Number.isFinite(candidate.wayCount)
          ? sanitizeWayCount(candidate.wayCount)
          : 1
    };
  }

  return normalized;
}

function toPersistedScopeState(input: unknown): PersistedSpeakerScopeState {
  const raw = input && typeof input === "object" ? (input as Partial<PersistedSpeakerScopeState>) : {};

  return {
    selectedOutputChannels: sanitizeChannels(
      Array.isArray(raw.selectedOutputChannels)
        ? raw.selectedOutputChannels.filter((v): v is number => typeof v === "number")
        : []
    ),
    channelGroups: sanitizeChannelGroups(raw.channelGroups),
    outputAssignments: sanitizeOutputAssignments(raw.outputAssignments)
  };
}

function deriveWayLabels(waysText: string, wayCount: number): string[] {
  const normalized = waysText.trim();
  const explicit = normalized
    .split(/[^A-Za-z0-9]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  if (explicit.length >= wayCount) {
    return explicit.slice(0, wayCount);
  }

  if (wayCount === 1) return ["Full"];
  if (wayCount === 2) return ["Low", "High"];
  if (wayCount === 3) return ["Low", "Mid", "High"];
  if (wayCount === 4) return ["Low", "LowMid", "HighMid", "High"];

  return Array.from({ length: wayCount }, (_, index) => `Way ${index + 1}`);
}

function isContiguous(channels: number[]): boolean {
  if (channels.length < 2) return false;
  for (let i = 1; i < channels.length; i += 1) {
    if (channels[i] !== channels[i - 1] + 1) return false;
  }
  return true;
}

/** Find the group that contains a given channel. */
export function findGroupForChannel(groups: ChannelGroup[], channel: number): ChannelGroup | undefined {
  return groups.find((g) => g.channels.includes(channel));
}

/** Remove all groups that overlap any of the given channels. */
function removeOverlappingGroups(groups: ChannelGroup[], channels: number[]): ChannelGroup[] {
  const set = new Set(channels);
  return groups.filter((g) => !g.channels.some((ch) => set.has(ch)));
}

export const useSpeakerConfigStore = create<SpeakerConfigStore>((set, get) => ({
  selectedOutputChannelsByScope: {},
  channelGroupsByScope: {},
  outputAssignmentsByScope: {},
  activeDraggedItem: null,
  dragHoverChannel: null,

  // Post-apply policy defaults — channel actions off by default
  postApplyEnabled: true,
  postApplyChannelActions: [],
  postApplyTopologyActions: ["adjustBridgeMode"],

  toggleOutputChannel: (channel, scope) => {
    if (!Number.isInteger(channel) || channel <= 0) return;

    const scopeKey = toScopeKey(scope);

    set((state) => {
      const current = state.selectedOutputChannelsByScope[scopeKey] ?? [];
      const exists = current.includes(channel);
      const next = exists ? current.filter((v) => v !== channel) : [...current, channel].sort((a, b) => a - b);

      return {
        selectedOutputChannelsByScope: {
          ...state.selectedOutputChannelsByScope,
          [scopeKey]: next
        }
      };
    });
  },

  setOutputChannels: (channels, scope) => {
    const scopeKey = toScopeKey(scope);
    const next = sanitizeChannels(channels);

    set((state) => ({
      selectedOutputChannelsByScope: {
        ...state.selectedOutputChannelsByScope,
        [scopeKey]: next
      }
    }));
  },

  clearOutputChannels: (scope) => {
    const scopeKey = toScopeKey(scope);

    set((state) => ({
      selectedOutputChannelsByScope: {
        ...state.selectedOutputChannelsByScope,
        [scopeKey]: []
      }
    }));
  },

  clearAllScope: (scope) => {
    const scopeKey = toScopeKey(scope);

    set((state) => ({
      selectedOutputChannelsByScope: {
        ...state.selectedOutputChannelsByScope,
        [scopeKey]: []
      },
      channelGroupsByScope: {
        ...state.channelGroupsByScope,
        [scopeKey]: []
      },
      outputAssignmentsByScope: {
        ...state.outputAssignmentsByScope,
        [scopeKey]: {}
      }
    }));
  },

  splitReset: (scope) => {
    const scopeKey = toScopeKey(scope);

    set((state) => {
      const selectedChannels = state.selectedOutputChannelsByScope[scopeKey] ?? [];
      if (selectedChannels.length === 0) {
        return state;
      }

      // Remove assignments for selected channels
      const scopedAssignments = { ...(state.outputAssignmentsByScope[scopeKey] ?? {}) };
      for (const channel of selectedChannels) {
        delete scopedAssignments[channel];
      }

      // Remove groups that overlap with selected channels
      const scopedGroups = state.channelGroupsByScope[scopeKey] ?? [];
      const updatedGroups = removeOverlappingGroups(scopedGroups, selectedChannels);

      return {
        selectedOutputChannelsByScope: {
          ...state.selectedOutputChannelsByScope,
          [scopeKey]: []
        },
        channelGroupsByScope: {
          ...state.channelGroupsByScope,
          [scopeKey]: updatedGroups
        },
        outputAssignmentsByScope: {
          ...state.outputAssignmentsByScope,
          [scopeKey]: scopedAssignments
        }
      };
    });
  },

  joinSelected: (scope) => {
    const scopeKey = toScopeKey(scope);
    let result: { ok: boolean; error?: string } = { ok: false, error: "No channels selected." };

    set((state) => {
      const selected = [...(state.selectedOutputChannelsByScope[scopeKey] ?? [])].sort((a, b) => a - b);
      if (selected.length < 2) {
        result = { ok: false, error: "Join requires at least 2 selected adjacent channels." };
        return state;
      }
      if (!isContiguous(selected)) {
        result = { ok: false, error: "Join requires contiguous channels." };
        return state;
      }

      // Remove overlapping groups and assignments
      const scopedGroups = removeOverlappingGroups(state.channelGroupsByScope[scopeKey] ?? [], selected);
      const scopedAssignments = { ...(state.outputAssignmentsByScope[scopeKey] ?? {}) };
      for (const ch of selected) {
        delete scopedAssignments[ch];
      }

      // Create new join group (linking only, no assignment)
      const group: ChannelGroup = {
        id: `join:${Date.now()}:${selected[0]}`,
        type: "join",
        channels: selected
      };

      result = { ok: true };
      return {
        channelGroupsByScope: {
          ...state.channelGroupsByScope,
          [scopeKey]: [...scopedGroups, group]
        },
        outputAssignmentsByScope: {
          ...state.outputAssignmentsByScope,
          [scopeKey]: scopedAssignments
        }
      };
    });

    return result;
  },

  bridgeSelected: (scope) => {
    const scopeKey = toScopeKey(scope);
    let result: { ok: boolean; error?: string } = { ok: false, error: "No channels selected." };

    set((state) => {
      const selected = [...(state.selectedOutputChannelsByScope[scopeKey] ?? [])].sort((a, b) => a - b);
      if (selected.length < 2) {
        result = { ok: false, error: "Bridge requires at least one selected pair." };
        return state;
      }

      const selectedSet = new Set(selected);
      const pairStarts = new Set<number>();

      for (const ch of selected) {
        const start = ch % 2 === 1 ? ch : ch - 1;
        const end = start + 1;
        if (!selectedSet.has(start) || !selectedSet.has(end)) {
          result = { ok: false, error: "Bridge requires complete adjacent pairs (1,2 / 3,4 / 5,6...)." };
          return state;
        }
        pairStarts.add(start);
      }

      // Remove overlapping groups and assignments
      let scopedGroups = removeOverlappingGroups(state.channelGroupsByScope[scopeKey] ?? [], selected);
      const scopedAssignments = { ...(state.outputAssignmentsByScope[scopeKey] ?? {}) };
      for (const ch of selected) {
        delete scopedAssignments[ch];
      }

      // Create bridge groups (linking only, no assignment)
      for (const start of Array.from(pairStarts).sort((a, b) => a - b)) {
        const group: ChannelGroup = {
          id: `bridge:${Date.now()}:${start}`,
          type: "bridge",
          channels: [start, start + 1]
        };
        scopedGroups = [...scopedGroups, group];
      }

      result = { ok: true };
      return {
        channelGroupsByScope: {
          ...state.channelGroupsByScope,
          [scopeKey]: scopedGroups
        },
        outputAssignmentsByScope: {
          ...state.outputAssignmentsByScope,
          [scopeKey]: scopedAssignments
        }
      };
    });

    return result;
  },

  setActiveDraggedItem: (item) => {
    set({ activeDraggedItem: item });
  },

  setDragHoverChannel: (channel) => {
    set({ dragHoverChannel: channel });
  },

  assignItemToOutputs: ({ startChannel, maxChannels, item, scope }) => {
    const scopeKey = toScopeKey(scope);
    const start = Math.max(1, Math.floor(startChannel));
    const max = Math.max(1, Math.floor(maxChannels));
    const wayCount = sanitizeWayCount(item.wayCount);

    // Bridge-aware: if dropping a 1-way config on a bridged channel, expand to the
    // full bridge pair so both channels get the same single-way assignment.
    const existingGroups = get().channelGroupsByScope[scopeKey] ?? [];
    const targetBridge =
      wayCount === 1 ? existingGroups.find((g) => g.type === "bridge" && g.channels.includes(start)) : undefined;
    const effectiveStart = targetBridge ? Math.min(...targetBridge.channels) : start;
    const bridgedChannels = targetBridge ? [...targetBridge.channels].sort((a, b) => a - b) : null;

    const end = effectiveStart + wayCount - 1;

    if (effectiveStart > max || end > max) {
      return {
        ok: false,
        error: `Not enough channels. Need ${wayCount} from CH ${effectiveStart}, but max is CH ${max}.`
      };
    }

    const labels = deriveWayLabels(item.ways, wayCount);
    const groupId = `${item.id}:${Date.now()}:${effectiveStart}`;

    set((state) => {
      const scoped = { ...(state.outputAssignmentsByScope[scopeKey] ?? {}) };
      const droppedChannels = bridgedChannels ?? Array.from({ length: wayCount }, (_, index) => effectiveStart + index);

      const overlappingGroupIds = new Set<string>();
      for (const channel of droppedChannels) {
        const existing = scoped[channel];
        if (existing?.groupId) overlappingGroupIds.add(existing.groupId);
      }

      if (overlappingGroupIds.size > 0) {
        for (const channelKey of Object.keys(scoped)) {
          const channel = Number(channelKey);
          if (overlappingGroupIds.has(scoped[channel]?.groupId)) {
            delete scoped[channel];
          }
        }
      }

      // For a bridged 1-way drop, assign the single way to all bridge channels.
      if (bridgedChannels) {
        for (const channel of bridgedChannels) {
          scoped[channel] = {
            channel,
            groupId,
            itemId: item.id,
            model: item.model,
            wayLabel: labels[0] ?? "WAY 1",
            wayIndex: 0,
            wayCount
          };
        }
      } else {
        for (let index = 0; index < wayCount; index += 1) {
          const channel = effectiveStart + index;
          scoped[channel] = {
            channel,
            groupId,
            itemId: item.id,
            model: item.model,
            wayLabel: labels[index] ?? `WAY ${index + 1}`,
            wayIndex: index,
            wayCount
          };
        }
      }

      // Drop has priority over existing link groups: remove overlapping joins/bridges,
      // then create a fresh join group for the dropped multi-way span.
      // For bridge targets, preserve the bridge group instead of removing it.
      let scopedGroups = removeOverlappingGroups(state.channelGroupsByScope[scopeKey] ?? [], droppedChannels);
      if (bridgedChannels) {
        // Re-add the bridge group since we want to keep the bridge intact
        scopedGroups = [
          ...scopedGroups,
          {
            id: targetBridge!.id,
            type: "bridge" as const,
            channels: bridgedChannels
          }
        ];
      } else if (wayCount > 1) {
        scopedGroups = [
          ...scopedGroups,
          {
            id: `join:${Date.now()}:${effectiveStart}`,
            type: "join",
            channels: droppedChannels
          }
        ];
      }

      return {
        channelGroupsByScope: {
          ...state.channelGroupsByScope,
          [scopeKey]: scopedGroups
        },
        outputAssignmentsByScope: {
          ...state.outputAssignmentsByScope,
          [scopeKey]: scoped
        }
      };
    });

    return { ok: true };
  },

  hydrateScopeFromGlobalStore: async (scope) => {
    const scopeKey = toScopeKey(scope);

    try {
      const response = await fetch(
        `/api/global-store/${encodeURIComponent(scopeKey)}?section=${encodeURIComponent("speakerConfig")}`
      );
      if (!response.ok) return;

      const payload = (await response.json()) as {
        success?: boolean;
        data?: unknown;
      };

      const persisted = toPersistedScopeState(payload?.data);

      set((state) => ({
        selectedOutputChannelsByScope: {
          ...state.selectedOutputChannelsByScope,
          [scopeKey]: persisted.selectedOutputChannels
        },
        channelGroupsByScope: {
          ...state.channelGroupsByScope,
          [scopeKey]: persisted.channelGroups
        },
        outputAssignmentsByScope: {
          ...state.outputAssignmentsByScope,
          [scopeKey]: persisted.outputAssignments
        }
      }));
    } catch {
      // Persistence failures should not break the editing workflow.
    }
  },

  persistScopeToGlobalStore: async (scope) => {
    const scopeKey = toScopeKey(scope);

    try {
      const state = get();
      const persisted: PersistedSpeakerScopeState = {
        selectedOutputChannels: state.selectedOutputChannelsByScope[scopeKey] ?? [],
        channelGroups: state.channelGroupsByScope[scopeKey] ?? [],
        outputAssignments: state.outputAssignmentsByScope[scopeKey] ?? {}
      };

      await fetch(`/api/global-store/${encodeURIComponent(scopeKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "speakerConfig",
          value: persisted
        })
      });
    } catch {
      // Persistence failures should not break the editing workflow.
    }
  },

  // ---------------------------------------------------------------------------
  // Post-apply policy setters
  // ---------------------------------------------------------------------------

  setPostApplyEnabled: (enabled) => {
    set({ postApplyEnabled: enabled });
  },

  togglePostApplyChannelAction: (action) => {
    set((state) => {
      const current = state.postApplyChannelActions;
      const has = current.includes(action);
      return {
        postApplyChannelActions: has ? current.filter((a) => a !== action) : [...current, action]
      };
    });
  },

  togglePostApplyTopologyAction: (action) => {
    set((state) => {
      const current = state.postApplyTopologyActions;
      const has = current.includes(action);
      return {
        postApplyTopologyActions: has ? current.filter((a) => a !== action) : [...current, action]
      };
    });
  }
}));
