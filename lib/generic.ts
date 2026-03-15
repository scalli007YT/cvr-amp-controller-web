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
  loadOhm: number
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
export function limiterVoltageFromPower(powerW: number, loadOhm: number): number {
  const safePower = Math.max(0, powerW);
  const safeLoad = Math.max(loadOhm, Number.EPSILON);
  return Math.sqrt(safePower * safeLoad);
}

/** Bridge mode uses doubled displayed threshold values compared to raw channel values. */
export function bridgeVoltageMultiplier(bridgeMode: boolean): number {
  return bridgeMode ? 2 : 1;
}

/** Clamp load to limiter UI constraints: >= 2 ohm normal, >= 4 ohm bridged. */
export function normalizeLimiterLoadOhm(loadOhm: number | undefined, bridgeMode: boolean): number {
  const minLoad = bridgeMode ? 4 : 2;
  return Math.max(loadOhm ?? minLoad, minLoad);
}

/** Convert raw threshold voltage to the bridge-aware display domain. */
export function toLimiterDisplayVoltage(rawVoltage: number, bridgeMode: boolean): number {
  return rawVoltage * bridgeVoltageMultiplier(bridgeMode);
}

/** Bridge-aware display minimum for RMS threshold voltage. */
export function limiterDisplayMinVrms(minVrms: number, bridgeMode: boolean): number {
  return toLimiterDisplayVoltage(minVrms, bridgeMode);
}

/** Bridge-aware display minimum for peak threshold voltage. */
export function limiterDisplayMinVp(minVp: number, bridgeMode: boolean): number {
  return toLimiterDisplayVoltage(minVp, bridgeMode);
}

/** Bridge-aware display maximum for RMS threshold voltage. */
export function limiterDisplayMaxVrms(maxVrmsRaw: number, bridgeMode: boolean): number {
  return toLimiterDisplayVoltage(maxVrmsRaw, bridgeMode);
}

/** Bridge-aware display maximum for peak threshold voltage. */
export function limiterDisplayMaxVp(maxVpRaw: number, bridgeMode: boolean): number {
  return toLimiterDisplayVoltage(maxVpRaw, bridgeMode);
}

/** Convert bridge-aware display threshold voltage back to raw channel voltage. */
export function fromLimiterDisplayVoltage(displayVoltage: number, bridgeMode: boolean): number {
  return displayVoltage / bridgeVoltageMultiplier(bridgeMode);
}

/**
 * Power in the limiter UI is calculated from displayed threshold voltage and load.
 * This mirrors original bridge behavior where displayed threshold doubles in bridge mode.
 */
export function limiterPowerFromDisplayVoltage(displayVoltage: number, loadOhm: number): number {
  return Math.round((displayVoltage * displayVoltage) / Math.max(loadOhm, Number.EPSILON));
}

/** Convert displayed limiter power back to raw threshold voltage for writes. */
export function limiterRawVoltageFromDisplayPower(powerW: number, loadOhm: number, bridgeMode: boolean): number {
  const displayVoltage = limiterVoltageFromPower(powerW, loadOhm);
  return fromLimiterDisplayVoltage(displayVoltage, bridgeMode);
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
export function voltageToMeterDb(voltage: number, maxVoltage: number | undefined): number | null {
  if (!maxVoltage || voltage <= 0) return null;
  return 20 * Math.log10(voltage / maxVoltage);
}

/** Convert a rated RMS output voltage into its equivalent peak voltage. */
export function rmsToPeakVoltage(ratedRmsV: number | undefined): number | undefined {
  return ratedRmsV ? ratedRmsV * Math.SQRT2 : undefined;
}
