"use client";

import { useState, useEffect } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import type {
  HeartbeatData,
  ChannelParams,
  EqBand,
  AmpPreset,
} from "@/stores/AmpStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { useAmpActions } from "@/hooks/useAmpActions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVuMeters } from "@/hooks/useVuMeters";
import { thresholdVToDbu, formatRuntime, formatDbfs } from "@/lib/generic";
import { getFilterTypeName } from "@/lib/parse-channel-data";
import { EQ_BAND_LABELS, formatFreqFull } from "@/lib/eq";
import { MATRIX_GAIN_MAX_DB, MATRIX_GAIN_MIN_DB } from "@/lib/constants";
import { EqCurveChart } from "@/components/eq-curve-chart";
import { COLORS } from "@/lib/colors";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// JsonTree — collapsible JSON viewer (collapsed by default)
// ---------------------------------------------------------------------------

function PresetActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmDisabled,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={confirmDisabled} onClick={() => void onConfirm?.()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
      <span className={value ? "text-green-500" : "text-destructive"}>
        {String(value)}
      </span>
    );
  if (typeof value === "number")
    return <span className="text-foreground">{value}</span>;
  if (typeof value === "string")
    return <span className="text-foreground">&quot;{value}&quot;</span>;

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
                <span className="text-foreground/70">&quot;{k}&quot;</span>
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
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1.5 text-xs font-medium"
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
    </Button>
  );
}

// ---------------------------------------------------------------------------
// EQ band display
// ---------------------------------------------------------------------------

