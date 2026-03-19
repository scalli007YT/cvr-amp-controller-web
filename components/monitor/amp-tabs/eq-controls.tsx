"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { EqBand } from "@/stores/AmpStore";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useI18n } from "@/components/layout/i18n-provider";
import { useClipboardStore } from "@/stores/ClipboardStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EqCurveChart } from "@/components/monitor/eq-curve-chart";
import { Copy, Clipboard } from "lucide-react";
import {
  getFilterTypeName,
  HPLP_FILTER_TYPE_NAMES,
  EQ_FILTER_TYPE_NAMES,
  getEqFilterTypeCapabilities
} from "@/lib/parse-channel-data";
import { EQ_BAND_LABELS, formatFreqFull } from "@/lib/eq";
import {
  CROSSOVER_FREQ_MIN_HZ,
  CROSSOVER_FREQ_MAX_HZ,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_Q_MIN,
  EQ_BAND_Q_MAX
} from "@/lib/constants";

export type CrossoverTarget = "input" | "output";
type CrossoverKind = "hp" | "lp";

const CROSSOVER_DEFAULT_TYPES: Record<CrossoverKind, number> = {
  hp: 0,
  lp: 4
};

const HPLP_TYPE_OPTIONS = Object.entries(HPLP_FILTER_TYPE_NAMES)
  .map(([key, label]) => ({ value: Number(key), label }))
  .sort((a, b) => a.value - b.value);

const EQ_TYPE_OPTIONS = Object.entries(EQ_FILTER_TYPE_NAMES)
  .map(([key, label]) => ({ value: Number(key), label }))
  .sort((a, b) => a.value - b.value);

function normalizeCrossoverType(kind: CrossoverKind, type: number): number {
  return Number.isInteger(type) && type >= 0 && type <= 10 ? type : CROSSOVER_DEFAULT_TYPES[kind];
}

function formatCrossoverDraft(freq: number): string {
  const rounded = Math.round(freq * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function parseCrossoverDraft(raw: string): number {
  const normalized = raw.replace(/[,\s]/g, "");
  return Number.parseFloat(normalized);
}

function CrossoverBandCell({
  idx,
  band,
  bands,
  mac,
  channel,
  target
}: {
  idx: number;
  band: EqBand;
  bands: EqBand[];
  mac: string;
  channel: number;
  target: CrossoverTarget;
}) {
  const kind: CrossoverKind = idx === 0 ? "hp" : "lp";
  const { applyEqBlock } = useAmpActions();
  const [draft, setDraft] = useState(() => formatCrossoverDraft(band.freq));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (pendingRef.current) {
      pendingRef.current = false;
      setPending(false);
    }
  }, [band]);

  const markPending = () => {
    pendingRef.current = true;
    setPending(true);
  };

  const enabled = !band.bypass;
  const currentType = normalizeCrossoverType(kind, band.type);
  const inputValue = dirty ? draft : formatCrossoverDraft(band.freq);

  const commit = () => {
    const parsed = parseCrossoverDraft(inputValue);
    if (!Number.isFinite(parsed)) {
      setDraft(formatCrossoverDraft(band.freq));
      setDirty(false);
      return;
    }
    const clamped = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, parsed));
    setDraft(formatCrossoverDraft(clamped));
    setDirty(false);
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], freq: clamped };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  const toggleEnabled = () => {
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], type: currentType, bypass: enabled };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  const handleTypeChange = (nextType: number) => {
    if (!Number.isInteger(nextType) || nextType < 0 || nextType > 10) return;
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], type: nextType, bypass: !enabled };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  return (
    <>
      <select
        value={currentType}
        disabled={pending}
        onChange={(e) => handleTypeChange(Number.parseInt(e.target.value, 10))}
        className="mb-1 w-full rounded border border-input bg-background px-1 py-0.5 text-[10px] disabled:opacity-50"
      >
        {HPLP_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="mb-1 flex items-center gap-0.5">
        <Input
          type="number"
          min={String(CROSSOVER_FREQ_MIN_HZ)}
          max={String(CROSSOVER_FREQ_MAX_HZ)}
          step="1"
          value={inputValue}
          disabled={pending}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(formatCrossoverDraft(band.freq));
              setDirty(false);
            }
          }}
          className="h-6 w-full px-1 font-mono text-[10px] tabular-nums"
        />
        <span className="shrink-0 text-[9px] text-muted-foreground">Hz</span>
      </div>
      <button
        disabled={pending}
        onClick={toggleEnabled}
        className={`mt-0.5 w-full rounded-sm py-0.5 text-[9px] font-bold transition-colors disabled:opacity-50 ${
          enabled
            ? "bg-muted/60 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
            : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
        }`}
      >
        {pending ? "…" : enabled ? "Bypass" : "Enable"}
      </button>
    </>
  );
}

