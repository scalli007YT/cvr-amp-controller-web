import { create, type StateCreator } from "zustand";
import {
  normalizeAmpLinkConfig,
  type AmpLinkConfig,
  type LinkScope,
  type LinkScopeConfig
} from "@/lib/amp-action-linking";

interface AmpActionLinkStore {
  byMac: Record<string, AmpLinkConfig>;
  hydrateAmpConfig: (mac: string, profile: unknown) => void;
  hydrateMany: (entries: Array<{ mac: string; profile: unknown }>) => void;
  setAmpConfig: (mac: string, config: AmpLinkConfig) => void;
  updateScope: (mac: string, scope: LinkScope, patch: Partial<LinkScopeConfig>) => void;
  removeAmpConfig: (mac: string) => void;
  clear: () => void;
}

export function getStoredAmpLinkConfig(byMac: Record<string, AmpLinkConfig>, mac: string): AmpLinkConfig {
  return normalizeAmpLinkConfig(byMac[normalizeMac(mac)]);
}

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

const createAmpActionLinkState: StateCreator<AmpActionLinkStore> = (set) => ({
  byMac: {},

  hydrateAmpConfig: (mac, profile) => {
    const key = normalizeMac(mac);
    set((state) => ({
      byMac: {
        ...state.byMac,
        [key]: normalizeAmpLinkConfig(profile)
      }
    }));
  },

  hydrateMany: (entries) => {
    set(() => ({
      byMac: Object.fromEntries(entries.map(({ mac, profile }) => [normalizeMac(mac), normalizeAmpLinkConfig(profile)]))
    }));
  },

  setAmpConfig: (mac, config) => {
    const key = normalizeMac(mac);
    set((state) => ({
      byMac: {
        ...state.byMac,
        [key]: normalizeAmpLinkConfig(config)
      }
    }));
  },

  updateScope: (mac, scope, patch) => {
    const key = normalizeMac(mac);
    set((state) => {
      const current = normalizeAmpLinkConfig(state.byMac[key]);
      const nextScope = normalizeAmpLinkConfig({
        ...current,
        scopes: {
          ...current.scopes,
          [scope]: {
            ...current.scopes[scope],
            ...patch
          }
        }
      }).scopes[scope];

      return {
        byMac: {
          ...state.byMac,
          [key]: {
            ...current,
            scopes: {
              ...current.scopes,
              [scope]: nextScope
            }
          }
        }
      };
    });
  },

  removeAmpConfig: (mac) => {
    const key = normalizeMac(mac);
    set((state) => {
      const { [key]: _removed, ...rest } = state.byMac;
      return { byMac: rest };
    });
  },

  clear: () => set({ byMac: {} })
});

export const useAmpActionLinkStore = create<AmpActionLinkStore>()(createAmpActionLinkState);
