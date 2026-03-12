/**
 * Parametric EQ frequency response calculations.
 *
 * Computes the magnitude response (dB) of individual filter bands and their
 * composite sum across the audible range (20 Hz – 20 kHz).
 *
 * Supported filter types:
 *   - Peak (parametric bell)
 *   - LowShelf / HighShelf
 *   - HP/LP rolloffs: Butterworth (BW), Bessel (BE), Linkwitz-Riley (LR)
 *     at 12/18/24/36/48 dB/oct slopes
 */

import type { EqBand } from "@/lib/parse-channel-data";

// ---------------------------------------------------------------------------
// HP/LP slope definitions
// ---------------------------------------------------------------------------

interface HpLpDef {
  /** Filter order (slope = order × 6 dB/oct) */
  order: number;
  /**
   * "bw" = Butterworth (maximally flat magnitude)
   * "be" = Bessel (maximally flat group delay)
   * "lr" = Linkwitz-Riley (cascaded Butterworth pair, always even order)
   */
  family: "bw" | "be" | "lr";
}

/** Map HPLP type code → slope definition. Indices match HPLP_FILTER_TYPE_NAMES. */
const HPLP_DEFS: Record<number, HpLpDef> = {
  0: { order: 2, family: "bw" }, // BW-12
  1: { order: 2, family: "be" }, // BE-12
  2: { order: 2, family: "lr" }, // LR-12
  3: { order: 3, family: "bw" }, // BW-18
  4: { order: 4, family: "bw" }, // BW-24
  5: { order: 4, family: "be" }, // BE-24
  6: { order: 4, family: "lr" }, // LR-24
  7: { order: 6, family: "bw" }, // BW-36
  8: { order: 8, family: "bw" }, // BW-48
  9: { order: 8, family: "be" }, // BE-48
  10: { order: 8, family: "lr" }, // LR-48
};

// ---------------------------------------------------------------------------
// Single-band magnitude response
// ---------------------------------------------------------------------------

/**
 * Compute the gain in dB of a single EQ band at a given frequency.
 *
 * @param band   - EQ band parameters
 * @param freq   - evaluation frequency in Hz
 * @param bandIndex - 0-based index: 0 = HP, 1–8 = parametric, 9 = LP
 */
export function bandGainAt(
  band: EqBand,
  freq: number,
  bandIndex: number,
): number {
  if (band.bypass) return 0;

  // HP (band 0) and LP (band 9) use rolloff filters
  if (bandIndex === 0) return hpGainAt(band, freq);
  if (bandIndex === 9) return lpGainAt(band, freq);

  // Parametric EQ bands (1–8)
  return parametricGainAt(band, freq);
}

/** Peak / LowShelf / HighShelf parametric band gain. */
function parametricGainAt(band: EqBand, freq: number): number {
  const w = freq / band.freq;
  const Q = Math.max(band.q, 0.1);
  const G = band.gain;

  switch (band.type) {
    case 0: {
      // Peak (parametric bell)
      const A = Math.pow(10, G / 40);
      const w2 = w * w;
      const num = w2 * w2 + w2 * ((A * A) / (Q * Q) - 2) + 1;
      const den = w2 * w2 + w2 * (1 / (A * A * Q * Q) - 2) + 1;
      return 10 * Math.log10(num / den);
    }
    case 1: {
      // LowShelf  — matches C# Tone_Low_Shelf
      // A = 10^(G/40), num5 = 1/√((A+1/A)·(1/Q-1)+2)
      // dB = 10·log10(((A-ω²)²+A·(ω/num5)²)/((1/A-ω²)²+(ω/num5)²/A))
      const A = Math.pow(10, G / 40);
      const w2 = w * w;
      const inside = (A + 1 / A) * (1 / Q - 1) + 2;
      const num5 = inside > 0 ? 1 / Math.sqrt(inside) : 1;
      const wn2 = (w / num5) * (w / num5);
      const num = (A - w2) * (A - w2) + A * wn2;
      const den = (1 / A - w2) * (1 / A - w2) + wn2 / A;
      return 10 * Math.log10(num / den);
    }
    case 2: // HighShelf — matches C# Tone_high_Shelf
    case 253: {
      // HighShelf variant (byte 253 = same shelf, different encoding)
      // dB = 10·log10(((1-A·ω²)²+A·(ω/num5)²)/((1-ω²/A)²+(ω/num5)²/A))
      const A = Math.pow(10, G / 40);
      const w2 = w * w;
      const inside = (A + 1 / A) * (1 / Q - 1) + 2;
      const num5 = inside > 0 ? 1 / Math.sqrt(inside) : 1;
      const wn2 = (w / num5) * (w / num5);
      const num = (1 - A * w2) * (1 - A * w2) + A * wn2;
      const den = (1 - w2 / A) * (1 - w2 / A) + wn2 / A;
      return 10 * Math.log10(num / den);
    }
    default:
      return 0;
  }
}

/**
 * High-pass filter gain at a given frequency.
 * Uses the analog prototype |H(jω)|² for the appropriate filter family/order.
 */
function hpGainAt(band: EqBand, freq: number): number {
  const def = HPLP_DEFS[band.type];
  if (!def) return 0;

  // For HP, w = fc / f (inverted relative to LP)
  const w = band.freq / freq;
  return rolloffGainDb(w, def);
}

/**
 * Low-pass filter gain at a given frequency.
 */
function lpGainAt(band: EqBand, freq: number): number {
  const def = HPLP_DEFS[band.type];
  if (!def) return 0;

  const w = freq / band.freq;
  return rolloffGainDb(w, def);
}