function EqBandCell({
  idx,
  band,
  bands,
  mac,
  channel,
  target
}: {
  idx: number;
  band: EqBand;
  bands: EqBand[];
  mac: string;
  channel: number;
  target: CrossoverTarget;
}) {
  const { applyEqBlock } = useAmpActions();
  const [freqDraft, setFreqDraft] = useState(() => formatCrossoverDraft(band.freq));
  const [gainDraft, setGainDraft] = useState(() => String(Math.round(band.gain * 10) / 10));
  const [qDraft, setQDraft] = useState(() => band.q.toFixed(2));
  const [freqDirty, setFreqDirty] = useState(false);
  const [gainDirty, setGainDirty] = useState(false);
  const [qDirty, setQDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (pendingRef.current) {
      pendingRef.current = false;
      setPending(false);
    }
  }, [band]);

  const markPending = () => {
    pendingRef.current = true;
    setPending(true);
  };

  const freqValue = freqDirty ? freqDraft : formatCrossoverDraft(band.freq);
  const gainValue = gainDirty ? gainDraft : String(Math.round(band.gain * 10) / 10);
  const qValue = qDirty ? qDraft : band.q.toFixed(2);
  const capabilities = getEqFilterTypeCapabilities(band.type);
  const gainDisabled = pending || !capabilities.supportsGain;
  const qDisabled = pending || !capabilities.supportsQ;

  const commitFreq = () => {
    const parsed = parseCrossoverDraft(freqValue);
    if (!Number.isFinite(parsed)) {
      setFreqDraft(formatCrossoverDraft(band.freq));
      setFreqDirty(false);
      return;
    }
    const clamped = Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, parsed));
    setFreqDraft(formatCrossoverDraft(clamped));
    setFreqDirty(false);
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], freq: clamped };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  const commitGain = () => {
    if (!capabilities.supportsGain) {
      setGainDraft(String(Math.round(band.gain * 10) / 10));
      setGainDirty(false);
      return;
    }
    const parsed = parseCrossoverDraft(gainValue);
    if (!Number.isFinite(parsed)) {
      setGainDraft(String(Math.round(band.gain * 10) / 10));
      setGainDirty(false);
      return;
    }
    const clamped = Math.max(EQ_BAND_GAIN_MIN_DB, Math.min(EQ_BAND_GAIN_MAX_DB, parsed));
    setGainDraft(String(Math.round(clamped * 10) / 10));
    setGainDirty(false);
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], gain: clamped };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  const commitQ = () => {
    if (!capabilities.supportsQ) {
      setQDraft(band.q.toFixed(2));
      setQDirty(false);
      return;
    }
    const parsed = parseCrossoverDraft(qValue);
    if (!Number.isFinite(parsed)) {
      setQDraft(band.q.toFixed(2));
      setQDirty(false);
      return;
    }
    const clamped = Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, parsed));
    setQDraft(clamped.toFixed(2));
    setQDirty(false);
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], q: clamped };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  const handleTypeChange = (nextType: number) => {
    if (!Number.isInteger(nextType) || nextType < 0 || nextType > 10) return;
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], type: nextType };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  const toggleBypass = () => {
    markPending();
    const nextBands = bands.map((item) => ({ ...item }));
    nextBands[idx] = { ...nextBands[idx], bypass: !band.bypass };
    void applyEqBlock(mac, channel, target, nextBands);
  };

  return (
    <>
      <select
        value={band.type}
        disabled={pending}
        onChange={(e) => handleTypeChange(Number.parseInt(e.target.value, 10))}
        className="mb-1 w-full rounded border border-input bg-background px-1 py-0.5 text-[10px] disabled:opacity-50"
      >
        {EQ_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="mb-0.5 flex items-center gap-0.5">
        <Input
          type="number"
          min={String(CROSSOVER_FREQ_MIN_HZ)}
          max={String(CROSSOVER_FREQ_MAX_HZ)}
          step="1"
          value={freqValue}
          disabled={pending}
          onChange={(e) => {
            setFreqDraft(e.target.value);
            setFreqDirty(true);
          }}
          onBlur={commitFreq}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitFreq();
            if (e.key === "Escape") {
              setFreqDraft(formatCrossoverDraft(band.freq));
              setFreqDirty(false);
            }
          }}
          className="h-6 w-full px-1 font-mono text-[10px] tabular-nums"
        />
        <span className="shrink-0 text-[9px] text-muted-foreground">Hz</span>
      </div>
      <div className="mb-0.5 flex items-center gap-0.5">
        <Input
          type="number"
          min={String(EQ_BAND_GAIN_MIN_DB)}
          max={String(EQ_BAND_GAIN_MAX_DB)}
          step="0.1"
          value={gainValue}
          disabled={gainDisabled}
          onChange={(e) => {
            setGainDraft(e.target.value);
            setGainDirty(true);
          }}
          onBlur={commitGain}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitGain();
            if (e.key === "Escape") {
              setGainDraft(String(Math.round(band.gain * 10) / 10));
              setGainDirty(false);
            }
          }}
          className="h-6 w-full px-1 font-mono text-[10px] tabular-nums"
        />
        <span className="shrink-0 text-[9px] text-muted-foreground">dB</span>
      </div>
      <div className="mb-0.5 flex items-center gap-0.5">
        <Input
          type="number"
          min={String(EQ_BAND_Q_MIN)}
          max={String(EQ_BAND_Q_MAX)}
          step="0.01"
          value={qValue}
          disabled={qDisabled}
          onChange={(e) => {
            setQDraft(e.target.value);
            setQDirty(true);
          }}
          onBlur={commitQ}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitQ();
            if (e.key === "Escape") {
              setQDraft(band.q.toFixed(2));
              setQDirty(false);
            }
          }}
          className="h-6 w-full px-1 font-mono text-[10px] tabular-nums"
        />
        <span className="shrink-0 text-[9px] text-muted-foreground">Q</span>
      </div>
      <button
        disabled={pending}
        onClick={toggleBypass}
        className={`mt-0.5 w-full rounded-sm py-0.5 text-[9px] font-bold transition-colors disabled:opacity-50 ${
          band.bypass
            ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
            : "bg-muted/60 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
        }`}
      >
        {pending ? "…" : band.bypass ? "Enable" : "Bypass"}
      </button>
    </>
  );
}

