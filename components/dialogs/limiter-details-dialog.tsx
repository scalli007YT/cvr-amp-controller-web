"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { VerticalDbMeter } from "@/components/monitor/vertical-db-meter";
import { Separator } from "@/components/ui/separator";
import { COLORS } from "@/lib/colors";
import {
  limiterPowerFromLoad,
  limiterVoltageFromPower,
  rmsToPeakVoltage,
  voltageToMeterDb,
} from "@/lib/generic";
import {
  RMS_LIMITER_THRESHOLD_MIN_VRMS,
  PEAK_LIMITER_THRESHOLD_MIN_VP,
} from "@/lib/constants";

function LimiterFieldRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="grid grid-cols-[92px_auto_auto] items-center gap-2">
      <span>{label}</span>
      <Input
        value={value}
        readOnly
        disabled
        className="h-8 w-32 text-right font-mono tabular-nums"
      />
      <span className="m-0 p-0 text-[10px] leading-none text-muted-foreground">
        {unit ?? ""}
      </span>
    </div>
  );
}

function EditableLimiterFieldRow({
  label,
  value,
  unit,
  inputMode = "decimal",
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  unit?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
  onCommit: (nextValue: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(value);
  }, [value, dirty]);

  const commit = () => {
    onCommit(draft);
    setDirty(false);
  };

  const reset = () => {
    setDraft(value);
    setDirty(false);
  };

  return (
    <div className="grid grid-cols-[92px_auto_auto] items-center gap-2">
      <span>{label}</span>
      <Input
        type="number"
        inputMode={inputMode}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") reset();
        }}
        className="h-8 w-32 text-right font-mono tabular-nums"
      />
      <span className="m-0 p-0 text-[10px] leading-none text-muted-foreground">
        {unit ?? ""}
      </span>
    </div>
  );
}

function CenteredEditableField({
  label,
  value,
  unit,
  inputMode = "decimal",
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  unit?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
  onCommit: (nextValue: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(value);
  }, [value, dirty]);

  const commit = () => {
    onCommit(draft);
    setDirty(false);
  };

  const reset = () => {
    setDraft(value);
    setDirty(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-xs">{label}</p>
      <div className="flex items-center justify-center gap-2">
        <Input
          type="number"
          inputMode={inputMode}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") reset();
          }}
          className="h-8 w-24 text-center font-mono tabular-nums"
        />
        <span className="text-[10px] leading-none text-muted-foreground">
          {unit ?? ""}
        </span>
      </div>
    </div>
  );
}

