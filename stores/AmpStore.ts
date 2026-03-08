import { create } from "zustand";
import type { ChannelData } from "@/lib/parse-fc27";

// ---------------------------------------------------------------------------
// Types — three clearly separated concerns
// ---------------------------------------------------------------------------

/** Configured identity: comes from the project file, never overwritten by polling. */
export interface AmpConfig {
  mac: string;
  /** Assignment ID from the project (uuid). */
  id: string;
  /** User-given name stored in the project (optional). */
  customName?: string;
}

/**
 * Parsed payload from FC=6 HEARTBEAT response (Heart_Inf_Whole118 / 118Plus variant).
 * Updated every ~140 ms by the server-side queryT_V_A loop.
 */
export interface HeartbeatData {
  /** 5 temperature sensor readings (°C) — [0-3] = channels, [4] = PSU */
  temperatures: number[];
  /** 4 output channel voltages (V) */
  outputVoltages: number[];
  /** 4 output channel currents (A) */
  outputCurrents: number[];
  /**
   * 4 output channel impedance (Ω) = Vs[i] / As[i].
   * 0 when current is zero (amp idle).
   */
  outputImpedance: number[];
  /**
   * 4 output channel levels in dBu = 20 * log10(Vs[i] / 0.775).
   * -Infinity floor (stored as -100) when voltage is 0 (amp idle).
   */
  outputDbu: number[];
  /** 4 output channel state bytes (fromat_machineState: 0=Normal, 8=Run, …) */
  outputStates: number[];
  /** 4 input channel voltages (V) */
  inputVoltages: number[];
  /**
   * 4 input dBFS values = 20 * log10(Vs_In[i]).
   * null when Vs_In is 0 (no signal).
   */
  inputDbfs: (number | null)[];
  /** 4 limiter reduction values (raw float, negate for display dB) */
  limiters: number[];
  /** 4 input state bytes (signed) — 0 = signal present */
  inputStates: number[];
  /** Fan speed percentage (0–100) */
  fanVoltage: number;
  /** Raw machine_mode byte from NetworkData header */
  machineMode: number;
  /** Unix timestamp (ms) when this heartbeat was received */
  receivedAt: number;
}

/**
 * Per-channel parameters for all 4 channels, parsed from FC=27 SYNC_DATA response.
 * Updated every ~1 second from the raw binary payload.
 *
 * Each channel contains:
 * - Input name and gain/volume parameters
 * - Output name
 * - Input sensitivity (calculated from gain)
 */
export interface ChannelParam {
  channel: number;
  inputName: string; // e.g., "AIn1", "AIn2", "AIn3", "AIn4"
  outputName: string; // e.g., "OutA", "OutB", "OutC", "OutD"
  gainIn: number; // dB (sbyte range)
  volumeIn: number; // dB (float32)
  sensitivity: number; // V (calculated from gainIn)
}

export interface ChannelParams {
  /** All 4 channels. */
  channels: ChannelParam[];
}

/** Live status: written exclusively by the polling layer. */
export interface AmpStatus {
  reachable: boolean;
  /** Last discovered IP address. */
  ip?: string;
  /** Device-reported name (from BASIC_INFO broadcast). */
  name?: string;
  /** Last known device name — kept when device goes offline. */
  lastKnownName?: string;
  /** Firmware version string. */
  version?: string;
  /** Total runtime in minutes (from SN_TABLE, fetched once). */
  run_time?: number;
  /**
   * Rated output RMS voltage (V) looked up from the device name.
   * e.g. DSP-2004 → 126.5 V. Set on first heartbeat.
   */
  ratedRmsV?: number;
  /** Per-channel input parameters (VOL + GAIN). Fetched once after discovery. */
  channelParams?: ChannelParams;
  /** Latest heartbeat sensor data (FC=6). undefined until first heartbeat. */
  heartbeat?: HeartbeatData;
  /** Raw channel data (FC=27) hex bytes. Updated every ~1 second. */
  channelDataHex?: string;
  /** Parsed channel data (FC=27) for all 4 channels. Updated every ~1 second. */
  parsedChannels?: ChannelData[];
}

/** On-demand preset list: written exclusively by the presets hook. */
export interface AmpPreset {
  slot: number;
  name: string;
}

