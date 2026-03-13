/**
 * Parser for FC=27 (Synchronous_data) packets from DSP-2004 amp
 *
 * Response Structure (2232 bytes total for 4 channels):
 *   2232 bytes = 4 channels × 515 bytes per channel + padding/header
 *
 * Each Channel Body (515 bytes) — Absolute offsets in full response:
 *   Channel 0: starts at byte 0
 *   Channel 1: starts at byte 515
 *   Channel 2: starts at byte 1030
 *   Channel 3: starts at byte 1545
 */

export interface MatrixSource {
  /** Source index (0–3 → AIn1–AIn4) */
  source: number;
  /** Crosspoint gain in dB (float32) */
  gain: number;
  /** false = this source is muted/disabled at this crosspoint */
  active: boolean;
}

/**
 * One parametric EQ band.
 * Wire layout per band (14 bytes, stride 14):
 *   byte(type) | float32(gain dB) | float32(freq Hz) | float32(Q) | byte(bypass)
 *
 * Parametric type codes from the original CVR controller UI:
 *   0  = Peaking
 *   1  = Low_Shelf
 *   2  = High_Shelf
 *   3  = All_Pass-1st
 *   4  = All_Pass-2nd
 *   5  = General_Low
 *   6  = General_High
 *   7  = Butterworth_Low
 *   8  = Butterworth_High
 *   9  = Bessel_Low
 *   10 = Bessel_High
 *   255 = Bypassed (band is inactive regardless of other fields)
 *
 * HP/LP positions (band 0 and band 9) use their own crossover type codes.
 * type=255 means the entire band slot is bypassed.
 */
export const EQ_FILTER_TYPE_NAMES: Record<number, string> = {
  0: "Peaking",
  1: "Low_Shelf",
  2: "High_Shelf",
  3: "All_Pass-1st",
  4: "All_Pass-2nd",
  5: "General_Low",
  6: "General_High",
  7: "Butterworth_Low",
  8: "Butterworth_High",
  9: "Bessel_Low",
  10: "Bessel_High",
};

export interface EqFilterTypeCapabilities {
  supportsGain: boolean;
  supportsQ: boolean;
}

export function getEqFilterTypeCapabilities(
  type: number,
): EqFilterTypeCapabilities {
  switch (type) {
    case 0:
    case 1:
    case 2:
      return { supportsGain: true, supportsQ: true };
    case 3:
      return { supportsGain: false, supportsQ: false };
    case 4:
    case 5:
    case 6:
      return { supportsGain: false, supportsQ: true };
    case 7:
    case 8:
    case 9:
    case 10:
      return { supportsGain: false, supportsQ: false };
    default:
      return { supportsGain: true, supportsQ: true };
  }
}

export const POWER_MODE_NAMES: Record<number, string> = {
  0: "Low-Z",
  1: "70V",
  2: "100V",
};

export function getPowerModeName(mode: number): string {
  return POWER_MODE_NAMES[mode] ?? `Mode ${mode}`;
}

/**
 * HP/LP rolloff filter types — indices match the C# HPorLP_InttoString array.
 * Used by band 0 (HP) and band 9 (LP).
 */
export const HPLP_FILTER_TYPE_NAMES: Record<number, string> = {
  0: "BW-12",
  1: "BE-12",
  2: "LR-12",
  3: "BW-18",
  4: "BW-24",
  5: "BE-24",
  6: "LR-24",
  7: "BW-36",
  8: "BW-48",
  9: "BE-48",
  10: "LR-48",
};

/** Resolve a filter type code to its display name, considering band position. */
export function getFilterTypeName(type: number, bandIndex: number): string {
  // Band 0 (HP) and band 9 (LP) use the HP/LP rolloff lookup
  if (bandIndex === 0 || bandIndex === 9) {
    return (
      HPLP_FILTER_TYPE_NAMES[type] ?? EQ_FILTER_TYPE_NAMES[type] ?? String(type)
    );
  }
  return EQ_FILTER_TYPE_NAMES[type] ?? String(type);
}