function MeterWithScale({
  value,
  dbTop,
  dbBottom,
  ticks,
  scaleSide = "right",
  fillDirection = "bottom-up",
  height = 220,
  width = 36,
  thresholdLines,
}: {
  value: number | null;
  dbTop: number;
  dbBottom: number;
  ticks?: number[];
  scaleSide?: "left" | "right";
  fillDirection?: "bottom-up" | "top-down";
  height?: number;
  width?: number;
  thresholdLines?: { db: number; color: string; label?: string }[];
}) {
  const hasScale = Boolean(ticks?.length);

  return (
    <div className="relative flex items-stretch justify-center">
      {hasScale && scaleSide === "left" ? (
        <div className="absolute right-full mr-2 flex h-full flex-col justify-between py-1 text-[9px] leading-none text-muted-foreground">
          {ticks!.map((tick) => (
            <span key={tick} className="text-right tabular-nums">
              {tick}
            </span>
          ))}
        </div>
      ) : null}

      <VerticalDbMeter
        value={value}
        dbTop={dbTop}
        dbBottom={dbBottom}
        height={height}
        width={width}
        fillDirection={fillDirection}
        thresholdLines={thresholdLines}
      />

      {hasScale && scaleSide === "right" ? (
        <div className="absolute left-full ml-2 flex h-full flex-col justify-between py-1 text-[9px] leading-none text-muted-foreground">
          {ticks!.map((tick) => (
            <span key={tick} className="text-right tabular-nums">
              {tick}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LimiterDetailsDialog({
  trigger,
  mac,
  channel,
  channelName,
  ratedRmsV,
  loadOhm,
  rms,
  peak,
  gr,
  outputDb,
  onToggleRms,
  onTogglePeak,
  onSetRmsAttack,
  onSetRmsReleaseMultiplier,
  onSetRmsThreshold,
  onSetPeakHold,
  onSetPeakRelease,
  onSetPeakThreshold,
  onSetOhms,
}: {
  trigger: ReactNode;
  mac: string;
  channel: 0 | 1 | 2 | 3;
  channelName: string;
  ratedRmsV?: number;
  loadOhm?: number;
  rms: {
    enabled: boolean;
    thresholdVrms: number;
    attackMs: number;
    releaseMultiplier: number;
    prmsW: number;
  };
  peak: {
    enabled: boolean;
    thresholdVp: number;
    holdMs: number;
    releaseMs: number;
    ppeakW: number;
  };
  gr: number;
  outputDb: number | null;
  onToggleRms: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    enabled: boolean,
  ) => Promise<void>;
  onTogglePeak: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    enabled: boolean,
  ) => Promise<void>;
  onSetRmsAttack: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    attackMs: number,
    config: {
      enabled: boolean;
      attackMs: number;
      releaseMultiplier: number;
      thresholdVrms: number;
    },
  ) => Promise<void>;
  onSetRmsReleaseMultiplier: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    releaseMultiplier: number,
    config: {
      enabled: boolean;
      attackMs: number;
      releaseMultiplier: number;
      thresholdVrms: number;
    },
  ) => Promise<void>;
  onSetRmsThreshold: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    thresholdVrms: number,
    config: {
      enabled: boolean;
      attackMs: number;
      releaseMultiplier: number;
      thresholdVrms: number;
    },
  ) => Promise<void>;
  onSetPeakHold: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    holdMs: number,
    config: {
      enabled: boolean;
      holdMs: number;
      releaseMs: number;
      thresholdVp: number;
    },
  ) => Promise<void>;
  onSetPeakRelease: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    releaseMs: number,
    config: {
      enabled: boolean;
      holdMs: number;
      releaseMs: number;
      thresholdVp: number;
    },
  ) => Promise<void>;
  onSetPeakThreshold: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    thresholdVp: number,
    config: {
      enabled: boolean;
      holdMs: number;
      releaseMs: number;
      thresholdVp: number;
    },
  ) => Promise<void>;
  onSetOhms: (
    mac: string,
    channel: 0 | 1 | 2 | 3,
    ohms: number,
  ) => Promise<void>;
}) {
  const METER_H = 220;
  const METER_W = 36;
  const resolvedLoadOhm = loadOhm ?? 8;
  const maxVrms = ratedRmsV ?? 200;
  const maxVp = rmsToPeakVoltage(ratedRmsV) ?? maxVrms * Math.SQRT2;

  // Local draft state so sliders track live during drag
  const [rmsSliderV, setRmsSliderV] = useState(rms.thresholdVrms);
  const [peakSliderV, setPeakSliderV] = useState(peak.thresholdVp);

  // Sync slider from external prop changes (e.g. polled updates) only when not dragging
  useEffect(() => {
    setRmsSliderV(rms.thresholdVrms);
  }, [rms.thresholdVrms]);
  useEffect(() => {
    setPeakSliderV(peak.thresholdVp);
  }, [peak.thresholdVp]);

  // Live power derived from slider draft values
  const liveRmsPrmsW = Math.round((rmsSliderV * rmsSliderV) / resolvedLoadOhm);
  const livePeakPpeakW = Math.round(
    (peakSliderV * peakSliderV) / resolvedLoadOhm,
  );
  const limiterCompDb = Math.max(0, Math.min(20, -gr));
  const thresholdLines: { db: number; color: string; label: string }[] = [];

  if (rms.enabled) {
    const d = voltageToMeterDb(rmsSliderV, ratedRmsV);
    if (d !== null) {
      thresholdLines.push({
        db: d,
        color: COLORS.RMS_LIMITER,
        label: `RMS ${rmsSliderV.toFixed(2)} Vrms - ${liveRmsPrmsW} W (${d.toFixed(1)} dB)`,
      });
    }
  }

  if (peak.enabled) {
    const d = voltageToMeterDb(peakSliderV, rmsToPeakVoltage(ratedRmsV));
    if (d !== null) {
      thresholdLines.push({
        db: d,
        color: COLORS.PEAK_LIMITER,
        label: `Peak ${peakSliderV.toFixed(2)} Vp - ${livePeakPpeakW} W (${d.toFixed(1)} dB)`,
      });
    }
  }

  const rmsConfig = {
    enabled: rms.enabled,
    attackMs: rms.attackMs,
    releaseMultiplier: rms.releaseMultiplier,
    thresholdVrms: rms.thresholdVrms,
  };
  const peakConfig = {
    enabled: peak.enabled,
    holdMs: peak.holdMs,
    releaseMs: peak.releaseMs,
    thresholdVp: peak.thresholdVp,
  };

  const commitRmsThreshold = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    void onSetRmsThreshold(mac, channel, parsed, rmsConfig);
  };

  const commitRmsPower = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const nextVoltage = limiterVoltageFromPower(parsed, resolvedLoadOhm);
    void onSetRmsThreshold(mac, channel, nextVoltage, rmsConfig);
  };

  const commitRmsAttack = (nextValue: string) => {
    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }
    void onSetRmsAttack(mac, channel, parsed, rmsConfig);
  };

  const commitRmsReleaseMultiplier = (nextValue: string) => {
    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }
    void onSetRmsReleaseMultiplier(mac, channel, parsed, rmsConfig);
  };

  const commitPeakThreshold = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    void onSetPeakThreshold(mac, channel, parsed, peakConfig);
  };

  const commitPeakPower = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const nextVoltage = limiterVoltageFromPower(parsed, resolvedLoadOhm);
    void onSetPeakThreshold(mac, channel, nextVoltage, peakConfig);
  };

  const commitPeakHold = (nextValue: string) => {
    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }
    void onSetPeakHold(mac, channel, parsed, peakConfig);
  };

  const commitPeakRelease = (nextValue: string) => {
    const parsed = Number.parseInt(nextValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }
    void onSetPeakRelease(mac, channel, parsed, peakConfig);
  };

  const commitOhms = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    void onSetOhms(mac, channel, parsed);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="text-center">{channelName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          <div className="flex h-full flex-col items-center">
            <p className="text-center text-xs">RMS</p>
            <div className="flex flex-1 items-center justify-center py-3">
              <Slider
                orientation="vertical"
                min={RMS_LIMITER_THRESHOLD_MIN_VRMS}
                max={maxVrms}
                step={0.01}
                value={[rmsSliderV]}
                disabled={!rms.enabled}
                onValueChange={([v]) => setRmsSliderV(v!)}
                onValueCommit={([v]) =>
                  void onSetRmsThreshold(mac, channel, v!, {
                    ...rmsConfig,
                    thresholdVrms: v!,
                  })
                }
              />
            </div>
            <div className="flex w-full justify-center pb-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onToggleRms(mac, channel, !rms.enabled)}
                className={
                  rms.enabled
                    ? "w-full h-auto py-1 text-[11px] font-semibold transition-colors border-green-500/60 bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-400"
                    : "w-full h-auto py-1 text-[11px] font-semibold transition-colors border-red-500/60 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-400"
                }
              >
                {rms.enabled ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          <div className="flex min-w-[180px] flex-col items-center justify-center gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs">Out dB</p>
                <MeterWithScale
                  value={outputDb}
                  dbTop={0}
                  dbBottom={-40}
                  ticks={[0, -8, -16, -24, -32, -40]}
                  scaleSide="left"
                  height={METER_H}
                  width={METER_W}
                  thresholdLines={thresholdLines}
                />
                <p className="font-mono text-xs">
                  {outputDb !== null ? `${outputDb.toFixed(1)} dB` : "---"}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs">Limit dB</p>
                <MeterWithScale
                  value={limiterCompDb}
                  dbTop={20}
                  dbBottom={0}
                  height={METER_H}
                  width={METER_W}
                  fillDirection="top-down"
                />
                <p className="font-mono text-xs">
                  {limiterCompDb.toFixed(1)} dB
                </p>
              </div>
            </div>
            <Separator className="w-16" />
            <CenteredEditableField
              label="Load"
              value={String(resolvedLoadOhm)}
              unit="Ω"
              inputMode="decimal"
              onCommit={commitOhms}
            />
          </div>

          <div className="flex h-full flex-col items-center">
            <p className="text-center text-xs">Peak</p>
            <div className="flex flex-1 items-center justify-center py-3">
              <Slider
                orientation="vertical"
                min={PEAK_LIMITER_THRESHOLD_MIN_VP}
                max={maxVp}
                step={0.01}
                value={[peakSliderV]}
                disabled={!peak.enabled}
                onValueChange={([v]) => setPeakSliderV(v!)}
                onValueCommit={([v]) =>
                  void onSetPeakThreshold(mac, channel, v!, {
                    ...peakConfig,
                    thresholdVp: v!,
                  })
                }
              />
            </div>
            <div className="flex w-full justify-center pb-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onTogglePeak(mac, channel, !peak.enabled)}
                className={
                  peak.enabled
                    ? "w-full h-auto py-1 text-[11px] font-semibold transition-colors border-green-500/60 bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:text-green-400"
                    : "w-full h-auto py-1 text-[11px] font-semibold transition-colors border-red-500/60 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-400"
                }
              >
                {peak.enabled ? "ON" : "OFF"}
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
          <div className="space-y-2">
            <EditableLimiterFieldRow
              label="Threshold"
              value={rmsSliderV.toFixed(2)}
              unit="Vrms"
              onCommit={commitRmsThreshold}
            />
            <EditableLimiterFieldRow
              label="Prms"
              value={String(liveRmsPrmsW)}
              unit="W"
              onCommit={commitRmsPower}
            />
            <EditableLimiterFieldRow
              label="Attack"
              value={String(rms.attackMs)}
              unit="ms"
              inputMode="numeric"
              onCommit={commitRmsAttack}
            />
            <EditableLimiterFieldRow
              label="Release"
              value={String(rms.releaseMultiplier)}
              unit="xAtk"
              inputMode="numeric"
              onCommit={commitRmsReleaseMultiplier}
            />
          </div>

          <Separator orientation="vertical" className="self-stretch h-auto" />

          <div className="space-y-2">
            <EditableLimiterFieldRow
              label="Threshold"
              value={peakSliderV.toFixed(2)}
              unit="Vpeak"
              onCommit={commitPeakThreshold}
            />
            <EditableLimiterFieldRow
              label="Ppeak"
              value={String(livePeakPpeakW)}
              unit="W"
              onCommit={commitPeakPower}
            />
            <EditableLimiterFieldRow
              label="Hold"
              value={String(peak.holdMs)}
              unit="ms"
              inputMode="numeric"
              onCommit={commitPeakHold}
            />
            <EditableLimiterFieldRow
              label="Release"
              value={String(peak.releaseMs)}
              unit="ms"
              inputMode="numeric"
              onCommit={commitPeakRelease}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
