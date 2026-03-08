"use client";

import { useState, useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import type { HeartbeatData, ChannelParams } from "@/stores/AmpStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useVuMeters } from "@/hooks/useVuMeters";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// JsonTree — collapsible JSON viewer (collapsed by default)
// ---------------------------------------------------------------------------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

function JsonNode({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  const [open, setOpen] = useState(false);

  if (value === null)
    return <span className="text-muted-foreground">null</span>;
  if (typeof value === "boolean")
    return (
      <span className={value ? "text-green-400" : "text-red-400"}>
        {String(value)}
      </span>
    );
  if (typeof value === "number")
    return <span className="text-sky-400">{value}</span>;
  if (typeof value === "string")
    return <span className="text-amber-300">&quot;{value}&quot;</span>;

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as JsonValue[]).map(
        (v, i) => [String(i), v] as [string, JsonValue],
      )
    : Object.entries(value as { [k: string]: JsonValue });

  const preview = isArray ? `[${entries.length}]` : `{${entries.length}}`;
  const indent = depth * 12;

  return (
    <span>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
      >
        <span className="text-[10px] w-3 text-center">{open ? "▾" : "▸"}</span>
        <span className="text-foreground/60">{preview}</span>
      </button>
      {open && (
        <span className="block" style={{ paddingLeft: indent + 12 }}>
          {entries.map(([k, v]) => (
            <span key={k} className="block leading-5">
              {!isArray && (
                <span className="text-violet-300">&quot;{k}&quot;</span>
              )}
              {!isArray && <span className="text-foreground/50">: </span>}
              <JsonNode value={v} depth={depth + 1} />
              <span className="text-foreground/30">,</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function JsonTree({ label, value }: { label: string; value: JsonValue }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-border/60 bg-muted/40 text-[11px] font-mono">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors cursor-pointer"
      >
        <span className="text-muted-foreground text-[10px]">
          {open ? "▾" : "▸"}
        </span>
        <span className="font-semibold text-foreground/80">{label}</span>
        {!open && (
          <span className="text-muted-foreground ml-1">
            {Array.isArray(value)
              ? `[${(value as JsonValue[]).length}]`
              : "{…}"}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 overflow-x-auto">
          <JsonNode value={value} depth={0} />
        </div>
      )}
    </div>
  );
}

function CopyJsonButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <span className="text-green-400">✓</span>
          Copied
        </>
      ) : (
        <>
          <span>⎘</span>
          Copy JSON
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Live sensor dashboard — rendered inside the Main tab
// ---------------------------------------------------------------------------

const CH_LABELS = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------
// VU Meter bar — just the bar, no scale. Scale is rendered separately.
// ---------------------------------------------------------------------------

// Output scale: fixed -40 to 0 dBu range (matches C# DC_CHItem: Maximum="0" Minimum="-40").
// maxDb is only used to correctly position signals within that window —
// the window itself is always 40 dB wide.
function outDbScale(): { top: number; bot: number; ticks: number[] } {
  return { top: 0, bot: -40, ticks: [0, -8, -16, -24, -32, -40] };
}

// Input: 0 dBFS (top) → -80 dBFS (bottom)
const IN_DB_TOP = 0;
const IN_DB_BOT = -60;
const IN_SCALE = [0, -12, -24, -36, -48, -60];

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

function HeartbeatDashboard({
  hb,
  mac,
  ratedRmsV,
  channelParams,
}: {
  hb: HeartbeatData;
  mac: string;
  ratedRmsV?: number;
  channelParams?: ChannelParams;
}) {
  const f1 = (n: number) => n.toFixed(1);
  const f0 = (n: number) => n.toFixed(0);
  const fDbfs = (v: number | null) =>
    v === null || v <= -100 ? "---" : v.toFixed(0);

  // 60fps animated VU values — falls back to hb values until first rAF tick
  const vu = useVuMeters(mac);
  const vuOutputDbu = vu?.outputDbu ?? hb.outputDbu.map(() => null);
  const vuInputDbfs = vu?.inputDbfs ?? hb.inputDbfs;

  // Fixed -40 to 0 dBu output meter scale (matches C# reference UI).
  const { top: OUT_DB_TOP, bot: OUT_DB_BOT, ticks: OUT_SCALE } = outDbScale();

  const METER_H = 220;
  const BAR_W = 36;
  const COL_W = 64; // channel column width
  // Height of the channel label row above the bar — must match exactly
  const LABEL_H = 24;

  return (
    <div className="flex gap-6 text-xs select-none overflow-x-auto items-start">
      {/* ────────────────── VOLUME / SOURCE ────────────────── */}
      <div className="flex flex-col flex-shrink-0">
        <span className="text-[11px] font-semibold text-center text-muted-foreground mb-3 tracking-wider uppercase">
          Volume / Source
        </span>
        <div className="flex gap-3 items-start">
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
          <div className="flex gap-3 items-start">
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
                    className={`rounded border px-1 text-[11px] font-semibold text-center w-full mb-1 ${
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
                  <div className="flex flex-col items-stretch gap-1.5 mt-3 w-full">
                    {/* dBFS */}
                    <div
                      className={`flex flex-col items-center rounded border px-1.5 py-1 ${
                        hasSignal
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-border/40 bg-muted/20 opacity-60"
                      }`}
                    >
                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                        {fDbfs(dbfsVal)}
                      </span>
                      <span className="text-[9px] text-muted-foreground mt-0.5">
                        dBFS
                      </span>
                    </div>
                    {/* Volume */}
                    <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                        {channelParams?.channels[i]?.volumeIn.toFixed(1) ?? "~"}
                      </span>
                      <span className="text-[9px] text-muted-foreground mt-0.5">
                        Vol dB
                      </span>
                    </div>
                    {/* Gain */}
                    <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                        {channelParams?.channels[i]?.gainIn ?? "~"}
                      </span>
                      <span className="text-[9px] text-muted-foreground mt-0.5">
                        Gain dB
                      </span>
                    </div>
                    {/* Mute In */}
                    {(() => {
                      const muted = channelParams?.channels[i]?.muteIn;
                      return (
                        <div
                          className={`rounded border px-1.5 py-1 text-center text-[11px] font-semibold w-full transition-colors ${
                            muted === true
                              ? "border-orange-500/60 bg-orange-500/20 text-orange-400"
                              : muted === false
                                ? "border-border/40 bg-muted/20 text-muted-foreground/50"
                                : "border-border/30 bg-muted/10 text-muted-foreground/30"
                          }`}
                        >
                          {muted === true ? "MUTED" : "Mute In"}
                        </div>
                      );
                    })()}
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
        <div className="flex gap-3 items-start">
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
            const temp = hb.temperatures[i] ?? 0;
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
                  className={`rounded border px-1 text-[11px] font-semibold text-center w-full mb-1 ${
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
                {/* Stats + Mute */}
                <div className="flex flex-col items-stretch gap-1.5 mt-3 w-full">
                  {/* V */}
                  <div
                    className={`flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1 ${v <= 0.01 ? "opacity-40" : ""}`}
                  >
                    <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                      {v > 0.01 ? f1(v) : "0"}
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      V
                    </span>
                  </div>
                  {/* A */}
                  <div
                    className={`flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1 ${a <= 0.001 ? "opacity-40" : ""}`}
                  >
                    <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                      {a > 0.001 ? f1(a) : "0"}
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      A
                    </span>
                  </div>
                  {/* Ω */}
                  <div
                    className={`flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1 ${imp === 0 ? "opacity-40" : ""}`}
                  >
                    <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                      {imp > 0 ? String(imp) : "---"}
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      Ω
                    </span>
                  </div>
                  {/* °C */}
                  <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                    <span
                      className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${temp > 80 ? "text-red-500" : ""}`}
                    >
                      {f0(temp)}
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      °C
                    </span>
                  </div>
                  {/* Mute Out */}
                  {(() => {
                    const muted = channelParams?.channels[i]?.muteOut;
                    return (
                      <div
                        className={`rounded border px-1.5 py-1 text-center text-[11px] font-semibold w-full transition-colors ${
                          muted === true
                            ? "border-orange-500/60 bg-orange-500/20 text-orange-400"
                            : muted === false
                              ? "border-border/40 bg-muted/20 text-muted-foreground/50"
                              : "border-border/30 bg-muted/10 text-muted-foreground/30"
                        }`}
                      >
                        {muted === true ? "MUTED" : "Mute Out"}
                      </div>
                    );
                  })()}
                  {/* Noise Gate */}
                  {(() => {
                    const ng = channelParams?.channels[i]?.noiseGateOut;
                    return (
                      <div
                        className={`rounded border px-1.5 py-1 text-center text-[11px] font-semibold w-full transition-colors ${
                          ng === true
                            ? "border-sky-500/60 bg-sky-500/20 text-sky-400"
                            : ng === false
                              ? "border-border/40 bg-muted/20 text-muted-foreground/50"
                              : "border-border/30 bg-muted/10 text-muted-foreground/30"
                        }`}
                      >
                        {ng === true ? "GATE ON" : "Gate"}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
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

// ---------------------------------------------------------------------------
// Limiter panel — RMS + Peak settings per channel with live GR meter
// ---------------------------------------------------------------------------

function LimiterGrBar({
  gainReduction,
  height = 48,
}: {
  gainReduction: number; // negative dB from heartbeat (e.g. -6 = 6 dB GR)
  height?: number;
}) {
  // gainReduction is ≤ 0; 0 = no reduction, -∞ = full clamp
  // Show GR depth: 0 dB (no GR) at top, -20 dB at bottom
  const GR_MAX = 20; // dB scale
  const depth = Math.min(GR_MAX, Math.max(0, -gainReduction));
  const fill = depth / GR_MAX;
  const active = depth > 0.1;
  return (
    <div
      className="relative rounded-sm overflow-hidden bg-muted/30 border border-border/60 w-3 flex-shrink-0"
      style={{ height }}
      title={`GR: ${gainReduction.toFixed(1)} dB`}
    >
      <div
        className={`absolute top-0 left-0 right-0 transition-all duration-75 ${active ? "bg-amber-400" : "bg-muted/20"}`}
        style={{ height: `${fill * 100}%` }}
      />
    </div>
  );
}

function LimiterBlock({
  label,
  channels,
  limiters,
}: {
  label: string;
  channels: ChannelParams["channels"];
  limiters: number[]; // live GR per channel from heartbeat
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex gap-3">
        {channels.map((ch, i) => {
          const isRms = label.startsWith("RMS");
          const lim = isRms ? ch.rmsLimiter : ch.peakLimiter;
          const gr = limiters[i] ?? 0;
          const enabled = lim.enabled;

          return (
            <div
              key={i}
              className={`flex flex-col rounded-lg border px-3 py-2 gap-2 transition-colors ${
                enabled
                  ? "border-border bg-card"
                  : "border-border/30 bg-muted/20 opacity-50"
              }`}
              style={{ minWidth: 108 }}
            >
              {/* Header row: channel label + bypass pill + GR bar */}
              <div className="flex items-center gap-2 justify-between">
                <span className="text-[11px] font-bold text-foreground">
                  Out{CH_LABELS[i]}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-semibold rounded px-1.5 py-0.5 ${
                      enabled
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-muted/40 text-muted-foreground border border-border/40"
                    }`}
                  >
                    {enabled ? "ON" : "BYP"}
                  </span>
                  <LimiterGrBar gainReduction={gr} height={16} />
                </div>
              </div>

              {/* Threshold */}
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Threshold
                </span>
                <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                  {"thresholdVrms" in lim
                    ? `${lim.thresholdVrms.toFixed(2)} V`
                    : `${(lim as typeof ch.peakLimiter).thresholdVp.toFixed(2)} V`}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {"thresholdVrms" in lim ? "Vrms" : "Vpeak"}
                </span>
              </div>

              {/* Timing fields */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {"attackMs" in lim ? (
                  <>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground">
                        Atk
                      </span>
                      <span className="font-mono text-[11px] font-semibold tabular-nums">
                        {lim.attackMs} ms
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground">
                        Rel
                      </span>
                      <span className="font-mono text-[11px] font-semibold tabular-nums">
                        ×{lim.releaseMultiplier}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground">
                        Hold
                      </span>
                      <span className="font-mono text-[11px] font-semibold tabular-nums">
                        {(lim as typeof ch.peakLimiter).holdMs} ms
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground">
                        Rel
                      </span>
                      <span className="font-mono text-[11px] font-semibold tabular-nums">
                        {(lim as typeof ch.peakLimiter).releaseMs} ms
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio matrix grid — rows = outputs (OutA–D), columns = inputs (AIn1–4)
// ---------------------------------------------------------------------------

const INPUT_LABELS = ["AIn1", "AIn2", "AIn3", "AIn4"];

function MatrixGrid({ channels }: { channels: ChannelParams["channels"] }) {
  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            {/* top-left corner */}
            <th className="w-16" />
            {INPUT_LABELS.map((label) => (
              <th
                key={label}
                className="text-center text-xs font-semibold text-muted-foreground pb-1 w-20"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <tr key={ch.channel}>
              {/* Row label — output name */}
              <td className="text-xs font-semibold text-muted-foreground pr-2 text-right align-middle whitespace-nowrap">
                {ch.outputName}
              </td>
              {ch.matrix.map((cell) => (
                <td key={cell.source} className="align-middle">
                  <MatrixCell gain={cell.gain} active={cell.active} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({ gain, active }: { gain: number; active: boolean }) {
  const label = active
    ? gain === 0
      ? "0 dB"
      : `${gain > 0 ? "+" : ""}${gain} dB`
    : "Mute";

  return (
    <div
      className={`
        flex items-center justify-center rounded-md px-2 py-2 w-20 h-10
        text-xs font-medium border
        ${
          active
            ? "bg-card border-border text-foreground"
            : "bg-muted/40 border-transparent text-muted-foreground italic"
        }
      `}
    >
      {label}
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
                Matrix / Limiter
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
                  channelParams={selectedAmp.channelParams}
                />
              )}
            </TabsContent>

            <TabsContent value="matrix" className="p-4 mt-0">
              {!selectedAmp.channelParams ? (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Waiting for data…
                </p>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Matrix */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Crosspoint Matrix
                    </span>
                    <MatrixGrid channels={selectedAmp.channelParams.channels} />
                  </div>

                  {/* Limiters */}
                  <div className="border-t border-border/40 pt-6 flex flex-col gap-5">
                    <LimiterBlock
                      label="RMS Limiter"
                      channels={selectedAmp.channelParams.channels}
                      limiters={selectedAmp.heartbeat?.limiters ?? [0, 0, 0, 0]}
                    />
                    <LimiterBlock
                      label="Peak Limiter"
                      channels={selectedAmp.channelParams.channels}
                      limiters={selectedAmp.heartbeat?.limiters ?? [0, 0, 0, 0]}
                    />
                  </div>
                </div>
              )}
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

              {/* Channel Data (FC=27) */}
              {selectedAmp.channelParams && (
                <div className="mt-6 border-t pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Channel Data</h3>
                    <CopyJsonButton data={selectedAmp.channelParams.channels} />
                  </div>
                  <div className="space-y-2">
                    {selectedAmp.channelParams.channels.map((ch) => (
                      <JsonTree
                        key={ch.channel}
                        label={`Channel ${ch.channel} — ${ch.inputName} → ${ch.outputName}`}
                        value={ch as unknown as JsonValue}
                      />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
