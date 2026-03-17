/**
 * copy-paste-ts.ts
 *
 * Generic copy-paste library controller for CVR amplifier settings.
 * Supports copying and pasting various settings with origin validation
 * to prevent mismatched data types.
 *
 * Features:
 *   - Generic copy/paste framework with origin tagging
 *   - EQ band copy/paste (10-band parametric)
 *   - RMS limiter copy/paste
 *   - Peak limiter copy/paste
 *   - Type-safe error handling for origin mismatches
 */

import type { EqBand } from "@/lib/parse-channel-data";

// ---------------------------------------------------------------------------
// Core copy-paste types
// ---------------------------------------------------------------------------

/** Origin identifier for clipboard data validation */
export type CopyPasteOrigin = "eq" | "rms-limiter" | "peak-limiter";

/**
 * Generic clipboard data structure with origin tracking.
 * Prevents accidental pasting of incompatible data types.
 */
export interface CopyPasteData<T> {
  /** Type identifier for origin validation */
  origin: CopyPasteOrigin;
  /** Timestamp when data was copied (ms since epoch) */
  timestamp: number;
  /** The actual copied data */
  data: T;
}

/**
 * Error thrown when attempting to paste data with mismatched origin.
 */
export class CopyPasteOriginMismatchError extends Error {
  constructor(expected: CopyPasteOrigin, received: CopyPasteOrigin) {
    super(`Cannot paste ${received} data into ${expected} field. ` + `Expected origin: ${expected}, got: ${received}`);
    this.name = "CopyPasteOriginMismatchError";
  }
}

/**
 * Error thrown when clipboard data is invalid or corrupted.
 */
export class CopyPasteDataError extends Error {
  constructor(message: string) {
    super(`Invalid clipboard data: ${message}`);
    this.name = "CopyPasteDataError";
  }
}

// ---------------------------------------------------------------------------
// Generic copy-paste operations
// ---------------------------------------------------------------------------

/**
 * Create a copy-paste data object with origin tracking.
 *
 * @param origin - The origin type identifier
 * @param data - The data to store in the clipboard
 * @returns A copy-paste data structure ready for serialization
 */
export function createCopyPasteData<T>(origin: CopyPasteOrigin, data: T): CopyPasteData<T> {
  return {
    origin,
    timestamp: Date.now(),
    data
  };
}

/**
 * Validate clipboard data origin before pasting.
 *
 * @param clipboard - The clipboard data to validate
 * @param expectedOrigin - The expected origin type
 * @throws CopyPasteOriginMismatchError if origins don't match
 * @throws CopyPasteDataError if data is invalid
 */
export function validatePasteOrigin<T>(clipboard: CopyPasteData<T>, expectedOrigin: CopyPasteOrigin): void {
  if (!clipboard || typeof clipboard !== "object") {
    throw new CopyPasteDataError("Clipboard data is not a valid object");
  }

  if (!("origin" in clipboard) || !("data" in clipboard)) {
    throw new CopyPasteDataError("Clipboard data missing required fields (origin, data)");
  }

  if (clipboard.origin !== expectedOrigin) {
    throw new CopyPasteOriginMismatchError(expectedOrigin, clipboard.origin);
  }
}

/**
 * Extract and validate data from clipboard with origin checking.
 *
 * @param clipboard - The clipboard data
 * @param expectedOrigin - The expected origin type
 * @returns The extracted data
 * @throws CopyPasteOriginMismatchError or CopyPasteDataError on validation failure
 */
export function extractPasteData<T>(clipboard: CopyPasteData<T>, expectedOrigin: CopyPasteOrigin): T {
  validatePasteOrigin(clipboard, expectedOrigin);
  return clipboard.data;
}

// ---------------------------------------------------------------------------
// EQ copy-paste operations
// ---------------------------------------------------------------------------

/**
 * Copy an entire 10-band EQ (HP + 8 parametric + LP).
 * Creates a clipboard entry with EQ origin tag.
 *
 * @param eqBands - Array of 10 EQ bands (band 0=HP, 1-8=parametric, 9=LP)
 * @returns Clipboard data ready for serialization or storing in state
 */
export function copyEq(eqBands: EqBand[]): CopyPasteData<EqBand[]> {
  if (!Array.isArray(eqBands) || eqBands.length === 0) {
    throw new CopyPasteDataError("EQ bands must be a non-empty array");
  }

  // Deep copy to ensure independence from source
  const eqCopy = eqBands.map((band) => ({ ...band }));

  return createCopyPasteData<EqBand[]>("eq", eqCopy);
}

/**
 * Paste EQ settings from clipboard.
 * Validates origin before applying.
 *
 * @param clipboard - The clipboard data
 * @returns The EQ bands from clipboard
 * @throws CopyPasteOriginMismatchError if clipboard contains non-EQ data
 * @throws CopyPasteDataError if clipboard data is invalid
 */