export interface EqBand {
  /** Filter type code. 255 = band bypassed. See EQ_FILTER_TYPE_NAMES. */
  type: number;
  /** Gain in dB (float32) */
  gain: number;
  /** Centre/corner frequency in Hz (float32) */
  freq: number;
  /** Q factor (float32) */
  q: number;
  /** true = band is bypassed (type===255 or bypass byte set) */
  bypass: boolean;
}

export interface ChannelData {
  channel: number;
  inputName: string; // e.g., "AIn1" – "AIn4"
  outputName: string; // e.g., "OutA" – "OutD"
  gainIn: number; // dB  (int8)
  volumeIn: number; // dB  (float32)
  muteIn: boolean; // true = muted  (wire: 0=muted, 1=unmuted — inverted)
  delayIn: number; // ms  (float32 @ 86)
  trimOut: number; // dB  (float32 @ 80) — output trim
  muteOut: boolean; // true = muted  (wire: 0=muted, 1=unmuted @ 84)
  noiseGateOut: boolean; // true = noise gate enabled  (wire: 0=on, 1=off @ 409)
  delayOut: number; // ms  (float32 @ 90)
  invertedOut: boolean; // true = polarity flipped  (uint8 @ 94)
  /** Raw dzdy/CPCR mode byte from FC=27. Observed: 0=Low-Z 1=70V 2=100V. */
  powerMode: number;
  /** RMS limiter settings */
  rmsLimiter: {
    /** false = bypassed (wire: byte @102, 1=bypassed, 0=active) */
    enabled: boolean;
    /** Vrms threshold — float32 LE @ 98 */
    thresholdVrms: number;
    /** ms (uint16LE @ 95) */
    attackMs: number;
    /** n × Attack (uint8 @ 97) */
    releaseMultiplier: number;
    /** Power at threshold into the configured load (W). Computed after parse. */
    prmsW: number;
  };
  /** Peak limiter settings */
  peakLimiter: {
    /** false = bypassed (wire: byte @116, 1=bypassed, 0=active) */
    enabled: boolean;
    /** Vp threshold (float32 @ 112) */
    thresholdVp: number;
    /** ms (uint16LE @ 108) */
    holdMs: number;
    /** ms (uint16LE @ 110) */
    releaseMs: number;
    /** Peak power at threshold into the configured load (W). Computed after parse. */
    ppeakW: number;
  };
  /** 4 matrix crosspoint entries — one per input source (offsets 60, 65, 70, 75) */
  matrix: MatrixSource[];
  /** 10-band input EQ (HP + EQ1–8 + LP), starting at offset 121 */
  eqIn: EqBand[];
  /** 10-band output EQ (HP + EQ1–8 + LP), starting at offset 262 */
  eqOut: EqBand[];
}

// ---------------------------------------------------------------------------
// Field layout — edit offsets/lengths here, nothing else needs to change
// ---------------------------------------------------------------------------

const BYTES_PER_CHANNEL = 515;

/**
 * Each entry describes one field within a single 515-byte channel body.
 *
 * type  "int8"    → buffer.readInt8(offset)
 *       "float32" → buffer.readFloatLE(offset)
 *       "ascii"   → buffer.slice(offset, offset + length).toString("ascii"), null-stripped
 */
const CHANNEL_FIELDS = [
  { field: "gainIn", type: "int8", offset: 117 },
  { field: "delayIn", type: "float32", offset: 86 },
  { field: "trimOut", type: "float32", offset: 80 },
  { field: "muteOut", type: "uint8", offset: 84 }, // 0 = muted, 1 = unmuted
  { field: "noiseGateOut", type: "uint8", offset: 409 }, // 0 = enabled, 1 = disabled
  { field: "delayOut", type: "float32", offset: 90 },
  { field: "invertedOut", type: "uint8", offset: 94 },
  { field: "volumeIn", type: "float32", offset: 405 },
  { field: "inputName", type: "ascii", offset: 413, length: 16 },
  { field: "outputName", type: "ascii", offset: 430, length: 16 },
] as const;

