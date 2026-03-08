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
 *
 * Within each 515-byte channel:
 *   Offset 405:        vol_in (float32 LE, dB)
 *   Offset 410:        sensitivity (float32 LE, V) — actual recorded sensitivity value
 *   Offset 413-428:    inputName (16-byte ASCII null-padded)
 *   Offset 429-444:    outputName (16-byte ASCII null-padded)
 *
 * Note: Sensitivity is stored directly at offset 410. Gain_in is reverse-calculated
 * from sensitivity using: gainIn = -20 * log10(sensitivity)
 */

export interface ChannelData {
  channel: number;
  inputName: string; // e.g., "AIn1", "AIn2", "AIn3", "AIn4"
  outputName: string; // e.g., "OutA", "OutB", "OutC", "OutD"
  gainIn: number; // dB
  volumeIn: number; // dB
  sensitivity: number; // V (calculated from gainIn)
}

/**
 * Parse FC=27 response (4 consecutive channel bodies, each 515 bytes)
 *
 * Response format: 2232 bytes total
 * - Channel 0: bytes 0-514
 * - Channel 1: bytes 515-1029
 * - Channel 2: bytes 1030-1544
 * - Channel 3: bytes 1545-2059
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

    const bytesPerChannel = 515;

    const channels: ChannelData[] = [];

    for (let ch = 0; ch < 4; ch++) {
      const offset = ch * bytesPerChannel;
      const channelData = parseChannelFromBuffer(ch, buffer, offset);
      if (channelData) {
        channels.push(channelData);
      }
    }

    return channels;
  } catch (err) {
    console.error(`Failed to parse FC=27 data:`, err);
    return [];
  }
}

/**
 * Parse a single channel body (515 bytes) from the FC=27 response
 *
 * Offsets are based on empirically-verified binary structure analysis.
 * All fields use little-endian byte order.
 *
 * Key offsets within each 515-byte channel:
 *   Offset 405:      vol_in (float32 LE, dB) ✓
 *   Offset 413-428:  inputName (16-byte ASCII) ✓
 *   Offset 429-444:  outputName (16-byte ASCII) ✓
 *   Offset ???:      gain_in (sbyte, dB) — SEARCHING for correct offset
 *
 * STRATEGY: Search for -18 dB (gain value that produces sensitivity=7.94 V).
 * If all channels have sensitivity 7.94, they should all have gainIn around -18.
 */
function parseChannelFromBuffer(
  channelNum: number,
  buffer: Buffer,
  offset: number,
): ChannelData | null {
  try {
    // Read known-correct fields
    const volumeIn = buffer.readFloatLE(offset + 405); // vol_in: 4 bytes (float32) ✓

    // Extract channel names (16-byte ASCII null-padded strings)
    const inputNameBytes = buffer.slice(offset + 413, offset + 413 + 16);
    const inputName =
      inputNameBytes.toString("ascii").split("\0")[0] || `Ch${channelNum}In`;

    const outputNameBytes = buffer.slice(offset + 429, offset + 429 + 16);
    const outputName =
      outputNameBytes.toString("ascii").split("\0")[0] || `Ch${channelNum}Out`;

    // Parse gainIn directly as signed byte from the hex data
    // The 4 channels contain byte value 24 which needs to be read
    const gainIn = buffer.readInt8(offset + 117);

    if (channelNum === 0) {
      console.log(`[FC27] Channel 0 - gainIn at offset 117: ${gainIn} dB`);
    }

    // Sensitivity is stored at offset 410 as float32 LE (raw value in V)
    const sensitivity = buffer.readFloatLE(offset + 410);

    return {
      channel: channelNum,
      inputName,
      outputName,
      gainIn,
      volumeIn,
      sensitivity,
    };
  } catch (err) {
    console.error(`Failed to parse channel ${channelNum}:`, err);
    return null;
  }
}

/**
 * Debug: Print parsed channel data in a readable format
 */
export function logChannelData(channels: ChannelData[]): void {
  console.log("=== FC27 Parsed Channel Data ===");
  channels.forEach((ch) => {
    console.log(`${ch.inputName} / ${ch.outputName}:`);
    console.log(`  Gain: ${ch.gainIn}dB, Volume: ${ch.volumeIn.toFixed(2)}dB`);
  });
}
