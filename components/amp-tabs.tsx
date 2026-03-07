"use client";

import { useState, useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import type { HeartbeatData } from "@/stores/AmpStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useVuMeters } from "@/hooks/useVuMeters";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Live sensor dashboard — rendered inside the Main tab
// ---------------------------------------------------------------------------

const CH_LABELS = ["A", "B", "C", "D"];

// Maps States byte value to label (from fromat_machineState.cs)
function machineStateLabel(s: number): string {
  switch (s) {
    case 0:
      return "Normal";
    case 1:
      return "Standby";
    case 2:
      return "Fault";
    case 3:
      return "Open";
    case 4:
      return "Overload";
    case 5:
      return "Clip";
    case 6:
      return "Dcp";
    case 7:
      return "PowerEr";
    case 8:
      return "Run";
    case 9:
      return "Temp";
    case 10:
      return "Limit";
    case 11:
      return "Sleep";
    default:
      return "Normal";
  }
}

// ---------------------------------------------------------------------------
// VU Meter bar — just the bar, no scale. Scale is rendered separately.
// ---------------------------------------------------------------------------

// Output scale: fixed -40 to 0 dBu range (matches C# DC_CHItem: Maximum="0" Minimum="-40").
// maxDb is only used to correctly position signals within that window —
// the window itself is always 40 dB wide.
function outDbScale(): { top: number; bot: number; ticks: number[] } {
  return { top: 0, bot: -40, ticks: [0, -8, -16, -24, -32, -40] };
}

// Input: 0 dBFS (top) → -48 dBFS (bottom)
const IN_DB_TOP = 0;
const IN_DB_BOT = -48;
const IN_SCALE = [0, -12, -24, -36, -48];

function MeterBar({
  value, // current value in dB
  dbTop, // value at top (e.g. 0)
  dbBottom, // value at bottom (e.g. -36)
  clip,
  width = 24,
  height = 220,
}: {
  value: number | null;
  dbTop: number;
  dbBottom: number;
  clip?: boolean;
  width?: number;
  height?: number;
}) {
  const fill =
    value === null || value < dbBottom
      ? 0
      : Math.min(1, (value - dbBottom) / (dbTop - dbBottom));

  return (
    <div
      className="relative rounded-sm overflow-hidden bg-muted/30 border border-border/60 flex-shrink-0"
      style={{ width, height }}
    >
      <div
        className={`absolute bottom-0 left-0 right-0 ${clip ? "bg-red-500" : "bg-green-500"}`}
        style={{ height: `${fill * 100}%` }}
      />
    </div>
  );
}

/** Single shared scale column: ticks evenly spaced across exactly `height` px */
function ScaleColumn({
  ticks,
  height = 220,
  width = 24,
}: {
  ticks: number[];
  height?: number;
  width?: number;
}) {
  return (
    <div
      className="flex-shrink-0 flex flex-col justify-between"
      style={{ width, height }}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className="text-[9px] text-muted-foreground leading-none text-right pr-1 block"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status LED strip — right side of output section
// ---------------------------------------------------------------------------

const OUTPUT_FLAGS = [
  "Fault",
  "Load",
  "Open",
  "Temp",
  "Clip",
  "Standby",
  "Hi Z",
  "Bridged",
] as const;

function StatusLeds({ states }: { states: number[] }) {
  // A flag is lit if ANY channel has that state
  const active: Record<string, boolean> = {
    Fault: states.some((s) => s === 2),
    Load: states.some((s) => s === 4),
    Open: states.some((s) => s === 3),
    Temp: states.some((s) => s === 9),
    Clip: states.some((s) => s === 5),
    Standby: states.some((s) => s === 1),
    "Hi Z": false,
    Bridged: false,
  };
  return (
    <div className="flex flex-col gap-[3px]">
      {OUTPUT_FLAGS.map((flag) => (
        <div key={flag} className="flex items-center gap-1">
          <div
            className={`w-2.5 h-2.5 rounded-sm border flex-shrink-0 ${active[flag] ? "bg-green-400 border-green-500" : "bg-muted/40 border-border/60"}`}
          />
          <span className="text-[9px] text-muted-foreground leading-none whitespace-nowrap">
            {flag}
          </span>
        </div>
      ))}
    </div>
  );
}

function HeartbeatDashboard({
  hb,
  mac,
  ratedRmsV,
}: {
  hb: HeartbeatData;
  mac: string;
  ratedRmsV?: number;
}) {
  const f1 = (n: number) => n.toFixed(1);
  const f0 = (n: number) => n.toFixed(0);
  const fDbfs = (v: number | null) =>
    v === null || v <= -100 ? "---" : v.toFixed(1);

  // 60fps animated VU values — falls back to hb values until first rAF tick
  const vu = useVuMeters(mac);
  const vuOutputDbu = vu?.outputDbu ?? hb.outputDbu.map(() => null);
  const vuInputDbfs = vu?.inputDbfs ?? hb.inputDbfs;

  // Fixed -40 to 0 dBu output meter scale (matches C# reference UI).
  const { top: OUT_DB_TOP, bot: OUT_DB_BOT, ticks: OUT_SCALE } = outDbScale();

  const METER_H = 220;
  const BAR_W = 32;
  const COL_W = 44; // channel column width — wider than bar so labels have room
  // Height of the channel label row above the bar — must match exactly
  const LABEL_H = 22;

  return (
    <div className="flex gap-6 text-xs select-none overflow-x-auto items-start">
      {/* ────────────────── VOLUME / SOURCE ────────────────── */}
      <div className="flex flex-col flex-shrink-0">
        <span className="text-[11px] font-semibold text-center text-muted-foreground mb-3 tracking-wider uppercase">
          Volume / Source
        </span>
        <div className="flex gap-2 items-start">
          {/* Scale column — sits to the left, bar-top aligned with channel bars */}
          <div
            className="flex flex-col items-end flex-shrink-0"
            style={{ width: 28 }}
          >
            {/* Spacer matching the channel label row height + mb-1 */}
            <div style={{ height: LABEL_H + 4 }} />
            <ScaleColumn ticks={IN_SCALE} height={METER_H} width={28} />
          </div>
          {/* Channel columns */}
          <div className="flex gap-2 items-start">
            {CH_LABELS.map((ch, i) => {
              const dbfsVal = vuInputDbfs[i];
              const hasSignal = hb.inputStates[i] === 0;
              const isClip = dbfsVal !== null && dbfsVal > -1;
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-0"
                  style={{ width: COL_W }}
                >
                  {/* Channel label */}
                  <div
                    className={`rounded border px-1 text-[10px] font-semibold text-center w-full mb-1 ${
                      hasSignal
                        ? "border-green-500/50 bg-green-500/15 text-green-700 dark:text-green-400"
                        : "border-border/60 text-muted-foreground"
                    }`}
                    style={{ height: LABEL_H, lineHeight: `${LABEL_H - 2}px` }}
                  >
                    In{i + 1}
                  </div>
                  {/* Bar — centered inside the column */}
                  <MeterBar
                    value={dbfsVal}
                    dbTop={IN_DB_TOP}
                    dbBottom={IN_DB_BOT}
                    clip={isClip}
                    width={BAR_W}
                    height={METER_H}
                  />
                  {/* Clip indicator */}
                  <div
                    className={`mt-1 rounded px-1 py-0.5 text-[9px] font-semibold w-full text-center ${
                      isClip
                        ? "bg-red-500 text-white"
                        : "bg-muted/30 text-muted-foreground/40"
                    }`}
                  >
                    Clip
                  </div>
                  {/* Volume readouts */}
                  <div className="flex flex-col items-center gap-[3px] mt-2 w-full">
                    <div className="rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-center font-mono text-[11px] w-full leading-tight">
                      -20{" "}
                      <span className="text-[9px] text-muted-foreground">
                        dB
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      Gain
                    </span>
                    <div className="rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-center font-mono text-[11px] w-full leading-tight">
                      24{" "}
                      <span className="text-[9px] text-muted-foreground">
                        dB
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      SEN
                    </span>
                    <div className="rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-center font-mono text-[11px] w-full leading-tight">
                      7.94{" "}
                      <span className="text-[9px] text-muted-foreground">
                        V
                      </span>
                    </div>
                    <div
                      className={`rounded border px-1 py-0.5 text-center font-mono text-[10px] w-full leading-tight ${
                        hasSignal
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-border/40 bg-muted/20 opacity-60"
                      }`}
                    >
                      {fDbfs(dbfsVal)}{" "}
                      <span className="text-[9px] text-muted-foreground">
                        dBFS
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ────────────────── OUTPUT ────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-l border-border/40 pl-6">
        <span className="text-[11px] font-semibold text-center text-muted-foreground mb-3 tracking-wider uppercase">
          Output
        </span>
        <div className="flex gap-2 items-start">
          {/* Scale column — left of all bars, aligned to bar tops */}
          <div
            className="flex flex-col items-end flex-shrink-0"
            style={{ width: 32 }}
          >
            {/* "dB" label sits in same row as channel labels */}
            <div
              className="flex items-end justify-end pr-1 w-full"
              style={{ height: LABEL_H, marginBottom: 4 }}
            >
              <span className="text-[9px] text-muted-foreground leading-none">
                dB
              </span>
            </div>
            <ScaleColumn ticks={OUT_SCALE} height={METER_H} width={32} />
          </div>

          {CH_LABELS.map((ch, i) => {
            const st = hb.outputStates[i] ?? 0;
            const v = hb.outputVoltages[i];
            const a = hb.outputCurrents[i];
            const dbu = vuOutputDbu[i];
            const imp = hb.outputImpedance[i];
            const isClip = st === 5;
            const isActive = st === 0 || st === 8;
            // Clamp: treat null or anything ≤ OUT_DB_BOT as silent
            const dbuVal =
              dbu === null || dbu <= OUT_DB_BOT
                ? null
                : Math.min(dbu, OUT_DB_TOP);

            return (
              <div
                key={i}
                className="flex flex-col items-center gap-0"
                style={{ width: COL_W }}
              >
                {/* Channel label */}
                <div
                  className={`rounded border px-1 text-[10px] font-semibold text-center w-full mb-1 ${
                    isActive
                      ? "border-green-500/50 bg-green-500/15 text-green-700 dark:text-green-400"
                      : "border-border/60 text-muted-foreground"
                  }`}
                  style={{ height: LABEL_H, lineHeight: `${LABEL_H - 2}px` }}
                >
                  Out{ch}
                </div>
                {/* Bar — centered inside the column */}
                <MeterBar
                  value={dbuVal}
                  dbTop={OUT_DB_TOP}
                  dbBottom={OUT_DB_BOT}
                  clip={isClip}
                  width={BAR_W}
                  height={METER_H}
                />
                {/* Mute */}
                <div className="mt-1 rounded border border-border/60 bg-muted/20 px-1 py-0.5 text-[10px] text-muted-foreground/60 flex items-center gap-1 w-full justify-center">
                  🔊 <span>Mute</span>
                </div>
                {/* V / A / Ω / Temp */}
                <div
                  className={`mt-1 text-sm font-semibold tabular-nums font-mono leading-tight ${v <= 0.01 ? "opacity-40" : ""}`}
                >
                  {v > 0.01 ? f1(v) : "0"}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    V
                  </span>
                </div>
                <div
                  className={`text-sm font-semibold tabular-nums font-mono leading-tight ${a <= 0.001 ? "opacity-40" : ""}`}
                >
                  {a > 0.001 ? f1(a) : "0"}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    A
                  </span>
                </div>
                <div
                  className={`text-sm font-semibold tabular-nums font-mono leading-tight ${imp === 0 ? "opacity-40" : ""}`}
                >
                  {imp > 0 ? imp : "---"}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    Ω
                  </span>
                </div>
                <div
                  className={`text-sm font-semibold tabular-nums font-mono leading-tight mt-1 ${(hb.temperatures[i] ?? 0) > 80 ? "text-red-500" : ""}`}
                >
                  {f0(hb.temperatures[i] ?? 0)}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    °C
                  </span>
                </div>
              </div>
            );
          })}

          {/* Status LEDs — bar top-aligned (spacer = label height + mb-1) */}
          <div className="flex flex-col pl-3 ml-1 border-l border-border/40 flex-shrink-0">
            <div style={{ height: LABEL_H + 4 }} />
            <StatusLeds states={hb.outputStates} />
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/40 text-[11px] flex-wrap">
          <span className="text-muted-foreground">
            PSU
            <span
              className={`font-semibold tabular-nums font-mono ml-1 ${(hb.temperatures[4] ?? 0) > 80 ? "text-red-500" : ""}`}
            >
              {f0(hb.temperatures[4] ?? 0)}
            </span>
            <span className="text-[10px] ml-0.5">°C</span>
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {new Date(hb.receivedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AmpTabs() {
  type AmpSection = "main" | "matrix" | "preferences";
  const { amps, getDisplayName } = useAmpStore();
  const { fetchPresets, fetching, error: presetsError } = useAmpPresets();
  const [selectedMac, setSelectedMac] = useState<string | null>(
    amps.length > 0 ? amps[0].mac : null,
  );
  const [activeSection, setActiveSection] = useState<AmpSection>("main");

  const selectedAmp = amps.find((a) => a.mac === selectedMac);

  // Auto-fetch presets when the preferences tab is opened for a reachable amp
  // that doesn't have presets loaded yet.
  useEffect(() => {
    if (
      activeSection === "preferences" &&
      selectedAmp?.reachable &&
      selectedAmp.presets === undefined &&
      !fetching
    ) {
      void fetchPresets(selectedAmp.mac);
    }
    // fetchPresets identity is stable (useCallback); fetching guards against double-fire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, selectedMac]);

  if (!amps || amps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No amps assigned. Add amps to get started.
      </div>
    );
  }

  return (
    <div className="flex gap-4 w-full">
      {/* Vertical amp selector */}
      <div className="flex flex-col gap-1">
        {amps.map((amp) => (
          <button
            key={amp.mac}
            onClick={() => setSelectedMac(amp.mac)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-left whitespace-nowrap
              ${
                selectedMac === amp.mac
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
          >
            <div
              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                amp.reachable ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="truncate">{getDisplayName(amp)}</span>
          </button>
        ))}
      </div>

      {/* Selected amp panel with horizontal section tabs */}
      {selectedAmp && (
        <div className="flex-1 border rounded-lg overflow-hidden">
          <Tabs
            value={activeSection}
            onValueChange={(v) => setActiveSection(v as AmpSection)}
            orientation="horizontal"
            className="flex flex-col"
          >
            <TabsList className="w-full justify-start rounded-none rounded-t-lg border-b h-10 px-2">
              <TabsTrigger value="main">
                <LayoutDashboardIcon />
                Main
              </TabsTrigger>
              <TabsTrigger value="matrix">
                <GridIcon />
                Matrix
              </TabsTrigger>
              <TabsTrigger value="preferences">
                <SlidersHorizontalIcon />
                Preferences
              </TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="p-4 mt-0">
              {!selectedAmp.reachable ? (
                <p className="text-sm text-muted-foreground">
                  Amp is unreachable.
                </p>
              ) : !selectedAmp.heartbeat ? (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Waiting for data…
                </p>
              ) : (
                <HeartbeatDashboard
                  hb={selectedAmp.heartbeat}
                  mac={selectedAmp.mac}
                  ratedRmsV={selectedAmp.ratedRmsV}
                />
              )}
            </TabsContent>

            <TabsContent value="matrix" className="p-4 mt-0">
              <p className="text-sm text-muted-foreground">
                Matrix routing coming soon.
              </p>
            </TabsContent>

            <TabsContent value="preferences" className="p-4 mt-0">
              {/* Device identity */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    selectedAmp.reachable ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <h2 className="text-lg font-semibold">
                  {getDisplayName(selectedAmp)}
                </h2>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-6">
                <div>
                  <dt className="font-semibold">MAC:</dt>
                  <dd className="font-mono">{selectedAmp.mac}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Version:</dt>
                  <dd>{selectedAmp.version || "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">ID:</dt>
                  <dd>{selectedAmp.id || "---"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Runtime:</dt>
                  <dd>
                    {selectedAmp.run_time !== undefined
                      ? `${Math.floor(selectedAmp.run_time / 60)}h ${selectedAmp.run_time % 60}min`
                      : "---"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Rated Output:</dt>
                  <dd>
                    {selectedAmp.ratedRmsV !== undefined
                      ? `${selectedAmp.ratedRmsV} V RMS`
                      : "---"}
                  </dd>
                </div>
              </dl>

              {/* Presets section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold">Presets</h3>
                  {fetching && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Loading...
                    </span>
                  )}
                  {!fetching && selectedAmp.presets !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {selectedAmp.presets.length} used
                    </span>
                  )}
                </div>

                {presetsError && (
                  <p className="text-xs text-destructive mb-2">
                    {presetsError}
                  </p>
                )}

                {!fetching && !selectedAmp.presets && !presetsError && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAmp.reachable
                      ? "Loading presets..."
                      : "Amp is unreachable — presets unavailable."}
                  </p>
                )}

                {selectedAmp.presets?.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No presets saved on this device.
                  </p>
                )}

                {selectedAmp.presets && selectedAmp.presets.length > 0 && (
                  <ul className="space-y-1">
                    {selectedAmp.presets.map((preset) => (
                      <li
                        key={preset.slot}
                        className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-sm"
                      >
                        <span className="w-6 text-center text-xs font-mono text-muted-foreground">
                          {preset.slot}
                        </span>
                        <span className="font-medium">{preset.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
