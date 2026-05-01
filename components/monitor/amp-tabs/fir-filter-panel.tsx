"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAmpStore } from "@/stores/AmpStore";
import {
  computeFirResponse,
  computeFirImpulseResponse,
  computeFirTimeZero,
  getFirOrder,
  parseFirFile,
  exportFirFile,
  createDefaultFirCoefficients,
  FIR_MAX_TAPS,
  FIR_SAMPLE_RATE,
  FIR_FREQ_MIN_HZ,
  FIR_FREQ_MAX_HZ,
  FIR_MAGNITUDE_MIN_DB,
  FIR_MAGNITUDE_MAX_DB,
  FIR_PHASE_MIN_DEG,
  FIR_PHASE_MAX_DEG,
  FIR_FREQ_TICKS,
  FIR_DB_TICKS,
  FIR_PHASE_TICKS,
  FIR_CHANNEL_LABELS,
  formatFirFreq,
  type FirState
} from "@/lib/fir";
import { Upload, Download, Trash2 } from "lucide-react";
import { ChannelButtonGroup } from "@/components/custom/channel-button-group";
import { dispatch } from "@/lib/queue-dispatch";

// ---------------------------------------------------------------------------
// Default state per channel
// ---------------------------------------------------------------------------

function defaultFirState(): FirState {
  return {
    coefficients: createDefaultFirCoefficients(),
    bypassed: true,
    name: ""
  };
}

// ---------------------------------------------------------------------------
// SVG chart shared layout
// ---------------------------------------------------------------------------

const VIEW_W = 1200;
const IMPULSE_H = 280;
const FREQ_H = 320;
const PHASE_H = 280;
const PAD = { top: 28, right: 50, bottom: 32, left: 60 };

function chartWidth() {
  return VIEW_W - PAD.left - PAD.right;
}

// ---------------------------------------------------------------------------
// Impulse Response chart
// ---------------------------------------------------------------------------

