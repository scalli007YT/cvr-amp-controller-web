import { create } from "zustand";
import { limiterPowerFromLoad } from "@/lib/generic";
import type { SourceCapabilities } from "@/lib/source-capabilities";
import type { AmpLinkConfig } from "@/lib/amp-action-linking";

export interface AmpChannelConstants {
  ohms: number;
}

export interface AssignedAmpConstants {
  channels: AmpChannelConstants[];
  linking: AmpLinkConfig;
}

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
  /** Project-defined per-channel constants. */
  constants: AssignedAmpConstants;
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
   * 4 output channel levels on the original CVR relative meter scale:
   * 20 * log10(Vs[i] / ratedRmsV), with 0 dB at rated/max RMS output.
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

export interface BridgeReadback {
  pair: number;
  raw: number | null;
  bridged: boolean | null;
}

export interface ChannelFlags {
  channel: number;
  bridgeByte: number | null;
  rawState: number;
  stateLabel: string;
  normal: boolean;
  standby: boolean;
  fault: boolean;
  open: boolean;
  overload: boolean;
  clip: boolean;
  dcp: boolean;
  powerError: boolean;
  run: boolean;
  temp: boolean;
  limit: boolean;
  sleep: boolean;
  /** Heuristic: a load is present when output current/impedance are non-zero. */
  load: boolean;
  /** Mirrors the original UI's Hi Z indicator: active when CPCR/power mode > 0. */
  hiZ: boolean;
  /** Truthful bridge readback from FC=50. */
  bridged: boolean | null;
}

export interface AmpBasicInfo {
  Gain_max: number;
  Analog_signal_Input_chx: number;
  Digital_signal_input_chx: number;
  Output_chx: number;
  Machine_state: number;
}

export interface MatrixSource {
  source: number;
  gain: number;
  active: boolean;
}

export interface ChannelInputSource {
  key: "analog" | "dante" | "aes3" | "backup";
  type: string;
  delay: number;
  trim: number;
  selected: boolean;
}

export interface EqBand {
  type: number;
  gain: number;
  freq: number;
  q: number;
  bypass: boolean;
}

/**
 * Per-channel parameters for all 4 channels, parsed from FC=27 SYNC_DATA response.
 * Updated every ~1 second from the raw binary payload.
 */
export interface ChannelParam {
  channel: number;
  inputName: string; // e.g., "AIn1" – "AIn4"
  outputName: string; // e.g., "OutA" – "OutD"
  gainIn: number; // dB (sbyte)
  volumeIn: number; // dB (float32)
  muteIn: boolean; // true = muted
  delayIn: number; // ms (float32)
  trimOut: number; // dB (float32)
  muteOut: boolean; // true = muted
  noiseGateOut: boolean; // true = noise gate enabled
  delayOut: number; // ms (float32)
  invertedOut: boolean; // true = polarity flipped
  /** Raw dzdy/CPCR mode byte from FC=27. Observed: 0=Low-Z 1=70V 2=100V. */
  powerMode: number;
  /** Raw source selector byte (0=Analog, 1=Dante, 2=AES3, 3=Backup on compatible models). */
  sourceTypeCode: number;
  /** Selected source label, e.g. Analog-1 / Dante-2 / AES3-1 / Backup. */
  sourceType: string;
  /** Delay value of the currently selected source. */
  sourceDelay: number;
  /** Trim value of the currently selected source. */
  sourceTrim: number;
  /** Per-source values (type/delay/trim) for this channel. */
  sourceInputs: ChannelInputSource[];
  rmsLimiter: {
    enabled: boolean;
    thresholdVrms: number;
    attackMs: number;
    releaseMultiplier: number; // n × Attack
    /** Power at threshold into the configured load (W). */
    prmsW: number;
  };
  peakLimiter: {
    enabled: boolean;
    thresholdVp: number;
    holdMs: number;
    releaseMs: number;
    /** Peak power at threshold into the configured load (W). */
    ppeakW: number;
  };
  matrix: MatrixSource[];
  eqIn: EqBand[]; // 10 bands: HP + EQ1–8 + LP
  eqOut: EqBand[]; // 10 bands: HP + EQ1–8 + LP
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
  /** Raw FC=0 BASIC_INFO snapshot from discovery response. */
  basic_info?: AmpBasicInfo;
  /** Convenience mirrors from BASIC_INFO for quick access. */
  analog_signal_input_chx?: number;
  output_chx?: number;
  machine_state?: number;
  gain_max?: number;
  /** Derived source-capability state used to gray-out unsupported options. */
  sourceCapabilities?: SourceCapabilities;
  /**
   * Rated output RMS voltage (V) looked up from the device name.
   * e.g. DSP-2004 → 126.5 V. Set on first heartbeat.
   */
  ratedRmsV?: number;
  /** Per-channel input parameters (VOL + GAIN). Fetched once after discovery. */
  channelParams?: ChannelParams;
  /** Raw per-pair bridge readback from FC=50: [AB, CD]. */
  bridgePairs?: BridgeReadback[];
  /** Derived output flags for each channel, combining heartbeat and channel mode data. */
  channelFlags?: ChannelFlags[];
  /** Latest heartbeat sensor data (FC=6). undefined until first heartbeat. */
  heartbeat?: HeartbeatData;
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
  updateHeartbeat: (mac: string, heartbeat: HeartbeatData, bridgePairs?: BridgeReadback[]) => void;
  /** Sync parsed channel data into ChannelParams for structured access. */
  syncChannelParams: (mac: string, channels: ChannelParam[]) => void;

  // — Presets (from presets hook) —
  /** Set the fetched preset list for an amp. */
  setPresets: (mac: string, presets: AmpPreset[]) => void;