export function pasteEq(clipboard: CopyPasteData<EqBand[]>): EqBand[] {
  const eqBands = extractPasteData(clipboard, "eq");

  // Validate EQ structure
  if (!Array.isArray(eqBands)) {
    throw new CopyPasteDataError("EQ data must be an array");
  }

  // Deep copy to ensure independence from clipboard
  return eqBands.map((band) => ({
    type: band.type,
    gain: band.gain,
    freq: band.freq,
    q: band.q,
    bypass: band.bypass
  }));
}

/**
 * Check if clipboard contains valid EQ data.
 *
 * @param clipboard - The clipboard data to check
 * @returns true if clipboard contains valid EQ data, false otherwise
 */
export function hasEqData(clipboard: unknown): clipboard is CopyPasteData<EqBand[]> {
  if (!clipboard || typeof clipboard !== "object") return false;
  const data = clipboard as CopyPasteData<unknown>;
  return data.origin === "eq" && Array.isArray(data.data);
}

// ---------------------------------------------------------------------------
// RMS Limiter copy-paste operations
// ---------------------------------------------------------------------------

export interface RmsLimiterData {
  enabled: boolean;
  thresholdVrms: number;
  attackMs: number;
  releaseMultiplier: number;
}

/**
 * Copy RMS limiter settings.
 * Creates a clipboard entry with rms-limiter origin tag.
 *
 * @param limiter - RMS limiter settings
 * @returns Clipboard data ready for serialization or storing in state
 */
export function copyRmsLimiter(limiter: RmsLimiterData): CopyPasteData<RmsLimiterData> {
  if (!limiter || typeof limiter !== "object") {
    throw new CopyPasteDataError("RMS limiter must be a valid object");
  }

  // Validate required fields
  if (typeof limiter.enabled !== "boolean") {
    throw new CopyPasteDataError("RMS limiter missing or invalid 'enabled' field");
  }
  if (typeof limiter.thresholdVrms !== "number") {
    throw new CopyPasteDataError("RMS limiter missing or invalid 'thresholdVrms' field");
  }
  if (typeof limiter.attackMs !== "number") {
    throw new CopyPasteDataError("RMS limiter missing or invalid 'attackMs' field");
  }
  if (typeof limiter.releaseMultiplier !== "number") {
    throw new CopyPasteDataError("RMS limiter missing or invalid 'releaseMultiplier' field");
  }

  return createCopyPasteData<RmsLimiterData>("rms-limiter", { ...limiter });
}

/**
 * Paste RMS limiter settings from clipboard.
 * Validates origin before applying.
 *
 * @param clipboard - The clipboard data
 * @returns The RMS limiter settings from clipboard
 * @throws CopyPasteOriginMismatchError if clipboard contains non-RMS-limiter data
 * @throws CopyPasteDataError if clipboard data is invalid
 */
export function pasteRmsLimiter(clipboard: CopyPasteData<RmsLimiterData>): RmsLimiterData {
  const limiter = extractPasteData(clipboard, "rms-limiter");

  // Validate structure
  if (typeof limiter.enabled !== "boolean") {
    throw new CopyPasteDataError("RMS limiter 'enabled' must be a boolean");
  }
  if (typeof limiter.thresholdVrms !== "number" || !isFinite(limiter.thresholdVrms)) {
    throw new CopyPasteDataError("RMS limiter 'thresholdVrms' must be a finite number");
  }
  if (typeof limiter.attackMs !== "number" || !isFinite(limiter.attackMs)) {
    throw new CopyPasteDataError("RMS limiter 'attackMs' must be a finite number");
  }
  if (typeof limiter.releaseMultiplier !== "number" || !isFinite(limiter.releaseMultiplier)) {
    throw new CopyPasteDataError("RMS limiter 'releaseMultiplier' must be a finite number");
  }

  return {
    enabled: limiter.enabled,
    thresholdVrms: limiter.thresholdVrms,
    attackMs: limiter.attackMs,
    releaseMultiplier: limiter.releaseMultiplier
  };
}

/**
 * Check if clipboard contains valid RMS limiter data.
 *
 * @param clipboard - The clipboard data to check
 * @returns true if clipboard contains valid RMS limiter data, false otherwise
 */
export function hasRmsLimiterData(clipboard: unknown): clipboard is CopyPasteData<RmsLimiterData> {
  if (!clipboard || typeof clipboard !== "object") return false;
  const data = clipboard as CopyPasteData<unknown>;
  return data.origin === "rms-limiter";
}

// ---------------------------------------------------------------------------
// Peak Limiter copy-paste operations
// ---------------------------------------------------------------------------