function EqParamStrip({
  bands,
  mac,
  channel,
  target
}: {
  bands: EqBand[];
  mac?: string;
  channel?: number;
  target?: CrossoverTarget;
}) {
  const hasInteractive = mac !== undefined && channel !== undefined && target !== undefined;

  return (
    <div
      className="grid gap-px m-4"
      style={{
        gridTemplateColumns: `repeat(${bands.length}, minmax(64px, 1fr))`,
        minWidth: `${bands.length * 72}px`
      }}
    >
      {bands.map((band, idx) => {
        const isHpLp = idx === 0 || idx === 9;
        const bypassed = band.bypass;
        const interactive = hasInteractive;

        return (
          <div
            key={idx}
            className={`flex flex-col items-center text-center py-2 px-1 ${
              interactive ? "" : bypassed ? "opacity-40" : ""
            }`}
          >
            <div className="text-[11px] font-bold mb-2 w-full py-0.5 rounded-sm bg-muted text-foreground">
              {EQ_BAND_LABELS[idx]}
            </div>

            {interactive ? (
              isHpLp ? (
                <CrossoverBandCell
                  idx={idx}
                  band={band}
                  bands={bands}
                  mac={mac as string}
                  channel={channel as number}
                  target={target as CrossoverTarget}
                />
              ) : (
                <EqBandCell
                  idx={idx}
                  band={band}
                  bands={bands}
                  mac={mac as string}
                  channel={channel as number}
                  target={target as CrossoverTarget}
                />
              )
            ) : (
              <>
                <div className="text-[10px] font-medium mb-1 text-muted-foreground">
                  {getFilterTypeName(band.type, idx)}
                </div>
                <div className="text-[11px] tabular-nums text-foreground">
                  {formatFreqFull(band.freq)} <span className="text-[9px] text-muted-foreground">Hz</span>
                </div>
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
                    {band.gain.toFixed(1)} <span className="text-[9px] text-muted-foreground">dB</span>
                  </div>
                )}
                {!isHpLp && (
                  <div className="text-[10px] tabular-nums mt-0.5 text-muted-foreground">Q: {band.q.toFixed(1)}</div>
                )}
                <div
                  className={`text-[9px] font-bold mt-1.5 w-full py-0.5 rounded-sm ${
                    bypassed ? "bg-destructive/10 text-destructive" : "bg-muted/60 text-muted-foreground/50"
                  }`}
                >
                  {bypassed ? "Bypass" : isHpLp ? "ON" : "Bypass"}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EqBandDialog({
  triggerLabel,
  title,
  bands,
  mac,
  channel,
  target,
  triggerClassName,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  onTriggerFocus,
  onTriggerBlur
}: {
  triggerLabel: string;
  title: string;
  bands?: EqBand[];
  mac?: string;
  channel?: number;
  target?: CrossoverTarget;
  triggerClassName?: string;
  onTriggerMouseEnter?: () => void;
  onTriggerMouseLeave?: () => void;
  onTriggerFocus?: () => void;
  onTriggerBlur?: () => void;
}) {
  type ChartPatch = Partial<Pick<EqBand, "freq" | "gain" | "q">>;

  const [open, setOpen] = useState(false);
  const [previewBands, setPreviewBands] = useState<EqBand[] | null>(null);
  const [pendingChartPatches, setPendingChartPatches] = useState<Record<number, ChartPatch>>({});
  const { copyEq, pasteEq, canPasteEq, lastError } = useClipboardStore();
  const dict = useI18n();
  const { applyEqBlock } = useAmpActions();
  const isDraggingRef = useRef(false);

  const patchAppliedOnBand = (band: EqBand, patch: ChartPatch): boolean => {
    const matchesFreq = patch.freq === undefined || band.freq === patch.freq;
    const matchesGain = patch.gain === undefined || Math.abs(band.gain - patch.gain) <= 0.05;
    const matchesQ = patch.q === undefined || Math.abs(band.q - patch.q) <= 0.005;
    return matchesFreq && matchesGain && matchesQ;
  };

  useEffect(() => {
    if (!bands) {
      setPreviewBands(null);
      setPendingChartPatches({});
      return;
    }

    setPendingChartPatches((prev) => {
      const entries = Object.entries(prev);
      if (entries.length === 0) return prev;
      let changed = false;
      const next: Record<number, ChartPatch> = {};
      for (const [idxKey, patch] of entries) {
        const idx = Number(idxKey);
        const band = bands[idx];
        if (!band || patchAppliedOnBand(band, patch)) {
          changed = true;
          continue;
        }
        next[idx] = patch;
      }
      return changed ? next : prev;
    });

    if (!isDraggingRef.current) {
      setPreviewBands((prev) => {
        if (!prev) return null;
        return bands.map((band) => ({ ...band }));
      });
    }
  }, [bands]);

  const baseDisplayBands = previewBands ?? bands;
  const displayBands =
    !baseDisplayBands || Object.keys(pendingChartPatches).length === 0
      ? baseDisplayBands
      : baseDisplayBands.map((band, idx) => {
          const patch = pendingChartPatches[idx];
          return patch ? { ...band, ...patch } : band;
        });
  const cloneBands = (source: EqBand[]) => source.map((band) => ({ ...band }));

  const handleCopy = () => {
    if (bands) {
      copyEq(bands);
      toast.success("Copied EQ settings");
    }
  };

  const handlePaste = () => {
    const pastedBands = pasteEq();
    if (!pastedBands) {
      if (lastError) {
        toast.error(lastError);
      }
      return;
    }

    if (mac === undefined || channel === undefined || target === undefined) {
      toast.error("Cannot paste: invalid amp/channel");
      return;
    }

    void applyEqBlock(
      mac,
      channel,
      target,
      pastedBands.map((band) => ({ ...band }))
    );

    toast.success("Pasted EQ settings");
  };

  const handleChartPreviewChange = (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => {
    setPreviewBands((prev) => {
      const source = prev ?? (bands ? cloneBands(bands) : null);
      if (!source || !source[bandIdx]) return source;
      const updated = [...source];
      updated[bandIdx] = {
        ...updated[bandIdx],
        ...next
      };
      return updated;
    });
  };

  const handleChartCommit = (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => {
    if (mac === undefined || channel === undefined || target === undefined || !bands || !bands[bandIdx]) return;

    const isHpLp = bandIdx === 0 || bandIdx === 9;
    const patch: ChartPatch = {};
    const nextBands = bands.map((band) => ({ ...band }));

    if (next.freq !== undefined) {
      patch.freq = next.freq;
      nextBands[bandIdx] = {
        ...nextBands[bandIdx],
        freq: next.freq
      };
    }

    if (!isHpLp && next.gain !== undefined) {
      patch.gain = next.gain;
      nextBands[bandIdx] = {
        ...nextBands[bandIdx],
        gain: next.gain
      };
    }

    if (!isHpLp && next.q !== undefined) {
      patch.q = next.q;
      nextBands[bandIdx] = {
        ...nextBands[bandIdx],
        q: next.q
      };
    }

    if (patch.freq !== undefined || patch.gain !== undefined || patch.q !== undefined) {
      void applyEqBlock(mac, channel, target, nextBands);
    }

    if (patch.freq !== undefined || patch.gain !== undefined || patch.q !== undefined) {
      setPendingChartPatches((prev) => ({
        ...prev,
        [bandIdx]: {
          ...(prev[bandIdx] ?? {}),
          ...patch
        }
      }));

      setPreviewBands((prev) => {
        const source = prev ?? (bands ? cloneBands(bands) : null);
        if (!source || !source[bandIdx]) return source;
        const updated = [...source];
        updated[bandIdx] = {
          ...updated[bandIdx],
          ...patch
        };
        return updated;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={!bands}
          size="sm"
          variant="outline"
          onMouseEnter={onTriggerMouseEnter}
          onMouseLeave={onTriggerMouseLeave}
          onFocus={onTriggerFocus}
          onBlur={onTriggerBlur}
          className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
            !bands
              ? "border-border/30 bg-muted/10 text-muted-foreground/30"
              : "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/70"
          } ${triggerClassName ?? ""}`}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(64rem,95vw)] max-w-none sm:max-w-none gap-0">
        <div className="absolute top-4 right-20 flex gap-2 z-10">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!bands}
            className="h-8 px-2 text-xs gap-1.5"
            title="Copy EQ settings to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
            {dict.dialogs.common.copy}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePaste}
            disabled={!canPasteEq()}
            className="h-8 px-2 text-xs gap-1.5"
            title="Paste EQ settings from clipboard"
          >
            <Clipboard className="w-3.5 h-3.5" />
            {dict.dialogs.common.paste}
          </Button>
        </div>
        <DialogHeader className="pb-4">
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
        </DialogHeader>
        {displayBands && (
          <>
            <div className="px-3">
              <EqCurveChart
                bands={displayBands}
                interactive={mac !== undefined && channel !== undefined && target !== undefined}
                onBandPreviewChange={handleChartPreviewChange}
                onBandCommit={handleChartCommit}
                onDragStart={() => {
                  isDraggingRef.current = true;
                  if (bands) {
                    setPreviewBands(cloneBands(bands));
                  }
                }}
                onDragEnd={() => {
                  isDraggingRef.current = false;
                  setPreviewBands(null);
                }}
              />
            </div>
            <div className="overflow-x-auto">
              <EqParamStrip bands={displayBands} mac={mac} channel={channel} target={target} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