/**
 * Compute rolloff gain in dB from normalised frequency ratio w = f/fc.
 * w > 1 is the stopband.
 */
function rolloffGainDb(w: number, def: HpLpDef): number {
  const { order, family } = def;

  if (family === "lr") {
    // Linkwitz-Riley = squared Butterworth of half-order
    const halfOrder = order / 2;
    const bwMagSq = butterworthMagSq(w, halfOrder);
    // LR magnitude² = BW magnitude² squared → LR dB = 2 × BW dB
    return 10 * Math.log10(bwMagSq * bwMagSq);
  }

  if (family === "be") {
    return besselGainDb(w, order);
  }

  // Butterworth
  return 10 * Math.log10(butterworthMagSq(w, order));
}

/**
 * Butterworth low-pass magnitude squared: |H(jω)|² = 1 / (1 + ω^(2n))
 */
function butterworthMagSq(w: number, order: number): number {
  return 1 / (1 + Math.pow(w, 2 * order));
}

/**
 * Bessel filter magnitude response (dB).
 *
 * Uses the exact polynomial coefficients from the CVR firmware (EQ_Math.cs),
 * which normalise the cutoff to the user-set frequency. This matches the
 * curves drawn by the original CVR software.
 *
 * For LP: w = f/fc.  For HP: caller passes w = fc/f (already inverted).
 */
function besselGainDb(w: number, order: number): number {
  const w2 = w * w;

  switch (order) {
    case 2: {
      // -10·log10((1−ω²)² + (1.732·ω)²)
      const re = 1 - w2;
      const im = 1.732 * w;
      return -10 * Math.log10(re * re + im * im);
    }
    case 4: {
      // -10·log10((ω⁴ − 4.392·ω² + 1)² + (−3.124·ω³ + 3.201·ω)²)
      const w4 = w2 * w2;
      const re = w4 - 4.392 * w2 + 1;
      const im = -3.124 * w2 * w + 3.201 * w;
      return -10 * Math.log10(re * re + im * im);
    }
    case 8: {
      // -10·log10((ω⁸−16.7·ω⁶+36.51·ω⁴−17.61·ω²+1)² + (−5.861·ω⁷+29.9·ω⁵−30.9·ω³+6.143·ω)²)
      const w4 = w2 * w2;
      const w6 = w4 * w2;
      const w8 = w4 * w4;
      const re = w8 - 16.7 * w6 + 36.51 * w4 - 17.61 * w2 + 1;
      const im = -5.861 * w6 * w + 29.9 * w4 * w - 30.9 * w2 * w + 6.143 * w;
      return -10 * Math.log10(re * re + im * im);
    }
    default:
      // Fallback for any other order: generic delay-normalised Bessel
      return besselGainDbGeneric(w, order);
  }
}

/** Generic delay-normalised Bessel, used only for orders not in the firmware. */
function besselGainDbGeneric(w: number, order: number): number {
  let re = 0,
    im = 0;
  for (let k = 0; k <= order; k++) {
    const wk = Math.pow(w, k);
    const term = besselCoeff(order, k) * wk;
    switch (k % 4) {
      case 0:
        re += term;
        break;
      case 1:
        im += term;
        break;
      case 2:
        re -= term;
        break;
      case 3:
        im -= term;
        break;
    }
  }
  const a0 = besselCoeff(order, 0);
  return 10 * Math.log10((a0 * a0) / (re * re + im * im));
}

function besselCoeff(n: number, k: number): number {
  return (
    factorial(2 * n - k) /
    (Math.pow(2, n - k) * factorial(k) * factorial(n - k))
  );
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// ---------------------------------------------------------------------------
// Composite EQ curve
// ---------------------------------------------------------------------------

export interface EqCurvePoint {
  freq: number;
  gain: number;
}

/**
 * Compute the summed magnitude response of all bands at 256 log-spaced points.
 * Includes HP/LP rolloff when present.
 */
export function computeEqCurve(bands: EqBand[], points = 256): EqCurvePoint[] {
  const fMin = 20;
  const fMax = 20000;
  const logMin = Math.log10(fMin);
  const logMax = Math.log10(fMax);

  return Array.from({ length: points }, (_, i) => {
    const freq = Math.pow(10, logMin + (i / (points - 1)) * (logMax - logMin));
    let totalGain = 0;
    for (let b = 0; b < bands.length; b++) {
      totalGain += bandGainAt(bands[b], freq, b);
    }
    return {
      freq: Math.round(freq * 100) / 100,
      gain: Math.round(totalGain * 100) / 100,
    };
  });
}

/**
 * Get the gain of the composite curve at a specific band's centre frequency.
 * Used for placing band markers on the curve.
 */
export function curveGainAtBand(bands: EqBand[], bandIndex: number): number {
  const freq = bands[bandIndex].freq;
  let totalGain = 0;
  for (let b = 0; b < bands.length; b++) {
    totalGain += bandGainAt(bands[b], freq, b);
  }
  return Math.round(totalGain * 100) / 100;
}

export const EQ_BAND_LABELS = [
  "HP",
  "EQ1",
  "EQ2",
  "EQ3",
  "EQ4",
  "EQ5",
  "EQ6",
  "EQ7",
  "EQ8",
  "LP",
] as const;

export const EQ_BAND_SHORT_LABELS = [
  "HP",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "LP",
] as const;

export const EQ_FREQ_TICKS = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

export function formatFreq(hz: number): string {
  if (hz >= 1000) return `${hz / 1000}K`;
  return String(Math.round(hz));
}

export function formatFreqFull(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(hz));
}
