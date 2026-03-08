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
 * Confirmed type codes from live binary vs CVR software UI:
 *   0   = Peak
 *   1   = LowShelf
 *   2   = HighShelf
 *   3   = BW-12  (HP/LP filter)
 *   4   = BW-24  (HP/LP filter)
 *   253 = HighShelf (variant — observed on bands that show HS in UI)
 *   255 = Bypassed  (band is inactive regardless of other fields)
 *
 * HP/LP positions (band 0 and band 9) use filter type codes (e.g. 4=BW-24).
 * type=255 means the entire band slot is bypassed.
 */
export const EQ_FILTER_TYPE_NAMES: Record<number, string> = {
  0: "Peak",
  1: "LowShelf",
  2: "HighShelf",
  3: "BW-12",
  4: "BW-24",
  253: "HighShelf",
  255: "Bypass",
};

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
  muteIn: boolean; // true = muted  (uint8 @ 261)
  delayIn: number; // ms  (float32 @ 86)
  trimOut: number; // dB  (float32 @ 80) — output trim
  muteOut: boolean; // true = muted  (wire: 0=muted, 1=unmuted @ 84)
  noiseGateOut: boolean; // true = noise gate enabled  (wire: 0=on, 1=off @ 409)
  delayOut: number; // ms  (float32 @ 90)
  invertedOut: boolean; // true = polarity flipped  (uint8 @ 94)
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
  { field: "muteIn", type: "uint8", offset: 261 },
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
      const channelData = parseChannelFromBuffer(
        ch,
        buffer,
        ch * BYTES_PER_CHANNEL,
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
    //   byte(type) | float32(gain dB) | float32(freq Hz) | float32(Q) | byte(bypass)
    //   type=255 → band is bypassed
    const EQ_BAND_STRIDE = 14;
    const EQ_BANDS = 10;

    const parseEqBlock = (blockOffset: number): EqBand[] =>
      Array.from({ length: EQ_BANDS }, (_, i) => {
        const off = base + blockOffset + i * EQ_BAND_STRIDE;
        const type = buffer.readUInt8(off);
        return {
          type,
          gain: round2(buffer.readFloatLE(off + 1)),
          freq: round2(buffer.readFloatLE(off + 5)),
          q: round2(buffer.readFloatLE(off + 9)),
          bypass: type === 255 || buffer.readUInt8(off + 13) !== 0,
        };
      });

    const eqIn = parseEqBlock(121);
    const eqOut = parseEqBlock(262);

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
    };

    // Peak bypass flag: byte @ offset 116 (1=bypassed, 0=active).
    //   Standalone byte — 4 bytes past the peak threshold float @ 112–115.
    //   The peak threshold float IS stored as normal float32 LE.
    const peakLimiter = {
      enabled: buffer.readUInt8(base + 116) === 0,
      thresholdVp: round2(buffer.readFloatLE(base + 112)),
      holdMs: buffer.readUInt16LE(base + 108),
      releaseMs: buffer.readUInt16LE(base + 110),
    };

    return {
      channel: channelNum,
      inputName: raw.inputName as string,
      outputName: raw.outputName as string,
      gainIn: raw.gainIn as number,
      volumeIn: raw.volumeIn as number,
      muteIn: (raw.muteIn as number) !== 0,
      delayIn: round2(raw.delayIn as number),
      trimOut: raw.trimOut as number,
      muteOut: (raw.muteOut as number) === 0,
      noiseGateOut: (raw.noiseGateOut as number) === 0, // 0=enabled, 1=disabled
      delayOut: round2(raw.delayOut as number),
      invertedOut: (raw.invertedOut as number) !== 0,
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