export interface PeakLimiterData {
  enabled: boolean;
  thresholdVp: number;
  holdMs: number;
  releaseMs: number;
}

/**
 * Copy Peak limiter settings.
 * Creates a clipboard entry with peak-limiter origin tag.
 *
 * @param limiter - Peak limiter settings
 * @returns Clipboard data ready for serialization or storing in state
 */
export function copyPeakLimiter(limiter: PeakLimiterData): CopyPasteData<PeakLimiterData> {
  if (!limiter || typeof limiter !== "object") {
    throw new CopyPasteDataError("Peak limiter must be a valid object");
  }

  // Validate required fields
  if (typeof limiter.enabled !== "boolean") {
    throw new CopyPasteDataError("Peak limiter missing or invalid 'enabled' field");
  }
  if (typeof limiter.thresholdVp !== "number") {
    throw new CopyPasteDataError("Peak limiter missing or invalid 'thresholdVp' field");
  }
  if (typeof limiter.holdMs !== "number") {
    throw new CopyPasteDataError("Peak limiter missing or invalid 'holdMs' field");
  }
  if (typeof limiter.releaseMs !== "number") {
    throw new CopyPasteDataError("Peak limiter missing or invalid 'releaseMs' field");
  }

  return createCopyPasteData<PeakLimiterData>("peak-limiter", { ...limiter });
}

/**
 * Paste Peak limiter settings from clipboard.
 * Validates origin before applying.
 *
 * @param clipboard - The clipboard data
 * @returns The Peak limiter settings from clipboard
 * @throws CopyPasteOriginMismatchError if clipboard contains non-peak-limiter data
 * @throws CopyPasteDataError if clipboard data is invalid
 */
export function pastePeakLimiter(clipboard: CopyPasteData<PeakLimiterData>): PeakLimiterData {
  const limiter = extractPasteData(clipboard, "peak-limiter");

  // Validate structure
  if (typeof limiter.enabled !== "boolean") {
    throw new CopyPasteDataError("Peak limiter 'enabled' must be a boolean");
  }
  if (typeof limiter.thresholdVp !== "number" || !isFinite(limiter.thresholdVp)) {
    throw new CopyPasteDataError("Peak limiter 'thresholdVp' must be a finite number");
  }
  if (typeof limiter.holdMs !== "number" || !isFinite(limiter.holdMs)) {
    throw new CopyPasteDataError("Peak limiter 'holdMs' must be a finite number");
  }
  if (typeof limiter.releaseMs !== "number" || !isFinite(limiter.releaseMs)) {
    throw new CopyPasteDataError("Peak limiter 'releaseMs' must be a finite number");
  }

  return {
    enabled: limiter.enabled,
    thresholdVp: limiter.thresholdVp,
    holdMs: limiter.holdMs,
    releaseMs: limiter.releaseMs
  };
}

/**
 * Check if clipboard contains valid Peak limiter data.
 *
 * @param clipboard - The clipboard data to check
 * @returns true if clipboard contains valid Peak limiter data, false otherwise
 */
export function hasPeakLimiterData(clipboard: unknown): clipboard is CopyPasteData<PeakLimiterData> {
  if (!clipboard || typeof clipboard !== "object") return false;
  const data = clipboard as CopyPasteData<unknown>;
  return data.origin === "peak-limiter";
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Serialize clipboard data to JSON string for storage/transmission.
 *
 * @param clipboard - The clipboard data to serialize
 * @returns JSON string representation
 */
export function serializeClipboard<T>(clipboard: CopyPasteData<T>): string {
  return JSON.stringify(clipboard);
}

/**
 * Deserialize clipboard data from JSON string.
 *
 * @param json - JSON string from serialization
 * @returns Parsed clipboard data
 * @throws CopyPasteDataError if JSON is invalid
 */
export function deserializeClipboard<T>(json: string): CopyPasteData<T> {
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new CopyPasteDataError(`Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get a human-readable description of clipboard contents.
 * Useful for UI labels and status messages.
 *
 * @param clipboard - The clipboard data
 * @returns Description string (e.g., "EQ (10 bands)", "RMS Limiter", "Peak Limiter")
 */
export function getClipboardDescription(clipboard: unknown): string {
  if (!clipboard || typeof clipboard !== "object") {
    return "Invalid clipboard data";
  }

  const data = clipboard as CopyPasteData<unknown>;

  switch (data.origin) {
    case "eq":
      if (Array.isArray(data.data)) {
        return `EQ (${data.data.length} bands)`;
      }
      return "EQ";
    case "rms-limiter":
      return "RMS Limiter";
    case "peak-limiter":
      return "Peak Limiter";
    default:
      return `Unknown (${data.origin})`;
  }
}