/**
 * muteIn lives in the 172-byte trailer that follows the 4 × 515-byte channel bodies.
 * Empirically confirmed by diffing live snapshots with known mute states.
 *
 * Trailer byte layout (relative to trailer start = 4 × 515 = 2060):
 *   rel 132 = ch0 (A)
 *   rel 133 = ch1 (B)
 *   rel 134 = ch2 (C)
 *   rel 135 = ch3 (D)
 *
 * Wire encoding: 0 = muted, 1 = unmuted (active-low / inverted).
 */
const TRAILER_MUTE_IN_OFFSET = 4 * BYTES_PER_CHANNEL + 132; // abs 2192
// Maps channel index → absolute byte offset of its muteIn flag in the trailer
const MUTE_IN_ABS: Record<number, number> = {
  0: TRAILER_MUTE_IN_OFFSET + 0, // ch0 (A) at rel 132
  1: TRAILER_MUTE_IN_OFFSET + 1, // ch1 (B) at rel 133
  2: TRAILER_MUTE_IN_OFFSET + 2, // ch2 (C) at rel 134
  3: TRAILER_MUTE_IN_OFFSET + 3, // ch3 (D) at rel 135
};

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse FC=27 response (4 consecutive channel bodies, each 515 bytes)
 *
 * @param hexData - Raw hex string from FC=27 response
 * @returns Array of 4 ChannelData objects (one per channel)
 */
export function parseFC27Channels(hexData: string): ChannelData[] {
  if (!hexData || hexData.length < 200) {
    console.warn(`FC=27 data too short: ${hexData.length} chars (need ≥200)`);
    return [];
  }

  try {
    const buffer = Buffer.from(hexData, "hex");
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < 4; ch++) {
      // Read muteIn from the trailer (not from the per-channel body)
      const muteInAbs = MUTE_IN_ABS[ch];
      const muteIn =
        muteInAbs < buffer.length ? buffer.readUInt8(muteInAbs) === 0 : true;

      const channelData = parseChannelFromBuffer(
        ch,
        buffer,
        ch * BYTES_PER_CHANNEL,
        muteIn,
      );
      if (channelData) channels.push(channelData);
    }

    return channels;
  } catch (err) {
    console.error(`Failed to parse FC=27 data:`, err);
    return [];
  }
}