  /** Update a single channel's ohm constant in-memory (called by ProjectStore after persist). */
  updateAmpChannelOhms: (mac: string, channelIndex: number, ohms: number) => void;

  // — Selectors —
  getDisplayName: (amp: Amp) => string;
}

function makeAmp(config: AmpConfig): Amp {
  return { ...config, reachable: false };
}

function getOutputStateLabel(state: number): string {
  switch (state) {
    case -1:
      return "Offline";
    case 0:
      return "Normal";
    case 1:
      return "Standby";
    case 2:
      return "Fault";
    case 3:
      return "Open";
    case 4:
      return "Overload";
    case 5:
      return "Clip";
    case 6:
      return "Dcp";
    case 7:
      return "PowerEr";
    case 8:
      return "Run";
    case 9:
      return "Temp";
    case 10:
      return "Limit";
    case 11:
      return "Sleep";
    default:
      return "Normal";
  }
}

function deriveChannelFlags(
  heartbeat?: HeartbeatData,
  channelParams?: ChannelParams,
  bridgePairs?: BridgeReadback[]
): ChannelFlags[] | undefined {
  if (!heartbeat) return undefined;

  return [0, 1, 2, 3].map((channel) => {
    const rawState = heartbeat.outputStates[channel] ?? -1;
    const powerMode = channelParams?.channels[channel]?.powerMode ?? 0;
    const current = heartbeat.outputCurrents[channel] ?? 0;
    const impedance = heartbeat.outputImpedance[channel] ?? 0;
    const bridgeReadback = bridgePairs?.[Math.floor(channel / 2)] ?? null;

    return {
      channel,
      bridgeByte: bridgeReadback?.raw ?? null,
      rawState,
      stateLabel: getOutputStateLabel(rawState),
      normal: rawState === 0,
      standby: rawState === 1,
      fault: rawState === 2,
      open: rawState === 3,
      overload: rawState === 4,
      clip: rawState === 5,
      dcp: rawState === 6,
      powerError: rawState === 7,
      run: rawState === 8,
      temp: rawState === 9,
      limit: rawState === 10,
      sleep: rawState === 11,
      load: current > 0 && impedance > 0,
      hiZ: powerMode > 0,
      bridged: bridgeReadback?.bridged ?? null
    };
  });
}

export const useAmpStore = create<AmpStore>((set) => ({
  amps: [],

  seedAmps: (configs) => set({ amps: configs.map(makeAmp) }),

  seedAmp: (config) =>
    set((state) => ({
      amps: [...state.amps.filter((a) => a.mac !== config.mac), makeAmp(config)]
    })),

  removeAmp: (mac) => set((state) => ({ amps: state.amps.filter((a) => a.mac !== mac) })),

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
      })
    })),

  setPresets: (mac, presets) =>
    set((state) => ({
      amps: state.amps.map((amp) => (amp.mac === mac ? { ...amp, presets } : amp))
    })),

  updateHeartbeat: (mac, heartbeat, bridgePairs) =>
    set((state) => ({
      amps: state.amps.map((amp) =>
        amp.mac === mac
          ? {
              ...amp,
              heartbeat,
              bridgePairs: bridgePairs ?? amp.bridgePairs,
              channelFlags: deriveChannelFlags(heartbeat, amp.channelParams, bridgePairs ?? amp.bridgePairs)
            }
          : amp
      )
    })),

  syncChannelParams: (mac, channels) =>
    set((state) => ({
      amps: state.amps.map((amp) => {
        if (amp.mac !== mac) return amp;
        const nextChannelParams: ChannelParams = {
          channels: channels.map((ch) => {
            const loadOhm = amp.constants.channels[ch.channel]?.ohms;
            const { prmsW, ppeakW } = limiterPowerFromLoad(
              ch.rmsLimiter.thresholdVrms,
              ch.peakLimiter.thresholdVp,
              loadOhm
            );
            return {
              channel: ch.channel,
              inputName: ch.inputName,
              outputName: ch.outputName,
              gainIn: ch.gainIn,
              volumeIn: ch.volumeIn,
              muteIn: ch.muteIn,
              delayIn: ch.delayIn,
              trimOut: ch.trimOut,
              muteOut: ch.muteOut,
              noiseGateOut: ch.noiseGateOut,
              delayOut: ch.delayOut,
              invertedOut: ch.invertedOut,
              powerMode: ch.powerMode,
              sourceTypeCode: ch.sourceTypeCode,
              sourceType: ch.sourceType,
              sourceDelay: ch.sourceDelay,
              sourceTrim: ch.sourceTrim,
              sourceInputs: ch.sourceInputs,
              rmsLimiter: { ...ch.rmsLimiter, prmsW },
              peakLimiter: { ...ch.peakLimiter, ppeakW },
              matrix: ch.matrix,
              eqIn: ch.eqIn,
              eqOut: ch.eqOut
            };
          })
        };

        return {
          ...amp,
          channelParams: nextChannelParams,
          channelFlags: deriveChannelFlags(amp.heartbeat, nextChannelParams, amp.bridgePairs)
        };
      })
    })),

  updateAmpChannelOhms: (mac, channelIndex, ohms) =>
    set((state) => ({
      amps: state.amps.map((amp) => {
        if (amp.mac !== mac) return amp;
        const channels = amp.constants.channels.map((ch, i) => (i === channelIndex ? { ...ch, ohms } : ch));
        return {
          ...amp,
          constants: {
            channels,
            linking: amp.constants.linking
          }
        };
      })
    })),

  getDisplayName: (amp) => amp.name ?? amp.lastKnownName ?? amp.customName ?? "Unknown Amp"
}));
