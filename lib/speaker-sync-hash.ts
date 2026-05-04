/**
 * Speaker Sync Hash — Lightweight configuration fingerprinting for speaker processing.
 *
 * Generates a deterministic 4-character hex hash (CRC-16) from the speaker-processing
 * subset of an FC=27 channel response. This hash is appended to the output channel name
 * after applying speaker config, enabling post-power-cycle integrity verification.
 *
 * Format in channel name: "UserName_A91C"
 * Detection pattern: /_[0-9A-Fa-f]{4}$/
 *
 * Hashed byte ranges (per 515-byte channel body):
 *   - Delay Out:     offset 90–93   (float32, time alignment)
 *   - Polarity:      offset 94      (uint8, inverted)
 *   - RMS Limiter:   offset 95–102  (attack, release, threshold, bypass)
 *   - Peak Limiter:  offset 108–116 (hold, release, threshold, bypass)
 *   - EQ Input:      offset 121–260 (10 bands × 14 bytes)
 *   - EQ Output:     offset 262–401 (10 bands × 14 bytes)
 *   - Power Mode:    offset 403     (uint8, dzdy/CPCR)
 *   - FIR Bypass:    offset 404     (uint8)
 *
 * Excluded (operational/runtime):
 *   - gainIn, volumeOut, trimOut, muteIn, muteOut, noiseGateOut
 *   - source selection, source delays/trims, matrix routing
 *   - input/output names
 */

import type { ChannelData, EqBand } from "@/lib/parse-channel-data";

// ---------------------------------------------------------------------------
// CRC-16/CCITT (XModem variant) — deterministic, no salt
// ---------------------------------------------------------------------------

const CRC16_POLY = 0x1021;