function parseChannelFromBuffer(
  channelNum: number,
  buffer: Buffer,
  base: number,
  muteIn: boolean,
): ChannelData | null {
  try {
    // Accumulate raw values by reading each field definition
    const raw: Record<string, number | string> = {};

    for (const def of CHANNEL_FIELDS) {
      const abs = base + def.offset;
      switch (def.type) {
        case "int8":
          raw[def.field] = buffer.readInt8(abs);
          break;
        case "uint8":
          raw[def.field] = buffer.readUInt8(abs);
          break;
        case "float32":
          raw[def.field] = buffer.readFloatLE(abs);
          break;
        case "ascii":
          raw[def.field] =
            buffer
              .slice(abs, abs + def.length)
              .toString("ascii")
              .split("\0")[0] || `Ch${channelNum}${def.field}`;
          break;
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Matrix: 4 sources × 5-byte struct [float32 gain][uint8 active] starting at offset 60
    const MATRIX_BASE = 60;
    const MATRIX_STRIDE = 5;
    const matrix: MatrixSource[] = [0, 1, 2, 3].map((src) => {
      const off = base + MATRIX_BASE + src * MATRIX_STRIDE;
      return {
        source: src,
        gain: round2(buffer.readFloatLE(off)),
        active: buffer.readUInt8(off + 4) !== 0,
      };
    });

    // EQ bands: 10 bands × 14-byte struct per band
    //   sbyte(type) | float32(gain dB) | float32(freq Hz) | float32(Q) | byte(bypass)
    //
    // Bypass is encoded in the sign of the type byte (C# sbyte convention):
    //   rawType >= 128  → band is bypassed; actual filter type = 255 - rawType
    //   e.g. 253 (0xFD = sbyte -3) = bypassed HighShelf (type 2)
    //        254 (0xFE = sbyte -2) = bypassed LowShelf  (type 1)
    //        255 (0xFF = sbyte -1) = bypassed Peak       (type 0)
    // The 14th byte is a secondary bypass flag; either condition means bypass.
    const EQ_BAND_STRIDE = 14;
    const EQ_BANDS = 10;

    const parseEqBlock = (blockOffset: number): EqBand[] =>
      Array.from({ length: EQ_BANDS }, (_, i) => {
        const off = base + blockOffset + i * EQ_BAND_STRIDE;
        const rawType = buffer.readUInt8(off);
        const isBypassEncoded = rawType >= 128; // negative sbyte = band bypassed
        const type = isBypassEncoded ? 255 - rawType : rawType;
        const bypass = isBypassEncoded || buffer.readUInt8(off + 13) !== 0;
        return {
          type,
          gain: round2(buffer.readFloatLE(off + 1)),
          freq: round2(buffer.readFloatLE(off + 5)),
          q: round2(buffer.readFloatLE(off + 9)),
          bypass,
        };
      });

    const eqIn = parseEqBlock(121);
    const eqOut = parseEqBlock(262);

    // Raw output power/distribution mode (C# dzdy / CPCR byte).
    // Layout matches the original sync structs: output EQ block including its
    // trailing bypass byte ends at offset 402, followed by dzdy at 403.
    const powerMode = buffer.readUInt8(base + 403);

    // Limiter fields (mixed types — parsed directly, not via CHANNEL_FIELDS)
    //
    // RMS threshold: standard float32 LE at offset 98.
    // RMS bypass flag: uint8 at offset 102 (1=bypassed, 0=active) — separate byte,
    //   not part of the float. During bypass the device happens to set byte 102=1
    //   which corrupted earlier reads when offset 100 was (wrongly) assumed as the start.
    const rmsLimiter = {
      enabled: buffer.readUInt8(base + 102) === 0,
      thresholdVrms: round2(buffer.readFloatLE(base + 98)),
      attackMs: buffer.readUInt16LE(base + 95),
      releaseMultiplier: buffer.readUInt8(base + 97),
      prmsW: 0, // computed by the store after parse (depends on configured load impedance)
    };

    // Peak bypass flag: byte @ offset 116 (1=bypassed, 0=active).
    //   Standalone byte — 4 bytes past the peak threshold float @ 112–115.
    //   The peak threshold float IS stored as normal float32 LE.
    const peakLimiter = {
      enabled: buffer.readUInt8(base + 116) === 0,
      thresholdVp: round2(buffer.readFloatLE(base + 112)),
      holdMs: buffer.readUInt16LE(base + 108),
      releaseMs: buffer.readUInt16LE(base + 110),
      ppeakW: 0, // computed by the store after parse (depends on configured load impedance)
    };

    return {
      channel: channelNum,
      inputName: raw.inputName as string,
      outputName: raw.outputName as string,
      gainIn: raw.gainIn as number,
      volumeIn: raw.volumeIn as number,
      muteIn,
      delayIn: round2(raw.delayIn as number),
      trimOut: raw.trimOut as number,
      muteOut: (raw.muteOut as number) === 0,
      noiseGateOut: (raw.noiseGateOut as number) === 0, // 0=enabled, 1=disabled
      delayOut: round2(raw.delayOut as number),
      invertedOut: (raw.invertedOut as number) !== 0,
      powerMode,
      rmsLimiter,
      peakLimiter,
      matrix,
      eqIn,
      eqOut,
    };
  } catch (err) {
    console.error(`Failed to parse channel ${channelNum}:`, err);
    return null;
  }
}
