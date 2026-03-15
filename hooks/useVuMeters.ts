"use client";

/**
 * useVuMeters(mac)
 *
 * Runs a requestAnimationFrame loop that ticks the VU envelope smoother
 * every frame (~16 ms) and returns the current animated bar values.
 *
 * Decouples visual update rate (60 fps) from the UDP poll rate (~140 ms),
 * so meter bars animate smoothly instead of jumping in discrete steps.
 */

import { useEffect, useRef, useState } from "react";
import { tickVuMeters, type VuState } from "@/lib/heartbeat-smoother";

const DEFAULT_DT_MS = 16; // assumed dt on the very first frame

export function useVuMeters(mac: string | null): VuState | null {
  const [state, setState] = useState<VuState | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mac) return;

    let rafId: number;

    const frame = (now: number) => {
      const dt = lastRef.current !== null ? now - lastRef.current : DEFAULT_DT_MS;
      lastRef.current = now;
      setState(tickVuMeters(mac, dt));
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      lastRef.current = null;
    };
  }, [mac]);

  return state;
}