function EqParamStrip({ bands }: { bands: EqBand[] }) {
  return (
    <div
      className="grid gap-px m-4"
      style={{
        gridTemplateColumns: `repeat(${bands.length}, minmax(64px, 1fr))`,
        minWidth: `${bands.length * 72}px`,
      }}
    >
      {bands.map((band, idx) => {
        const isHpLp = idx === 0 || idx === 9;
        const bypassed = band.bypass;
        return (
          <div
            key={idx}
            className={`flex flex-col items-center text-center py-2 px-1 ${
              bypassed ? "opacity-40" : ""
            }`}
          >
            {/* Band label */}
            <div className="text-[11px] font-bold mb-2 w-full py-0.5 rounded-sm bg-muted text-foreground">
              {EQ_BAND_LABELS[idx]}
            </div>

            {/* Filter type */}
            <div className="text-[10px] font-medium mb-1 text-muted-foreground">
              {getFilterTypeName(band.type, idx)}
            </div>

            {/* Frequency */}
            <div className="text-[11px] tabular-nums text-foreground">
              {formatFreqFull(band.freq)}{" "}
              <span className="text-[9px] text-muted-foreground">Hz</span>
            </div>

            {/* Gain (not for HP/LP) */}
            {!isHpLp && (
              <div
                className={`text-[11px] tabular-nums mt-0.5 ${
                  band.gain > 0
                    ? "text-green-500 dark:text-green-400"
                    : band.gain < 0
                      ? "text-red-500 dark:text-red-400"
                      : "text-muted-foreground"
                }`}
              >
                {band.gain > 0 ? "+" : ""}
                {band.gain.toFixed(1)}{" "}
                <span className="text-[9px] text-muted-foreground">dB</span>
              </div>
            )}

            {/* Q (not for HP/LP) */}
            {!isHpLp && (
              <div className="text-[10px] tabular-nums mt-0.5 text-muted-foreground">
                Q: {band.q.toFixed(1)}
              </div>
            )}

            {/* Bypass indicator */}
            <div
              className={`text-[9px] font-bold mt-1.5 w-full py-0.5 rounded-sm ${
                bypassed
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted/60 text-muted-foreground/50"
              }`}
            >
              {bypassed ? "Bypass" : isHpLp ? "ON" : "Bypass"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EqBandDialog({
  triggerLabel,
  title,
  bands,
}: {
  triggerLabel: string;
  title: string;
  bands?: EqBand[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={!bands}
          size="sm"
          variant="outline"
          className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
            !bands
              ? "border-border/30 bg-muted/10 text-muted-foreground/30"
              : "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/70"
          }`}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(64rem,95vw)] max-w-none sm:max-w-none gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
        </DialogHeader>
        {bands && (
          <>
            <div className="px-3">
              <EqCurveChart bands={bands} />
            </div>
            <div className="overflow-x-auto">
              <EqParamStrip bands={bands} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
  thresholdLines,
}: {
  value: number | null;
  dbTop: number;
  dbBottom: number;
  clip?: boolean;
  width?: number;
  height?: number;
  /** Horizontal threshold lines rendered over the bar fill. */
  thresholdLines?: { dbu: number; color: string; label?: string }[];
}) {
  const fill =
    value === null || value < dbBottom
      ? 0
      : Math.min(1, (value - dbBottom) / (dbTop - dbBottom));

  const dbRange = dbTop - dbBottom;

  return (
    <div
      className="relative rounded-[min(var(--radius),8px)] overflow-hidden bg-muted/30 border border-border/60 flex-shrink-0"
      style={{ width, height }}
    >
      <div
        className={`absolute bottom-0 left-0 right-0 ${clip ? "bg-destructive" : "bg-primary"}`}
        style={{ height: `${fill * 100}%` }}
      />
      {thresholdLines?.map(({ dbu, color, label }, idx) => {
        const pct = Math.min(1, Math.max(0, (dbu - dbBottom) / dbRange));
        // Skip lines that would be outside the visible range
        if (dbu < dbBottom || dbu > dbTop) return null;
        // The line itself — 2px tall, positioned by bottom%
        const lineStyle: React.CSSProperties = {
          bottom: `calc(${pct * 100}% - 1px)`,
          height: 2,
          backgroundColor: color,
          opacity: 0.85,
        };
        if (!label) {
          return (
            <div
              key={idx}
              className="absolute left-0 right-0 pointer-events-none"
              style={lineStyle}
            />
          );
        }
        // Wider invisible hit area centred on the line for the tooltip trigger
        return (
          <Tooltip key={idx}>
            <TooltipTrigger asChild>
              <div
                className="absolute left-0 right-0 cursor-default"
                style={{
                  bottom: `calc(${pct * 100}% - 5px)`,
                  height: 10,
                }}
              >
                {/* Actual visible 2px line, centred inside the hit area */}
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: 4,
                    height: 2,
                    backgroundColor: color,
                    opacity: 0.85,
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
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

  // 60fps animated VU values — falls back to hb values until first rAF tick
  const vu = useVuMeters(mac);
  const { muteIn, muteOut, invertPolarityOut, noiseGateOut } = useAmpActions();
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
    <TooltipProvider delayDuration={300}>
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
                      style={{
                        height: LABEL_H,
                        lineHeight: `${LABEL_H - 2}px`,
                      }}
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
                          {formatDbfs(dbfsVal)}
                        </span>
                        <span className="text-[9px] text-muted-foreground mt-0.5">
                          dBFS
                        </span>
                      </div>
                      {/* Volume */}
                      <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {channelParams?.channels[i]?.volumeIn.toFixed(1) ??
                            "~"}
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
                        const canClick = muted !== undefined;
                        return (
                          <Button
                            disabled={!canClick}
                            size="sm"
                            onClick={() =>
                              canClick &&
                              void muteIn(mac, i as 0 | 1 | 2 | 3, !muted)
                            }
                            className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                              muted === true
                                ? "border-orange-500/60 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 hover:text-orange-400"
                                : muted === false
                                  ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-orange-500/40 hover:text-orange-400/70"
                                  : "border-border/30 bg-muted/10 text-muted-foreground/30"
                            }`}
                            variant="outline"
                          >
                            {muted === true ? "MUTED" : "Mute In"}
                          </Button>
                        );
                      })()}
                      {/* EQ In */}
                      <EqBandDialog
                        triggerLabel="EQ In"
                        title={`Input EQ — Ch ${CH_LABELS[i]}`}
                        bands={channelParams?.channels[i]?.eqIn}
                      />
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

              // Threshold lines — RMS (yellow) and Peak (orange)
              const chParam = channelParams?.channels[i];
              const thresholdLines: {
                dbu: number;
                color: string;
                label: string;
              }[] = [];
              if (chParam?.rmsLimiter.enabled) {
                const d = thresholdVToDbu(
                  chParam.rmsLimiter.thresholdVrms,
                  ratedRmsV,
                );
                if (d !== null)
                  thresholdLines.push({
                    dbu: d,
                    color: COLORS.RMS_LIMITER,
                    label: `RMS ${chParam.rmsLimiter.thresholdVrms.toFixed(2)} Vrms · ${chParam.rmsLimiter.prmsW} W (${d.toFixed(1)} dB)`,
                  });
              }
              if (chParam?.peakLimiter.enabled) {
                const d = thresholdVToDbu(
                  chParam.peakLimiter.thresholdVp / Math.SQRT2,
                  ratedRmsV,
                );
                if (d !== null)
                  thresholdLines.push({
                    dbu: d,
                    color: COLORS.PEAK_LIMITER,
                    label: `Peak ${chParam.peakLimiter.thresholdVp.toFixed(2)} Vp · ${chParam.peakLimiter.ppeakW} W (${d.toFixed(1)} dB)`,
                  });
              }

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
                    thresholdLines={thresholdLines}
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
                      const canClick = muted !== undefined;
                      return (
                        <Button
                          disabled={!canClick}
                          size="sm"
                          onClick={() =>
                            canClick &&
                            void muteOut(mac, i as 0 | 1 | 2 | 3, !muted)
                          }
                          className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                            muted === true
                              ? "border-orange-500/60 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 hover:text-orange-400"
                              : muted === false
                                ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-orange-500/40 hover:text-orange-400/70"
                                : "border-border/30 bg-muted/10 text-muted-foreground/30"
                          }`}
                          variant="outline"
                        >
                          {muted === true ? "MUTED" : "Mute Out"}
                        </Button>
                      );
                    })()}
                    {/* Noise Gate */}
                    {(() => {
                      const ng = channelParams?.channels[i]?.noiseGateOut;
                      const canClick = ng !== undefined;
                      return (
                        <Button
                          disabled={!canClick}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            canClick &&
                            void noiseGateOut(mac, i as 0 | 1 | 2 | 3, !ng)
                          }
                          className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                            ng === true
                              ? "border-sky-500/60 bg-sky-500/20 text-sky-400"
                              : ng === false
                                ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-sky-500/40 hover:text-sky-400/70"
                                : "border-border/30 bg-muted/10 text-muted-foreground/30"
                          }`}
                        >
                          {ng === true ? "GATE ON" : "Gate"}
                        </Button>
                      );
                    })()}
                    {/* Polarity */}
                    {(() => {
                      const inverted = channelParams?.channels[i]?.invertedOut;
                      const canClick = inverted !== undefined;
                      return (
                        <Button
                          disabled={!canClick}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            canClick &&
                            void invertPolarityOut(
                              mac,
                              i as 0 | 1 | 2 | 3,
                              !inverted,
                            )
                          }
                          className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                            inverted === true
                              ? "border-primary/60 bg-primary/20 text-primary hover:bg-primary/25"
                              : inverted === false
                                ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-primary/40 hover:text-primary/80"
                                : "border-border/30 bg-muted/10 text-muted-foreground/30"
                          }`}
                        >
                          {inverted === true ? "INVERTED" : "Polarity"}
                        </Button>
                      );
                    })()}
                    {/* EQ Out */}
                    <EqBandDialog
                      triggerLabel="EQ Out"
                      title={`Output EQ — Ch ${CH_LABELS[i]}`}
                      bands={channelParams?.channels[i]?.eqOut}
                    />
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
    </TooltipProvider>
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
      <div className="flex flex-col gap-3">
        {channels.map((ch, i) => {
          const isRms = label.startsWith("RMS");
          const lim = isRms ? ch.rmsLimiter : ch.peakLimiter;
          const gr = limiters[i] ?? 0;
          const enabled = lim.enabled;

          return (
            <Card
              key={i}
              className={`relative overflow-visible rounded-tr-none transition-colors ${
                enabled ? "" : "border-border/30 bg-muted/20 opacity-50"
              }`}
            >
              {/* ON / BYP dot — top-right corner */}
              <div
                className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full z-10 ${
                  enabled ? "bg-green-500" : "bg-red-500/60"
                }`}
              />
              <CardContent className="flex items-center gap-4 px-4">
                {/* Channel label + GR bar */}
                <div className="flex items-center gap-2 w-20 flex-shrink-0">
                  <span className="text-[13px] font-bold text-foreground w-10">
                    Out{CH_LABELS[i]}
                  </span>
                  <LimiterGrBar gainReduction={gr} height={28} />
                </div>

                <Separator
                  orientation="vertical"
                  className="self-stretch h-auto opacity-40 flex-shrink-0"
                />

                {/* Threshold + Power */}
                <div className="flex gap-4 flex-shrink-0">
                  <div className="flex flex-col gap-0.5">
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
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      {"thresholdVrms" in lim ? "Prms" : "Ppeak"}
                    </span>
                    <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                      {"thresholdVrms" in lim
                        ? `${ch.rmsLimiter.prmsW} W`
                        : `${ch.peakLimiter.ppeakW} W`}
                    </span>
                  </div>
                </div>

                <Separator
                  orientation="vertical"
                  className="self-stretch h-auto opacity-40 flex-shrink-0"
                />

                {/* Timing fields */}
                <div className="flex gap-4">
                  {"attackMs" in lim ? (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground">
                          Atk
                        </span>
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
                          {lim.attackMs} ms
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
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
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground">
                          Hold
                        </span>
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
                          {(lim as typeof ch.peakLimiter).holdMs} ms
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
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
              </CardContent>
            </Card>
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

function MatrixGrid({
  channels,
  mac,
}: {
  channels: ChannelParams["channels"];
  mac: string;
}) {
  const { setMatrixGain, setMatrixActive } = useAmpActions();

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
                className="text-center text-xs font-semibold text-muted-foreground pb-1 w-24"
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
                  <MatrixCell
                    gain={cell.gain}
                    active={cell.active}
                    onToggleActive={() =>
                      setMatrixActive(
                        mac,
                        ch.channel as 0 | 1 | 2 | 3,
                        cell.source as 0 | 1 | 2 | 3,
                        !cell.active,
                      )
                    }
                    onGainChange={(db) =>
                      setMatrixGain(
                        mac,
                        ch.channel as 0 | 1 | 2 | 3,
                        cell.source as 0 | 1 | 2 | 3,
                        db,
                      )
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCell({
  gain,
  active,
  onToggleActive,
  onGainChange,
}: {
  gain: number;
  active: boolean;
  onToggleActive: () => void;
  onGainChange: (db: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(gain));

  useEffect(() => {
    setDraft(String(gain));
  }, [gain]);

  const label = active
    ? gain === 0
      ? "0 dB"
      : `${gain > 0 ? "+" : ""}${gain} dB`
    : "Mute";

  const clampGain = (value: number) =>
    Math.max(MATRIX_GAIN_MIN_DB, Math.min(MATRIX_GAIN_MAX_DB, value));

  const handleCommit = (close = false) => {
    const parsed = Number.parseFloat(draft);
    if (!isNaN(parsed)) {
      const clamped = clampGain(parsed);
      setDraft(String(clamped));
      onGainChange(clamped);
    } else {
      setDraft(String(gain));
    }
    if (close) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`
            flex flex-col items-center justify-center rounded-md w-24 h-14
            text-xs font-medium border gap-0.5 select-none cursor-pointer transition-colors
            ${
              active
                ? "bg-card border-primary text-foreground"
                : "bg-card border-border text-muted-foreground"
            }
          `}
        >
          <span>{label}</span>
          <span
            className={`text-[9px] ${active ? "text-primary" : "text-muted-foreground"}`}
          >
            {active ? "Active" : "Bypassed"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3 space-y-2" sideOffset={8}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Matrix Gain
        </div>
        <Input
          type="number"
          step="0.5"
          min={String(MATRIX_GAIN_MIN_DB)}
          max={String(MATRIX_GAIN_MAX_DB)}
          disabled={!active}
          className="h-8 text-center text-xs tabular-nums"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => handleCommit(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCommit(true);
            if (e.key === "Escape") {
              setDraft(String(gain));
              setOpen(false);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onToggleActive}
        >
          {active ? "Bypass" : "Enable"}
        </Button>
        <div className="text-[10px] text-muted-foreground text-center">
          Range: {MATRIX_GAIN_MIN_DB.toFixed(1)} to +
          {MATRIX_GAIN_MAX_DB.toFixed(1)} dB
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AmpTabs() {
  type AmpSection = "main" | "matrix" | "preferences";
  const { amps, getDisplayName } = useAmpStore();
  const {
    fetchPresets,
    recallPreset,
    storePreset,
    fetching,
    recallingSlot,
    storingSlot,
    error: presetsError,
  } = useAmpPresets();
  const [selectedMac, setSelectedMac] = useState<string | null>(
    amps.length > 0 ? amps[0].mac : null,
  );
  const [activeSection, setActiveSection] = useState<AmpSection>("main");
  const [activePreset, setActivePreset] = useState<AmpPreset | null>(null);
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [storePresetName, setStorePresetName] = useState("");

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

  useEffect(() => {
    setActivePreset(null);
    setRecallDialogOpen(false);
    setStoreDialogOpen(false);
    setStorePresetName("");
  }, [selectedMac]);

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
          <Button
            key={amp.mac}
            variant={selectedMac === amp.mac ? "outline" : "ghost"}
            size="sm"
            onClick={() => setSelectedMac(amp.mac)}
            className="justify-start gap-2 whitespace-nowrap font-medium"
          >
            <div
              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                amp.reachable ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="truncate">{getDisplayName(amp)}</span>
          </Button>
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
                <div className="flex gap-6 items-start">
                  {/* Matrix */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Crosspoint Matrix
                    </span>
                    <MatrixGrid
                      channels={selectedAmp.channelParams.channels}
                      mac={selectedAmp.mac}
                    />
                  </div>

                  {/* Limiters — side by side */}
                  <div className="flex gap-6 pl-6 border-l border-border/40">
                    <LimiterBlock
                      label="RMS Limiter"
                      channels={selectedAmp.channelParams.channels}
                      limiters={selectedAmp.heartbeat?.limiters ?? [0, 0, 0, 0]}
                    />
                    <Separator
                      orientation="vertical"
                      className="self-stretch h-auto opacity-40"
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
                      ? formatRuntime(selectedAmp.run_time)
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
                <PresetActionDialog
                  open={recallDialogOpen}
                  onOpenChange={setRecallDialogOpen}
                  title="Recall Preset"
                  description={
                    activePreset
                      ? `Recall preset ${activePreset.slot}: ${activePreset.name}?`
                      : "Recall this preset?"
                  }
                  confirmLabel={
                    recallingSlot === activePreset?.slot
                      ? "Recalling..."
                      : "Recall"
                  }
                  confirmDisabled={
                    !selectedAmp?.reachable ||
                    activePreset === null ||
                    recallingSlot !== null
                  }
                  onConfirm={async () => {
                    if (!selectedAmp || !activePreset) return;
                    const ok = await recallPreset(
                      selectedAmp.mac,
                      activePreset.slot,
                      activePreset.name,
                    );
                    if (ok) setRecallDialogOpen(false);
                  }}
                />

                <PresetActionDialog
                  open={storeDialogOpen}
                  onOpenChange={(open) => {
                    setStoreDialogOpen(open);
                    if (!open && activePreset)
                      setStorePresetName(activePreset.name);
                  }}
                  title="Store Preset"
                  description={
                    activePreset
                      ? `Store current device state to preset ${activePreset.slot}.`
                      : "Choose a name for this preset."
                  }
                  confirmLabel={
                    storingSlot === activePreset?.slot ? "Storing..." : "Store"
                  }
                  confirmDisabled={
                    !selectedAmp?.reachable ||
                    activePreset === null ||
                    storingSlot !== null ||
                    storePresetName.trim().length === 0
                  }
                  onConfirm={async () => {
                    if (!selectedAmp || !activePreset) return;
                    const ok = await storePreset(
                      selectedAmp.mac,
                      activePreset.slot,
                      storePresetName,
                    );
                    if (ok) setStoreDialogOpen(false);
                  }}
                >
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Preset Name
                    </label>
                    <Input
                      value={storePresetName}
                      onChange={(e) => setStorePresetName(e.target.value)}
                      placeholder="Enter preset name"
                      maxLength={32}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">
                      {storePresetName.length}/32
                    </p>
                  </div>
                </PresetActionDialog>

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
                      <li key={preset.slot} className="list-none">
                        <div
                          role="button"
                          tabIndex={selectedAmp.reachable ? 0 : -1}
                          onClick={() => {
                            if (!selectedAmp.reachable) return;
                            setActivePreset((current) =>
                              current?.slot === preset.slot ? null : preset,
                            );
                            setStorePresetName(preset.name);
                          }}
                          onKeyDown={(e) => {
                            if (!selectedAmp.reachable) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActivePreset((current) =>
                                current?.slot === preset.slot ? null : preset,
                              );
                              setStorePresetName(preset.name);
                            }
                          }}
                          className={`flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-sm text-left transition-colors ${
                            activePreset?.slot === preset.slot
                              ? "border-primary/40 bg-accent"
                              : "hover:bg-accent"
                          } ${
                            !selectedAmp.reachable
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }`}
                        >
                          <span className="w-6 text-center text-xs font-mono text-muted-foreground">
                            {preset.slot}
                          </span>
                          <span className="font-medium flex-1 min-w-0 truncate">
                            {preset.name}
                          </span>
                          {activePreset?.slot === preset.slot && (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStorePresetName(preset.name);
                                  setStoreDialogOpen(true);
                                }}
                              >
                                Store
                              </Button>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecallDialogOpen(true);
                                }}
                              >
                                Recall
                              </Button>
                            </div>
                          )}
                        </div>
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