export interface AmpPresets {
  /** undefined = never fetched, [] = fetched but empty */
  slots?: AmpPreset[];
}

// ---------------------------------------------------------------------------
// Composed view — what components read
// ---------------------------------------------------------------------------

/** Full amp record as seen by the UI. */
export interface Amp extends AmpConfig, AmpStatus {
  presets?: AmpPreset[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AmpStore {
  amps: Amp[];

  // — Seeding (from ProjectStore) —
  /** Replace the full list with project-config amps (status reset to unreachable). */
  seedAmps: (configs: AmpConfig[]) => void;
  /** Add or replace a single config entry (status reset). */
  seedAmp: (config: AmpConfig) => void;
  /** Remove an amp by MAC. */
  removeAmp: (mac: string) => void;
  /** Clear all amps. */
  clearAmps: () => void;

  // — Status (from polling layer) —
  /** Merge live status fields into an existing amp. */
  updateAmpStatus: (mac: string, status: Partial<AmpStatus>) => void;
  /** Write the latest heartbeat sensor payload for an amp. */
  updateHeartbeat: (mac: string, heartbeat: HeartbeatData) => void;
  /** Update the raw channel data (FC=27) hex for an amp. */
  updateChannelData: (mac: string, hex: string) => void;
  /** Update the parsed channel data (FC=27) for an amp. */
  updateParsedChannels: (mac: string, channels: ChannelData[]) => void;
  /** Sync parsed channel data into ChannelParams for structured access. */
  syncChannelParams: (mac: string, channels: ChannelData[]) => void;

  // — Presets (from presets hook) —
  /** Set the fetched preset list for an amp. */
  setPresets: (mac: string, presets: AmpPreset[]) => void;

  // — Selectors —
  getDisplayName: (amp: Amp) => string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function makeAmp(config: AmpConfig): Amp {
  return { ...config, reachable: false };
}

export const useAmpStore = create<AmpStore>((set) => ({
  amps: [],

  seedAmps: (configs) => set({ amps: configs.map(makeAmp) }),

  seedAmp: (config) =>
    set((state) => ({
      amps: [
        ...state.amps.filter((a) => a.mac !== config.mac),
        makeAmp(config),
      ],
    })),

  removeAmp: (mac) =>
    set((state) => ({ amps: state.amps.filter((a) => a.mac !== mac) })),

  clearAmps: () => set({ amps: [] }),

  updateAmpStatus: (mac, status) =>
    set((state) => ({
      amps: state.amps.map((amp) => {
        if (amp.mac !== mac) return amp;
        const updated: Amp = { ...amp, ...status };
        // Persist last known name when device is reachable and has a name
        if (status.name && status.reachable !== false) {
          updated.lastKnownName = status.name;
        }
        return updated;
      }),
    })),

  setPresets: (mac, presets) =>
    set((state) => ({
      amps: state.amps.map((amp) =>
        amp.mac === mac ? { ...amp, presets } : amp,
      ),
    })),

  updateHeartbeat: (mac, heartbeat) =>
    set((state) => ({
      amps: state.amps.map((amp) =>
        amp.mac === mac ? { ...amp, heartbeat } : amp,
      ),
    })),

  updateChannelData: (mac, hex) =>
    set((state) => ({
      amps: state.amps.map((amp) =>
        amp.mac === mac ? { ...amp, channelDataHex: hex } : amp,
      ),
    })),

  updateParsedChannels: (mac, channels) =>
    set((state) => ({
      amps: state.amps.map((amp) =>
        amp.mac === mac ? { ...amp, parsedChannels: channels } : amp,
      ),
    })),

  syncChannelParams: (mac, channels) =>
    set((state) => ({
      amps: state.amps.map((amp) => {
        if (amp.mac !== mac) return amp;
        return {
          ...amp,
          channelParams: {
            channels: channels.map((ch) => ({
              channel: ch.channel,
              inputName: ch.inputName,
              outputName: ch.outputName,
              gainIn: ch.gainIn,
              volumeIn: ch.volumeIn,
              sensitivity: ch.sensitivity,
            })),
          },
        };
      }),
    })),

  getDisplayName: (amp) =>
    amp.name ?? amp.lastKnownName ?? amp.customName ?? "Unknown Amp",
}));
