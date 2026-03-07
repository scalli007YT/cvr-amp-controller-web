/**
 * amp-model.ts
 *
 * Browser-safe lookup table for CVR DSP amplifier model specs.
 * No Node.js imports — safe to use in client components and hooks.
 */

/**
 * Rated output RMS voltage by model — from CVR DSP series datasheet.
 * Used to compute maxdB = 20*log10(ratedRmsV) for the output dBu formula.
 *
 * Source: "Output RMS voltage" column in the official spec sheet.
 * The model substring is matched case-insensitively against the device name
 * returned by BASIC_INFO (e.g. "PASCAL ROSE DSP-2004").
 *
 * When FC=27 sync data is implemented, replace this with per-channel RMS_MaxV.
 */
const RATED_RMS_VOLTAGE: Record<string, number> = {
  "DSP-654": 72.1,
  "DSP-802": 80.0,
  "DSP-1002": 89.4,
  "DSP-1004": 89.4,
  "DSP-1502": 109.5,
  "DSP-2002": 126.5,
  "DSP-1504": 109.5,
  "DSP-2004": 126.5,
  "DSP-3002": 154.9,
  "DSP-3004": 154.9,
  "DSP-3302": 162.5,
  "DSP-4302": 185.5,
};

/** Fallback rated RMS voltage when model is unknown. */
const DEFAULT_RATED_RMS = 80.0;

/**
 * Derive maxdB (= 20*log10(ratedRmsV)) from a device name string.
 * Matches the first known model substring found in the name.
 */
export function maxDbFromDeviceName(deviceName: string): number {
  const upper = deviceName.toUpperCase();
  for (const [model, rmsV] of Object.entries(RATED_RMS_VOLTAGE)) {
    if (upper.includes(model.toUpperCase())) {
      return 20 * Math.log10(rmsV);
    }
  }
  return 20 * Math.log10(DEFAULT_RATED_RMS);
}

/**
 * Derive the rated output RMS voltage (V) from a device name string.
 * Returns the lookup value, or DEFAULT_RATED_RMS if unknown.
 */
export function ratedRmsVFromDeviceName(deviceName: string): number {
  const upper = deviceName.toUpperCase();
  for (const [model, rmsV] of Object.entries(RATED_RMS_VOLTAGE)) {
    if (upper.includes(model.toUpperCase())) {
      return rmsV;
    }
  }
  return DEFAULT_RATED_RMS;
}
