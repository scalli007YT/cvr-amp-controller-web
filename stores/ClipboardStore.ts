/**
 * ClipboardStore.ts
 *
 * Zustand store for copy-paste clipboard management.
 * Allows copying settings from one amp/channel and pasting to another.
 * Supports EQ, RMS Limiter, and Peak Limiter with origin validation.
 */

import { create } from "zustand";
import {
  type CopyPasteData,
  type CopyPasteOrigin,
  copyEq,
  pasteEq,
  hasEqData,
  copyRmsLimiter,
  pasteRmsLimiter,
  hasRmsLimiterData,
  copyPeakLimiter,
  pastePeakLimiter,
  hasPeakLimiterData,
  CopyPasteOriginMismatchError,
  CopyPasteDataError,
  getClipboardDescription,
  type RmsLimiterData,
  type PeakLimiterData
} from "@/lib/copy-paste";
import type { EqBand } from "@/stores/AmpStore";

export interface ClipboardState {
  /** The current clipboard data, or null if empty */
  clipboard: CopyPasteData<unknown> | null;

  /** Human-readable description of clipboard contents */
  description: string | null;

  /** Copy EQ settings to clipboard */
  copyEq: (bands: EqBand[]) => void;

  /** Paste EQ settings from clipboard */
  pasteEq: () => EqBand[] | null;

  /** Check if clipboard contains valid EQ data */
  canPasteEq: () => boolean;

  /** Copy RMS Limiter settings to clipboard */
  copyRmsLimiter: (limiter: RmsLimiterData) => void;

  /** Paste RMS Limiter settings from clipboard */
  pasteRmsLimiter: () => RmsLimiterData | null;

  /** Check if clipboard contains valid RMS Limiter data */
  canPasteRmsLimiter: () => boolean;

  /** Copy Peak Limiter settings to clipboard */
  copyPeakLimiter: (limiter: PeakLimiterData) => void;

  /** Paste Peak Limiter settings from clipboard */
  pastePeakLimiter: () => PeakLimiterData | null;

  /** Check if clipboard contains valid Peak Limiter data */
  canPastePeakLimiter: () => boolean;

  /** Clear the clipboard */
  clear: () => void;

  /**
   * Get error message for last operation, or null if no error.
   * Useful for external toast notifications.
   */
  lastError: string | null;

  /** Internal: set last error */
  _setLastError: (error: string | null) => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  clipboard: null,
  description: null,
  lastError: null,

  _setLastError: (error) => set({ lastError: error }),

  copyEq: (bands) => {
    try {
      const data = copyEq(bands);
      set({
        clipboard: data as CopyPasteData<unknown>,
        description: getClipboardDescription(data),
        lastError: null
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to copy EQ";
      set({ lastError: msg });
    }
  },

  pasteEq: () => {
    const { clipboard } = get();
    try {
      if (!clipboard || !hasEqData(clipboard)) {
        set({ lastError: "No EQ data in clipboard" });
        return null;
      }
      const bands = pasteEq(clipboard);
      set({ lastError: null });
      return bands;
    } catch (err) {
      let msg = "Failed to paste EQ";
      if (err instanceof CopyPasteOriginMismatchError) {
        msg = err.message;
      } else if (err instanceof CopyPasteDataError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      set({ lastError: msg });
      return null;
    }
  },

  canPasteEq: () => {
    const { clipboard } = get();
    return clipboard !== null && hasEqData(clipboard);
  },

  copyRmsLimiter: (limiter) => {
    try {
      const data = copyRmsLimiter(limiter);
      set({
        clipboard: data as CopyPasteData<unknown>,
        description: getClipboardDescription(data),
        lastError: null
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to copy RMS Limiter";
      set({ lastError: msg });
    }
  },

  pasteRmsLimiter: () => {
    const { clipboard } = get();
    try {
      if (!clipboard || !hasRmsLimiterData(clipboard)) {
        set({ lastError: "No RMS Limiter data in clipboard" });
        return null;
      }
      const limiter = pasteRmsLimiter(clipboard);
      set({ lastError: null });
      return limiter;
    } catch (err) {
      let msg = "Failed to paste RMS Limiter";
      if (err instanceof CopyPasteOriginMismatchError) {
        msg = err.message;
      } else if (err instanceof CopyPasteDataError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      set({ lastError: msg });
      return null;
    }
  },

  canPasteRmsLimiter: () => {
    const { clipboard } = get();
    return clipboard !== null && hasRmsLimiterData(clipboard);
  },

  copyPeakLimiter: (limiter) => {
    try {
      const data = copyPeakLimiter(limiter);
      set({
        clipboard: data as CopyPasteData<unknown>,
        description: getClipboardDescription(data),
        lastError: null
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to copy Peak Limiter";
      set({ lastError: msg });
    }
  },

  pastePeakLimiter: () => {
    const { clipboard } = get();
    try {
      if (!clipboard || !hasPeakLimiterData(clipboard)) {
        set({ lastError: "No Peak Limiter data in clipboard" });
        return null;
      }
      const limiter = pastePeakLimiter(clipboard);
      set({ lastError: null });
      return limiter;
    } catch (err) {
      let msg = "Failed to paste Peak Limiter";
      if (err instanceof CopyPasteOriginMismatchError) {
        msg = err.message;
      } else if (err instanceof CopyPasteDataError) {
        msg = err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      set({ lastError: msg });
      return null;
    }
  },

  canPastePeakLimiter: () => {
    const { clipboard } = get();
    return clipboard !== null && hasPeakLimiterData(clipboard);
  },

  clear: () => {
    set({
      clipboard: null,
      description: null,
      lastError: null
    });
  }
}));
