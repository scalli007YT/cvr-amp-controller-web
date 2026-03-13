/**
 * generic.ts
 *
 * Shared pure utility functions used across the application.
 */

/**
 * Format a runtime value (in minutes) as a human-readable string.
 * e.g. 125 → "2h 5min"
 */
export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}min`;
}

/**
 * Format a dBFS value for display.
 * Returns "---" for null or values at/below the noise floor (≤ -100 dBFS).
 */
export function formatDbfs(v: number | null): string {
  return v === null || v <= -100 ? "---" : v.toFixed(0);
}

/**
 * Small rolling median filter for numeric telemetry/state values.
 *
 * Designed for short windows (3 or 5) to remove single-sample flicker.
 * For odd window sizes, the median stays on a real sample value.
 */
export class RollingMedianFilter {
  private buf: number[] = [];
  private last: number | null = null;

  constructor(private readonly windowSize: number = 3) {}

  push(value: number | null | undefined): number | null {
    if (value == null || !isFinite(value)) return this.last;
    this.buf.push(value);
    if (this.buf.length > this.windowSize) this.buf.shift();

    const s = [...this.buf].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    const med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    this.last = med;
    return med;
  }

  reset(): void {
    this.buf = [];
    this.last = null;
  }
}

/**
 * Calculate RMS and peak power from limiter threshold voltages and load impedance.
 *
 *   P_rms  = V_rms²  / Z
 *   P_peak = V_peak² / Z
 *
 * @param thresholdVrms  - RMS limiter threshold voltage (Vrms)
 * @param thresholdVp    - Peak limiter threshold voltage (Vpeak)
 * @param loadOhm        - Nominal load impedance in Ω
 * @returns Object with `prmsW` and `ppeakW` rounded to the nearest watt.
 */
export function limiterPowerFromLoad(
  thresholdVrms: number,
  thresholdVp: number,
  loadOhm: number,
): { prmsW: number; ppeakW: number } {
  const prmsW = Math.round((thresholdVrms * thresholdVrms) / loadOhm);
  const ppeakW = Math.round((thresholdVp * thresholdVp) / loadOhm);
  return { prmsW, ppeakW };
}

/**
 * Convert limiter power back to the corresponding threshold voltage.
 *
 *   V = sqrt(P * Z)
 *
 * This works for both RMS and peak domains as long as the supplied power value
 * matches the target voltage domain and the same nominal load is used.
 */
export function limiterVoltageFromPower(
  powerW: number,
  loadOhm: number,
): number {
  const safePower = Math.max(0, powerW);
  const safeLoad = Math.max(loadOhm, Number.EPSILON);
  return Math.sqrt(safePower * safeLoad);
}

/**
 * Convert a voltage to the output meter scale used by the original CVR app.
 *
 * The output meter is not absolute dBu. It is a relative dB scale referenced
 * to the channel's maximum output voltage:
 *   dB = 20 * log10(voltage / maxVoltage)
 *
 * For RMS values, pass the channel's RMS max voltage.
 * For peak values, pass the channel's peak max voltage.
 * Returns `null` when `maxVoltage` is unknown or `voltage` ≤ 0.
 */
export function voltageToMeterDb(
  voltage: number,
  maxVoltage: number | undefined,
): number | null {
  if (!maxVoltage || voltage <= 0) return null;
  return 20 * Math.log10(voltage / maxVoltage);
}

/** Convert a rated RMS output voltage into its equivalent peak voltage. */
export function rmsToPeakVoltage(
  ratedRmsV: number | undefined,
): number | undefined {
  return ratedRmsV ? ratedRmsV * Math.SQRT2 : undefined;
}