function ImpulseResponseChart({ coefficients }: { coefficients: number[] }) {
  const cw = chartWidth();
  const ch = IMPULSE_H - PAD.top - PAD.bottom;
  const impulse = useMemo(() => computeFirImpulseResponse(coefficients), [coefficients]);
  const durationMs = (coefficients.length / FIR_SAMPLE_RATE) * 1000;

  // Y range: clamp to ±1 or the abs-max of the data
  const absMax = Math.max(0.01, ...impulse.map((p) => Math.abs(p.amplitude)));
  const yMax = Math.max(1, Math.ceil(absMax * 10) / 10);
  const yMin = -yMax;

  const xScale = (ms: number) => PAD.left + (ms / durationMs) * cw;
  const yScale = (v: number) => PAD.top + ((yMax - Math.min(yMax, Math.max(yMin, v))) / (yMax - yMin)) * ch;

  // Build polyline path
  const pathD = impulse
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.timeMs).toFixed(1)},${yScale(p.amplitude).toFixed(1)}`)
    .join(" ");

  // Y grid: a few symmetric ticks
  const yTicks: number[] = [];
  const step = yMax <= 1 ? 0.3 : yMax <= 2 ? 0.5 : 1;
  for (let v = -yMax; v <= yMax + step * 0.01; v += step) {
    yTicks.push(Math.round(v * 100) / 100);
  }

  // X grid: ms ticks
  const xTicks: number[] = [];
  const xStep = durationMs <= 5 ? 0.5 : durationMs <= 15 ? 1 : 2;
  for (let t = 0; t <= durationMs + xStep * 0.01; t += xStep) {
    xTicks.push(Math.round(t * 100) / 100);
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${IMPULSE_H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Title */}
      <text x={VIEW_W / 2} y={16} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
        Impulse Response
      </text>

      {/* Background */}
      <rect x={PAD.left} y={PAD.top} width={cw} height={ch} className="fill-background/50" rx={2} />

      {/* Y grid */}
      {yTicks.map((v) => (
        <g key={`iy-${v}`}>
          <line
            x1={PAD.left}
            y1={yScale(v)}
            x2={PAD.left + cw}
            y2={yScale(v)}
            className={v === 0 ? "stroke-muted-foreground/40" : "stroke-border/30"}
            strokeWidth={v === 0 ? 0.8 : 0.5}
          />
          <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* X grid */}
      {xTicks.map((t) => (
        <g key={`ix-${t}`}>
          <line
            x1={xScale(t)}
            y1={PAD.top}
            x2={xScale(t)}
            y2={PAD.top + ch}
            className="stroke-border/30"
            strokeWidth={0.5}
          />
          <text x={xScale(t)} y={PAD.top + ch + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {t}
          </text>
        </g>
      ))}

      {/* X axis label */}
      <text x={PAD.left + cw} y={PAD.top + ch + 28} textAnchor="end" className="fill-muted-foreground text-[11px]">
        ms
      </text>

      {/* Impulse path */}
      <path d={pathD} fill="none" className="stroke-emerald-500" strokeWidth={1.5} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Frequency Response chart
// ---------------------------------------------------------------------------

function FrequencyResponseChart({ coefficients }: { coefficients: number[] }) {
  const cw = chartWidth();
  const ch = FREQ_H - PAD.top - PAD.bottom;
  const response = useMemo(() => computeFirResponse(coefficients, 512), [coefficients]);

  const logMin = Math.log10(FIR_FREQ_MIN_HZ);
  const logMax = Math.log10(FIR_FREQ_MAX_HZ);
  const dbMin = FIR_MAGNITUDE_MIN_DB;
  const dbMax = FIR_MAGNITUDE_MAX_DB;

  const xScale = (freq: number) =>
    PAD.left + ((Math.log10(Math.max(freq, FIR_FREQ_MIN_HZ)) - logMin) / (logMax - logMin)) * cw;
  const yScale = (db: number) => PAD.top + ((dbMax - Math.max(dbMin, Math.min(dbMax, db))) / (dbMax - dbMin)) * ch;

  const pathD = response
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.freq).toFixed(1)},${yScale(p.magnitude).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${FREQ_H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Title */}
      <text x={VIEW_W / 2} y={16} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
        Frequency Response
      </text>

      {/* Background */}
      <rect x={PAD.left} y={PAD.top} width={cw} height={ch} className="fill-background/50" rx={2} />

      {/* dB grid */}
      {FIR_DB_TICKS.map((db) => (
        <g key={`fd-${db}`}>
          <line
            x1={PAD.left}
            y1={yScale(db)}
            x2={PAD.left + cw}
            y2={yScale(db)}
            className={db === 0 ? "stroke-muted-foreground/40" : "stroke-border/30"}
            strokeWidth={db === 0 ? 0.8 : 0.5}
          />
          <text x={PAD.left - 6} y={yScale(db) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {db}
          </text>
        </g>
      ))}

      {/* Y axis label */}
      <text x={PAD.left - 6} y={PAD.top - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
        dB
      </text>

      {/* Frequency grid */}
      {FIR_FREQ_TICKS.map((f) => (
        <g key={`ff-${f}`}>
          <line
            x1={xScale(f)}
            y1={PAD.top}
            x2={xScale(f)}
            y2={PAD.top + ch}
            className="stroke-border/30"
            strokeWidth={0.5}
          />
          <text x={xScale(f)} y={PAD.top + ch + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {formatFirFreq(f)}
          </text>
        </g>
      ))}

      {/* Hz label */}
      <text x={PAD.left + cw} y={PAD.top + ch + 28} textAnchor="end" className="fill-muted-foreground text-[11px]">
        Hz
      </text>

      {/* Frequency response curve */}
      <path d={pathD} fill="none" className="stroke-amber-500" strokeWidth={1.8} />

      {/* 0 dB reference line (brighter) */}
      <line
        x1={PAD.left}
        y1={yScale(0)}
        x2={PAD.left + cw}
        y2={yScale(0)}
        className="stroke-amber-500/30"
        strokeWidth={0.8}
        strokeDasharray="4,3"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Phase Response chart
// ---------------------------------------------------------------------------

function PhaseResponseChart({ coefficients }: { coefficients: number[] }) {
  const cw = chartWidth();
  const ch = PHASE_H - PAD.top - PAD.bottom;
  const response = useMemo(() => computeFirResponse(coefficients, 512), [coefficients]);

  const logMin = Math.log10(FIR_FREQ_MIN_HZ);
  const logMax = Math.log10(FIR_FREQ_MAX_HZ);

  const xScale = (freq: number) =>
    PAD.left + ((Math.log10(Math.max(freq, FIR_FREQ_MIN_HZ)) - logMin) / (logMax - logMin)) * cw;
  const yScale = (deg: number) =>
    PAD.top +
    ((FIR_PHASE_MAX_DEG - Math.max(FIR_PHASE_MIN_DEG, Math.min(FIR_PHASE_MAX_DEG, deg))) /
      (FIR_PHASE_MAX_DEG - FIR_PHASE_MIN_DEG)) *
      ch;

  const pathD = response
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.freq).toFixed(1)},${yScale(p.phase).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${PHASE_H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Title */}
      <text x={VIEW_W / 2} y={16} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">
        Phase Response
      </text>

      {/* Background */}
      <rect x={PAD.left} y={PAD.top} width={cw} height={ch} className="fill-background/50" rx={2} />

      {/* Phase grid */}
      {FIR_PHASE_TICKS.map((deg) => (
        <g key={`pd-${deg}`}>
          <line
            x1={PAD.left}
            y1={yScale(deg)}
            x2={PAD.left + cw}
            y2={yScale(deg)}
            className={deg === 0 ? "stroke-muted-foreground/40" : "stroke-border/30"}
            strokeWidth={deg === 0 ? 0.8 : 0.5}
          />
          <text x={PAD.left - 6} y={yScale(deg) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {deg}°
          </text>
        </g>
      ))}

      {/* Y axis label */}
      <text x={PAD.left - 6} y={PAD.top - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
        deg
      </text>

      {/* Frequency grid */}
      {FIR_FREQ_TICKS.map((f) => (
        <g key={`pf-${f}`}>
          <line
            x1={xScale(f)}
            y1={PAD.top}
            x2={xScale(f)}
            y2={PAD.top + ch}
            className="stroke-border/30"
            strokeWidth={0.5}
          />
          <text x={xScale(f)} y={PAD.top + ch + 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {formatFirFreq(f)}
          </text>
        </g>
      ))}

      {/* Hz label */}
      <text x={PAD.left + cw} y={PAD.top + ch + 28} textAnchor="end" className="fill-muted-foreground text-[11px]">
        Hz
      </text>

      {/* Phase curve */}
      <path d={pathD} fill="none" className="stroke-sky-400" strokeWidth={1.5} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// FIR Filter Dialog — opened per output channel from the HeartbeatDashboard
// ---------------------------------------------------------------------------

interface FirFilterDialogProps {
  /** MAC address of the target amp */
  mac: string;
  /** Output channel index (0-based) */
  channel: number;
  /** Dialog title */
  title: string;
  /** Optional className for the trigger button */
  triggerClassName?: string;
  /** Total number of channels for channel switching */
  channelCount?: number;
}

export function FirFilterDialog({ mac, channel, title, triggerClassName, channelCount }: FirFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [firState, setFirState] = useState<FirState>(defaultFirState);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Channel switching state
  const enableChannelSwitching = channelCount !== undefined && channelCount > 1;
  const [activeChannel, setActiveChannel] = useState(channel);
  const effectiveChannel = enableChannelSwitching ? activeChannel : channel;

  // Sync bypass state from device (FC=27 parsed value)
  const deviceFirBypassed = useAmpStore(
    (s) => s.amps.find((a) => a.mac === mac)?.channelParams?.channels[effectiveChannel]?.firBypassed
  );

  // FIR data from AmpStore cache
  const firCacheKey = useAmpStore.getState().getFirCacheKey(mac, effectiveChannel);
  const firCacheEntry = useAmpStore((s) => s.firCache[firCacheKey]);
  const loading = firCacheEntry?.loading ?? false;

  useEffect(() => {
    if (deviceFirBypassed !== undefined) {
      setFirState((prev) => ({ ...prev, bypassed: deviceFirBypassed }));
    }
  }, [deviceFirBypassed]);

  // Fetch FIR data from store when dialog opens or channel changes
  useEffect(() => {
    if (!open) return;
    // Invalidate so we always get fresh data when dialog opens
    useAmpStore.getState().invalidateFirCache(mac, effectiveChannel);
    useAmpStore.getState().fetchFirData(mac, effectiveChannel);
  }, [open, mac, effectiveChannel]);

  // Sync FIR cache into local state when cache updates
  useEffect(() => {
    if (firCacheEntry && !firCacheEntry.loading && firCacheEntry.coefficients.length > 0) {
      setFirState((prev) => ({
        ...prev,
        coefficients: firCacheEntry.coefficients,
        name: firCacheEntry.name || prev.name
      }));
    }
  }, [firCacheEntry]);

  const coefficients = firState.coefficients;
  const order = getFirOrder(coefficients);
  const timeZero = useMemo(() => computeFirTimeZero(coefficients), [coefficients]);

  // Shared amp-action POST helper routed through the queue engine.
  const postAmpAction = useCallback(
    async (payload: Record<string, unknown>) => {
      const packet = await dispatch({
        origin: "fir-filter-panel.postAmpAction",
        action: (payload.action as string) ?? "firAction",
        priority: "reliable",
        targets: [{ mac, channel: (payload.channel as number) ?? 0 }],
        endpoint: "/api/amp-actions",
        buildPayload: () => ({ mac, ...payload }),
        suppressToast: true,
        throwOnError: true
      });
      if (packet.status === "failed") {
        throw new Error(packet.steps[0]?.error ?? "FIR action failed");
      }
    },
    [mac]
  );

  const sendFirData = useCallback(
    async (nextCoefficients: number[], nextName: string) => {
      await postAmpAction({
        action: "firData",
        channel: effectiveChannel,
        value: 0,
        coefficients: nextCoefficients,
        name: nextName
      });
    },
    [postAmpAction, effectiveChannel]
  );

  // ---- Toggle bypass ----
  const toggleBypass = useCallback(async () => {
    const nextBypassed = !firState.bypassed;
    setFirState((prev) => ({ ...prev, bypassed: nextBypassed }));

    try {
      setSending(true);
      await postAmpAction({ action: "firBypass", channel: effectiveChannel, value: !nextBypassed });
    } catch (err) {
      setFirState((prev) => ({ ...prev, bypassed: !nextBypassed }));
      toast.error(`FIR bypass failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  }, [postAmpAction, effectiveChannel, firState.bypassed]);

  // ---- Import FIR file ----
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = parseFirFile(text);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.coefficients.length === 0) {
          toast.error("No valid coefficients found in file");
          return;
        }

        const parsed = result.coefficients;

        // Pad to 512
        const padded = new Array<number>(FIR_MAX_TAPS).fill(0);
        for (let i = 0; i < parsed.length; i++) padded[i] = parsed[i];

        const name = file.name.replace(/\.[^.]+$/, "");
        setFirState((prev) => ({ ...prev, coefficients: padded, name }));

        // Send to device
        setSending(true);
        await sendFirData(padded, name);
        toast.success(`FIR loaded: ${name} (${parsed.length} taps)`);
      } catch (err) {
        toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSending(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [sendFirData]
  );

  // ---- Export FIR file ----
  const handleExport = useCallback(() => {
    const content = exportFirFile(coefficients);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${firState.name || `FIR_Ch${FIR_CHANNEL_LABELS[effectiveChannel]}`}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [coefficients, firState.name, effectiveChannel]);

  // ---- Remove FIR data (preserve bypass state) ----
  const handleRemove = useCallback(async () => {
    const previousState = firState;
    const defaultCoeffs = createDefaultFirCoefficients();
    setFirState((prev) => ({ ...prev, coefficients: defaultCoeffs, name: "" }));

    try {
      setSending(true);
      await sendFirData(defaultCoeffs, "");
      toast.success("FIR filter removed");
    } catch (err) {
      setFirState(previousState);
      toast.error(`Remove failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  }, [sendFirData, firState]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`flex h-12 w-full flex-col items-center justify-center rounded border px-1 py-0.5 select-none transition-colors hover:bg-muted/40 ${
            firState.bypassed
              ? "border-border/30 bg-muted/10 text-muted-foreground"
              : "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          } ${triggerClassName ?? ""}`}
        >
          <span className="font-mono text-[13px] font-semibold">FIR</span>
          <span className={`text-[9px] mt-0.5 ${firState.bypassed ? "text-muted-foreground" : "text-emerald-500"}`}>
            {firState.bypassed ? "OFF" : "ON"}
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="w-[94vw] sm:w-[92vw] lg:w-[86vw] xl:w-[80vw] max-w-[1240px] sm:max-w-[92vw] lg:max-w-[86vw] xl:max-w-[1240px] h-[84dvh] max-h-[860px] min-h-[560px] flex flex-col gap-2 p-3 sm:p-4 overflow-hidden">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-6">
            <DialogTitle className="text-sm font-semibold">{title.split(" - ")[0]}</DialogTitle>
            {enableChannelSwitching && channelCount !== undefined && (
              <ChannelButtonGroup
                channelCount={channelCount}
                value={activeChannel}
                onValueChange={setActiveChannel}
                size="sm"
              />
            )}
          </div>
        </DialogHeader>

        {/* Top bar: FIR toggle + info + action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* FIR enable/disable toggle */}
          <button
            onClick={toggleBypass}
            disabled={sending}
            className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-1 text-sm font-semibold transition-colors hover:bg-muted/50"
          >
            <span className="text-xs tracking-wide text-muted-foreground">FIR</span>
            <div
              className={`h-3 w-3 rounded-full transition-colors ${
                firState.bypassed
                  ? "bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                  : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
              }`}
            />
            <span className={`text-xs font-bold ${firState.bypassed ? "text-rose-500" : "text-emerald-500"}`}>
              {firState.bypassed ? "OFF" : "ON"}
            </span>
          </button>

          {/* Filter info */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {firState.name && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {firState.name}
              </Badge>
            )}
            <span>Rate: {FIR_SAMPLE_RATE / 1000}kHz</span>
            <span>
              Order: {order} Taps(Max {FIR_MAX_TAPS})
            </span>
            <span>T₀: {timeZero.timeMs} ms</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={handleImport}
              disabled={sending}
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={handleExport}
              disabled={sending}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={sending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>

          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept=".txt,.csv,.xls" className="hidden" onChange={onFileSelected} />
        </div>

        {/* Three stacked charts */}
        <div className="relative flex-1 min-h-0 flex flex-col gap-1 rounded-lg border border-border/40 bg-card/30 p-2">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60">
              <span className="text-sm text-muted-foreground animate-pulse">Loading FIR data...</span>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ImpulseResponseChart coefficients={coefficients} />
          </div>
          <div className="flex-[1.15] min-h-0">
            <FrequencyResponseChart coefficients={coefficients} />
          </div>
          <div className="flex-1 min-h-0">
            <PhaseResponseChart coefficients={coefficients} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
