/**
 * heartbeat-smoother.ts
 *
 * Two-stage smoothing pipeline for HeartbeatData:
 *
 *  Stage 1 — Median (window=5) on all sensor arrays.
 *             Kills single-frame spikes before they reach the UI.
 *             Applied to: temperatures, outputVoltages, outputCurrents,
 *             outputImpedance, inputVoltages, limiters, fanVoltage.
 *
 *  Stage 2 — Attack/release EMA on VU-meter channels (outputDbu, inputDbfs).
 *             Ticked every rAF frame (~16 ms) for 60 fps bar animation.
 *             attack τ = 20 ms  (instant peak grab)
 *             release τ = 300 ms (smooth fall-off)
 */

import type { HeartbeatData } from "@/stores/AmpStore";

// ─── Tuning ─────────────────────────────────────────────────────────────────

const WINDOW_SIZE = 5; // median window (odd → clean median)
const VU_ATTACK_MS = 20; // τ rising
const VU_RELEASE_MS = 300; // τ falling
const VU_FLOOR = -100; // below this → treat as silent (null)

// ─── Helpers ────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** EMA step: move `from` toward `to` with time-constant `tau` over `dt` ms. */
function ema(from: number, to: number, tau: number, dt: number): number {
  return from + (to - from) * (1 - Math.exp(-dt / tau));
}

// ─── Stage 1: Median smoother ────────────────────────────────────────────────

class ChannelWindow {
  private buf: number[] = [];
  private last: number | null = null;

  push(value: number | null | undefined): number | null {
    if (value == null || !isFinite(value)) return this.last;
    this.buf.push(value);
    if (this.buf.length > WINDOW_SIZE) this.buf.shift();
    return (this.last = median(this.buf));
  }
}

const channels = (n: number) =>
  Array.from({ length: n }, () => new ChannelWindow());

interface SensorWindows {
  temperatures: ChannelWindow[];
  outputVoltages: ChannelWindow[];
  outputCurrents: ChannelWindow[];
  outputImpedance: ChannelWindow[];
  inputVoltages: ChannelWindow[];
  limiters: ChannelWindow[];
  fanVoltage: ChannelWindow;
}

function makeWindows(): SensorWindows {
  return {
    temperatures: channels(5),
    outputVoltages: channels(4),
    outputCurrents: channels(4),
    outputImpedance: channels(4),
    inputVoltages: channels(4),
    limiters: channels(4),
    fanVoltage: new ChannelWindow(),
  };
}

class MedianSmoother {
  private w = makeWindows();

  smooth(raw: HeartbeatData, maxDb: number): HeartbeatData {
    const { w } = this;
    const arr = (wins: ChannelWindow[], vals: number[]) =>
      wins.map((win, i) => win.push(vals[i]) ?? vals[i]);

    const outputVoltages = arr(w.outputVoltages, raw.outputVoltages);

    // Recompute outputDbu from the already-smoothed voltages so spike samples
    // in the raw packet never propagate to the VU targets.
    const outputDbu = outputVoltages.map((v) =>
      v > 0 ? Math.round((Math.log10(v) * 20 - maxDb) * 10) / 10 : -100,
    );

    return {
      // Discrete / state — pass through unchanged
      outputStates: raw.outputStates,
      inputStates: raw.inputStates,
      machineMode: raw.machineMode,
      receivedAt: raw.receivedAt,

      // Smoothed numerics
      temperatures: arr(w.temperatures, raw.temperatures),
      outputVoltages,
      outputCurrents: arr(w.outputCurrents, raw.outputCurrents),
      outputImpedance: arr(w.outputImpedance, raw.outputImpedance),
      inputVoltages: arr(w.inputVoltages, raw.inputVoltages),
      limiters: arr(w.limiters, raw.limiters),
      fanVoltage: w.fanVoltage.push(raw.fanVoltage) ?? raw.fanVoltage,

      // outputDbu recomputed from smoothed voltages (not forwarded raw)
      outputDbu,
      inputDbfs: raw.inputDbfs,
    };
  }

  reset(): void {
    this.w = makeWindows();
  }
}

// ─── Stage 2: VU EMA smoother ────────────────────────────────────────────────

class VuChannel {
  private current: number | null = null;
  private target: number | null = null;

  setTarget(value: number | null): void {
    this.target = value != null && value > VU_FLOOR ? value : null;
  }

  tick(dt: number): number | null {
    const { target: t } = this;

    if (t === null) {
      if (this.current === null) return null;
      this.current = ema(this.current, VU_FLOOR, VU_RELEASE_MS, dt);
      if (this.current <= VU_FLOOR + 0.5) {
        this.current = null;
        return null;
      }
      return this.current;
    }

    if (this.current === null) {
      this.current = t;
      return t;
    }

    const tau = t >= this.current ? VU_ATTACK_MS : VU_RELEASE_MS;
    this.current = ema(this.current, t, tau, dt);
    return this.current;
  }

  reset(): void {
    this.current = null;
    this.target = null;
  }
}

export interface VuState {
  outputDbu: (number | null)[];
  inputDbfs: (number | null)[];
}

class VuSmoother {
  private out = Array.from({ length: 4 }, () => new VuChannel());
  private ins = Array.from({ length: 4 }, () => new VuChannel());

  setTargets(outDbu: number[], inDbfs: (number | null)[]): void {
    this.out.forEach((ch, i) => ch.setTarget(outDbu[i]));
    this.ins.forEach((ch, i) => ch.setTarget(inDbfs[i]));
  }

  tick(dt: number): VuState {
    return {
      outputDbu: this.out.map((ch) => ch.tick(dt)),
      inputDbfs: this.ins.map((ch) => ch.tick(dt)),
    };
  }

  reset(): void {
    [...this.out, ...this.ins].forEach((ch) => ch.reset());
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────
// One smoother pair per amp MAC, created on demand.

interface SmootherPair {
  median: MedianSmoother;
  vu: VuSmoother;
}

const registry = new Map<string, SmootherPair>();

function getPair(mac: string): SmootherPair {
  const key = mac.toUpperCase();
  let pair = registry.get(key);
  if (!pair)
    registry.set(
      key,
      (pair = { median: new MedianSmoother(), vu: new VuSmoother() }),
    );
  return pair;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run a raw heartbeat through Stage 1 (median) and update Stage 2 VU targets.
 * Returns the median-smoothed HeartbeatData for the store.
 * `maxDb` = 20*log10(ratedRmsV) for this device — use maxDbFromDeviceName().
 * Call on every incoming heartbeat.
 */
export function smoothHeartbeat(
  mac: string,
  raw: HeartbeatData,
  maxDb: number,
): HeartbeatData {
  const { median, vu } = getPair(mac);
  const smoothed = median.smooth(raw, maxDb);
  vu.setTargets(smoothed.outputDbu, smoothed.inputDbfs);
  return smoothed;
}

/**
 * Advance the VU envelope by `dt` ms (pass rAF elapsed time).
 * Returns animated bar values. Call every animation frame.
 */
export function tickVuMeters(mac: string, dt: number): VuState {
  return getPair(mac).vu.tick(dt);
}

/**
 * Reset both stages for a MAC (call on amp reconnect to flush stale history).
 */
export function resetSmootherForMac(mac: string): void {
  const pair = registry.get(mac.toUpperCase());
  if (pair) {
    pair.median.reset();
    pair.vu.reset();
  }
}