function crc16(data: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ CRC16_POLY : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

// ---------------------------------------------------------------------------
// Speaker-processing byte extraction from raw FC=27 buffer
// ---------------------------------------------------------------------------

/** Byte ranges within a 515-byte channel body that define speaker processing identity. */
const SPEAKER_HASH_RANGES: Array<{ start: number; end: number }> = [
  { start: 90, end: 94 }, // delayOut (float32)
  { start: 94, end: 95 }, // invertedOut (uint8)
  { start: 95, end: 103 }, // RMS limiter block
  { start: 108, end: 117 }, // Peak limiter block
  { start: 121, end: 261 }, // EQ Input (10 × 14 bytes)
  { start: 262, end: 402 }, // EQ Output (10 × 14 bytes)
  { start: 403, end: 404 }, // Power mode
  { start: 404, end: 405 } // FIR bypass
];

/**
 * Compute the speaker sync hash from a raw FC=27 channel body (515 bytes).
 * Returns a 4-character uppercase hex string (e.g. "A91C").
 */
export function computeSyncHashFromBuffer(channelBody: Buffer): string {
  const chunks: Buffer[] = [];
  for (const range of SPEAKER_HASH_RANGES) {
    chunks.push(channelBody.subarray(range.start, range.end));
  }
  const combined = Buffer.concat(chunks);
  const hash = crc16(new Uint8Array(combined));
  return hash.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Compute the speaker sync hash from a parsed ChannelData object.
 * Serializes the speaker-processing fields into a canonical byte sequence
 * and hashes them. This produces the same result as computeSyncHashFromBuffer
 * when given equivalent data.
 */
export function computeSyncHashFromParsed(channel: ChannelData): string {
  const buf = Buffer.alloc(300); // oversized, we'll use only what we write
  let offset = 0;

  // delayOut (float32)
  buf.writeFloatLE(channel.delayOut, offset);
  offset += 4;

  // invertedOut (uint8)
  buf.writeUInt8(channel.invertedOut ? 1 : 0, offset);
  offset += 1;

  // RMS Limiter: attackMs(u16) + releaseMultiplier(u8) + thresholdVrms(f32) + bypass(u8)
  buf.writeUInt16LE(channel.rmsLimiter.attackMs, offset);
  offset += 2;
  buf.writeUInt8(channel.rmsLimiter.releaseMultiplier, offset);
  offset += 1;
  buf.writeFloatLE(channel.rmsLimiter.thresholdVrms, offset);
  offset += 4;
  buf.writeUInt8(channel.rmsLimiter.enabled ? 0 : 1, offset); // wire: 0=active, 1=bypassed
  offset += 1;

  // Peak Limiter: holdMs(u16) + releaseMs(u16) + thresholdVp(f32) + bypass(u8)
  buf.writeUInt16LE(channel.peakLimiter.holdMs, offset);
  offset += 2;
  buf.writeUInt16LE(channel.peakLimiter.releaseMs, offset);
  offset += 2;
  buf.writeFloatLE(channel.peakLimiter.thresholdVp, offset);
  offset += 4;
  buf.writeUInt8(channel.peakLimiter.enabled ? 0 : 1, offset); // wire: 0=active, 1=bypassed
  offset += 1;

  // EQ bands (input + output): type(u8) + gain(f32) + freq(f32) + q(f32) + bypass(u8) = 14 bytes each
  const writeEqBands = (bands: EqBand[]) => {
    for (const band of bands) {
      const rawType = band.bypass ? 255 - band.type : band.type;
      buf.writeUInt8(rawType, offset);
      offset += 1;
      buf.writeFloatLE(band.gain, offset);
      offset += 4;
      buf.writeFloatLE(band.freq, offset);
      offset += 4;
      buf.writeFloatLE(band.q, offset);
      offset += 4;
      buf.writeUInt8(band.bypass ? 1 : 0, offset);
      offset += 1;
    }
  };

  // Reallocate if needed (10 bands × 14 bytes × 2 = 280 more bytes)
  const eqBuf = Buffer.alloc(280 + 2);
  let eqOffset = 0;

  const writeEqBandsToEqBuf = (bands: EqBand[]) => {
    for (const band of bands) {
      const rawType = band.bypass ? 255 - band.type : band.type;
      eqBuf.writeUInt8(rawType, eqOffset);
      eqOffset += 1;
      eqBuf.writeFloatLE(band.gain, eqOffset);
      eqOffset += 4;
      eqBuf.writeFloatLE(band.freq, eqOffset);
      eqOffset += 4;
      eqBuf.writeFloatLE(band.q, eqOffset);
      eqOffset += 4;
      eqBuf.writeUInt8(band.bypass ? 1 : 0, eqOffset);
      eqOffset += 1;
    }
  };

  writeEqBandsToEqBuf(channel.eqIn);
  writeEqBandsToEqBuf(channel.eqOut);

  // Power mode (uint8)
  eqBuf.writeUInt8(channel.powerMode, eqOffset);
  eqOffset += 1;

  // FIR bypass (uint8)
  eqBuf.writeUInt8(channel.firBypassed ? 1 : 0, eqOffset);
  eqOffset += 1;

  // Combine prefix + EQ block
  const combined = Buffer.concat([buf.subarray(0, offset), eqBuf.subarray(0, eqOffset)]);
  const hash = crc16(new Uint8Array(combined));
  return hash.toString(16).toUpperCase().padStart(4, "0");
}

// ---------------------------------------------------------------------------
// Channel name hash embedding & extraction
// ---------------------------------------------------------------------------

/** Regex pattern matching a sync hash suffix at the end of a channel name. */
const HASH_SUFFIX_PATTERN = /_([0-9A-Fa-f]{4})$/;

/** Maximum characters available for user name portion (16 total - 1 underscore - 4 hash). */
export const SYNC_HASH_USER_NAME_MAX = 11;

/** Separator between user name and hash. */
export const SYNC_HASH_SEPARATOR = "_";

/** Length of the hash suffix including separator. */
export const SYNC_HASH_SUFFIX_LENGTH = 5; // "_XXXX"

/**
 * Embed a sync hash into a channel name.
 * Truncates the user-provided name if it exceeds available space.
 *
 * @param baseName - User-chosen channel name (will be trimmed/truncated)
 * @param hash - 4-char hex hash string
 * @returns Channel name with hash suffix, max 16 chars total
 */
export function embedHashInName(baseName: string, hash: string): string {
  const trimmed = baseName.trim().slice(0, SYNC_HASH_USER_NAME_MAX);
  return `${trimmed}${SYNC_HASH_SEPARATOR}${hash}`;
}

/**
 * Extract a sync hash from a channel name, if present.
 *
 * @returns The 4-char hash string, or null if no valid hash suffix found
 */
export function extractHashFromName(channelName: string): string | null {
  const match = channelName.match(HASH_SUFFIX_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract the user-chosen base name portion (without the hash suffix).
 *
 * @returns The base name without trailing _XXXX, or the full name if no hash present
 */
export function extractBaseNameFromName(channelName: string): string {
  return channelName.replace(HASH_SUFFIX_PATTERN, "");
}

// ---------------------------------------------------------------------------
// Sync validation result
// ---------------------------------------------------------------------------

export type SyncStatus = "synced" | "drifted" | "unknown";

export interface ChannelSyncResult {
  channel: number;
  outputName: string;
  status: SyncStatus;
  expectedHash: string | null;
  currentHash: string;
}

/**
 * Validate sync state for a single channel.
 * Compares the hash embedded in the channel name against the current DSP state hash.
 */
export function validateChannelSync(channel: ChannelData): ChannelSyncResult {
  const currentHash = computeSyncHashFromParsed(channel);
  const expectedHash = extractHashFromName(channel.outputName);

  let status: SyncStatus;
  if (!expectedHash) {
    status = "unknown";
  } else if (expectedHash === currentHash) {
    status = "synced";
  } else {
    status = "drifted";
  }

  return {
    channel: channel.channel,
    outputName: channel.outputName,
    status,
    expectedHash,
    currentHash
  };
}

/**
 * Validate sync state for all channels of an amp.
 */
export function validateAllChannelsSync(channels: ChannelData[]): ChannelSyncResult[] {
  return channels.map(validateChannelSync);
}
