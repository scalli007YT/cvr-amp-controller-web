"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { VerticalDbMeter } from "@/components/monitor/vertical-db-meter";
import { Separator } from "@/components/ui/separator";
import { Copy, Clipboard } from "lucide-react";
import { toast } from "sonner";
import { COLORS } from "@/lib/colors";
import { useI18n } from "@/components/layout/i18n-provider";
import { useClipboardStore } from "@/stores/ClipboardStore";
import {
  bridgeVoltageMultiplier,
  fromLimiterDisplayVoltage,
  limiterDisplayMaxVp,
  limiterDisplayMaxVrms,
  limiterDisplayMinVp,
  limiterDisplayMinVrms,
  limiterPowerFromDisplayVoltage,
  limiterPowerFromLoad,
  limiterRawVoltageFromDisplayPower,
  limiterVoltageFromPower,
  normalizeLimiterLoadOhm,
  rmsToPeakVoltage,
  toLimiterDisplayVoltage,
  voltageToMeterDb
} from "@/lib/generic";
import { RMS_LIMITER_THRESHOLD_MIN_VRMS, PEAK_LIMITER_THRESHOLD_MIN_VP } from "@/lib/constants";

function LimiterFieldRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="grid grid-cols-[92px_auto_auto] items-center gap-2">
      <span>{label}</span>
      <Input value={value} readOnly disabled className="h-8 w-32 text-right font-mono tabular-nums" />
      <span className="m-0 p-0 text-[10px] leading-none text-muted-foreground">{unit ?? ""}</span>
    </div>
  );
}

function EditableLimiterFieldRow({
  label,
  value,
  unit,
  inputMode = "decimal",
  disabled,
  onCommit
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
      <span className="m-0 p-0 text-[10px] leading-none text-muted-foreground">{unit ?? ""}</span>
    </div>
  );
}

function CenteredEditableField({
  label,
  value,
  unit,
  inputMode = "decimal",
  disabled,
  onCommit
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
      <div className="relative flex items-center justify-center">
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
        <span className="absolute left-full ml-1 text-[10px] leading-none text-muted-foreground">{unit ?? ""}</span>
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
  thresholdLines
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
  bridgeMode = false,
  disabled = false,
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
  onSetOhms
}: {
  trigger: ReactNode;
  mac: string;
  channel: number;
  channelName: string;
  bridgeMode?: boolean;
  disabled?: boolean;
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
  onToggleRms: (mac: string, channel: number, enabled: boolean) => Promise<void>;
  onTogglePeak: (mac: string, channel: number, enabled: boolean) => Promise<void>;
  onSetRmsAttack: (
    mac: string,
    channel: number,
    attackMs: number,
    config: {
      enabled: boolean;
      attackMs: number;
      releaseMultiplier: number;
      thresholdVrms: number;
    }
  ) => Promise<void>;
  onSetRmsReleaseMultiplier: (
    mac: string,
    channel: number,
    releaseMultiplier: number,
    config: {
      enabled: boolean;
      attackMs: number;
      releaseMultiplier: number;
      thresholdVrms: number;
    }
  ) => Promise<void>;
  onSetRmsThreshold: (
    mac: string,
    channel: number,
    thresholdVrms: number,
    config: {
      enabled: boolean;
      attackMs: number;
      releaseMultiplier: number;
      thresholdVrms: number;
    }
  ) => Promise<void>;
  onSetPeakHold: (
    mac: string,
    channel: number,
    holdMs: number,
    config: {
      enabled: boolean;
      holdMs: number;
      releaseMs: number;
      thresholdVp: number;
    }
  ) => Promise<void>;
  onSetPeakRelease: (
    mac: string,
    channel: number,
    releaseMs: number,
    config: {
      enabled: boolean;
      holdMs: number;
      releaseMs: number;
      thresholdVp: number;
    }
  ) => Promise<void>;
  onSetPeakThreshold: (
    mac: string,
    channel: number,
    thresholdVp: number,
    config: {
      enabled: boolean;
      holdMs: number;
      releaseMs: number;
      thresholdVp: number;
    }
  ) => Promise<void>;
  onSetOhms: (mac: string, channel: number, ohms: number) => Promise<void>;
}) {
  const dict = useI18n();
  const METER_H = 220;
  const METER_W = 36;
  const bridgeMultiplier = bridgeVoltageMultiplier(bridgeMode);
  const resolvedLoadOhm = normalizeLimiterLoadOhm(loadOhm, bridgeMode);
  const minLoadOhm = bridgeMode ? 4 : 2;
  const maxVrmsRaw = ratedRmsV ?? 200;
  const maxVpRaw = rmsToPeakVoltage(ratedRmsV) ?? maxVrmsRaw * Math.SQRT2;
  const maxVrms = limiterDisplayMaxVrms(maxVrmsRaw, bridgeMode);
  const maxVp = limiterDisplayMaxVp(maxVpRaw, bridgeMode);

  // Local draft state so sliders track live during drag
  const [rmsSliderV, setRmsSliderV] = useState(toLimiterDisplayVoltage(rms.thresholdVrms, bridgeMode));
  const [peakSliderV, setPeakSliderV] = useState(toLimiterDisplayVoltage(peak.thresholdVp, bridgeMode));

  // Sync slider from external prop changes (e.g. polled updates) only when not dragging
  useEffect(() => {
    setRmsSliderV(toLimiterDisplayVoltage(rms.thresholdVrms, bridgeMode));
  }, [rms.thresholdVrms, bridgeMode]);
  useEffect(() => {
    setPeakSliderV(toLimiterDisplayVoltage(peak.thresholdVp, bridgeMode));
  }, [peak.thresholdVp, bridgeMode]);

  useEffect(() => {
    if (bridgeMode && (loadOhm ?? minLoadOhm) < minLoadOhm) {
      void onSetOhms(mac, channel, minLoadOhm);
    }
  }, [bridgeMode, loadOhm, minLoadOhm, onSetOhms, mac, channel]);

  const rmsRawThreshold = fromLimiterDisplayVoltage(rmsSliderV, bridgeMode);
  const peakRawThreshold = fromLimiterDisplayVoltage(peakSliderV, bridgeMode);

  // Live power derived from slider draft values
  const liveRmsPrmsW = limiterPowerFromDisplayVoltage(rmsSliderV, resolvedLoadOhm);
  const livePeakPpeakW = limiterPowerFromDisplayVoltage(peakSliderV, resolvedLoadOhm);
  const limiterCompDb = Math.max(0, Math.min(20, -gr));
  const thresholdLines: { db: number; color: string; label: string }[] = [];

  if (rms.enabled) {
    const d = voltageToMeterDb(rmsRawThreshold, ratedRmsV);
    if (d !== null) {
      thresholdLines.push({
        db: d,
        color: COLORS.RMS_LIMITER,
        label: `${dict.dialogs.limiterDetails.rms} ${rmsSliderV.toFixed(2)} Vrms - ${liveRmsPrmsW} W (${d.toFixed(1)} dB)`
      });
    }
  }

  if (peak.enabled) {
    const d = voltageToMeterDb(peakRawThreshold, rmsToPeakVoltage(ratedRmsV));
    if (d !== null) {
      thresholdLines.push({
        db: d,
        color: COLORS.PEAK_LIMITER,
        label: `${dict.dialogs.limiterDetails.peak} ${peakSliderV.toFixed(2)} Vp - ${livePeakPpeakW} W (${d.toFixed(1)} dB)`
      });
    }
  }

  const rmsConfig = {
    enabled: rms.enabled,
    attackMs: rms.attackMs,
    releaseMultiplier: rms.releaseMultiplier,
    thresholdVrms: rms.thresholdVrms
  };
  const peakConfig = {
    enabled: peak.enabled,
    holdMs: peak.holdMs,
    releaseMs: peak.releaseMs,
    thresholdVp: peak.thresholdVp
  };

  const commitRmsThreshold = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    void onSetRmsThreshold(mac, channel, fromLimiterDisplayVoltage(parsed, bridgeMode), rmsConfig);
  };

  const commitRmsPower = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const nextVoltageDisplay = limiterVoltageFromPower(parsed, resolvedLoadOhm);
    void onSetRmsThreshold(
      mac,
      channel,
      limiterRawVoltageFromDisplayPower(parsed, resolvedLoadOhm, bridgeMode),
      rmsConfig
    );
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
    void onSetPeakThreshold(mac, channel, fromLimiterDisplayVoltage(parsed, bridgeMode), peakConfig);
  };

  const commitPeakPower = (nextValue: string) => {
    const parsed = Number.parseFloat(nextValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const nextVoltageDisplay = limiterVoltageFromPower(parsed, resolvedLoadOhm);
    void onSetPeakThreshold(
      mac,
      channel,
      limiterRawVoltageFromDisplayPower(parsed, resolvedLoadOhm, bridgeMode),
      peakConfig
    );
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
    void onSetOhms(mac, channel, Math.max(parsed, minLoadOhm));
  };

  const {
    copyRmsLimiter,
    pasteRmsLimiter,
    canPasteRmsLimiter,
    copyPeakLimiter,
    pastePeakLimiter,
    canPastePeakLimiter,
    lastError
  } = useClipboardStore();

  const handleCopyRms = () => {
    copyRmsLimiter({
      enabled: rms.enabled,
      thresholdVrms: rms.thresholdVrms,
      attackMs: rms.attackMs,
      releaseMultiplier: rms.releaseMultiplier
    });
    toast.success("Copied RMS Limiter settings");
  };

  const handlePasteRms = () => {
    const limiter = pasteRmsLimiter();
    if (!limiter) {
      if (lastError) {
        toast.error(lastError);
      }
      return;
    }

    void onToggleRms(mac, channel, limiter.enabled);
    void onSetRmsThreshold(mac, channel, limiter.thresholdVrms, {
      enabled: limiter.enabled,
      attackMs: limiter.attackMs,
      releaseMultiplier: limiter.releaseMultiplier,
      thresholdVrms: limiter.thresholdVrms
    });
    void onSetRmsAttack(mac, channel, limiter.attackMs, {
      enabled: limiter.enabled,
      attackMs: limiter.attackMs,
      releaseMultiplier: limiter.releaseMultiplier,
      thresholdVrms: limiter.thresholdVrms
    });
    void onSetRmsReleaseMultiplier(mac, channel, limiter.releaseMultiplier, {
      enabled: limiter.enabled,
      attackMs: limiter.attackMs,
      releaseMultiplier: limiter.releaseMultiplier,
      thresholdVrms: limiter.thresholdVrms
    });
    toast.success("Pasted RMS Limiter settings");
  };

  const handleCopyPeak = () => {
    copyPeakLimiter({
      enabled: peak.enabled,
      thresholdVp: peak.thresholdVp,
      holdMs: peak.holdMs,
      releaseMs: peak.releaseMs
    });
    toast.success("Copied Peak Limiter settings");
  };

  const handlePastePeak = () => {
    const limiter = pastePeakLimiter();
    if (!limiter) {
      if (lastError) {
        toast.error(lastError);
      }
      return;
    }

    void onTogglePeak(mac, channel, limiter.enabled);
    void onSetPeakThreshold(mac, channel, limiter.thresholdVp, {
      enabled: limiter.enabled,
      holdMs: limiter.holdMs,
      releaseMs: limiter.releaseMs,
      thresholdVp: limiter.thresholdVp
    });
    void onSetPeakHold(mac, channel, limiter.holdMs, {
      enabled: limiter.enabled,
      holdMs: limiter.holdMs,
      releaseMs: limiter.releaseMs,
      thresholdVp: limiter.thresholdVp
    });
    void onSetPeakRelease(mac, channel, limiter.releaseMs, {
      enabled: limiter.enabled,
      holdMs: limiter.holdMs,
      releaseMs: limiter.releaseMs,
      thresholdVp: limiter.thresholdVp
    });
    toast.success("Pasted Peak Limiter settings");
  };

  if (disabled) {
    return <>{trigger}</>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader className="flex flex-row items-center gap-2">
          <DialogTitle className="text-center flex-1">{channelName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          <div className="flex h-full flex-col items-center">
            <p className="text-center text-xs">{dict.dialogs.limiterDetails.rms}</p>
            <div className="flex flex-1 items-center justify-center py-3">
              <Slider
                orientation="vertical"
                min={limiterDisplayMinVrms(RMS_LIMITER_THRESHOLD_MIN_VRMS, bridgeMode)}
                max={maxVrms}
                step={0.01}
                value={[rmsSliderV]}
                disabled={!rms.enabled}
                onValueChange={([v]) => setRmsSliderV(v!)}
                onValueCommit={([v]) =>
                  void onSetRmsThreshold(mac, channel, fromLimiterDisplayVoltage(v!, bridgeMode), {
                    ...rmsConfig,
                    thresholdVrms: fromLimiterDisplayVoltage(v!, bridgeMode)
                  })
                }
              />
            </div>
            <div className="flex w-full flex-col justify-center gap-1">
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
                {rms.enabled ? dict.dialogs.limiterDetails.on : dict.dialogs.limiterDetails.off}
              </Button>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyRms}
                  className="h-auto py-1 px-2 text-[9px] flex-1 gap-1"
                  title="Copy RMS Limiter settings"
                >
                  <Copy className="w-3 h-3" />
                  {dict.dialogs.common.copy}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePasteRms}
                  disabled={!canPasteRmsLimiter()}
                  className="h-auto py-1 px-2 text-[9px] flex-1 gap-1"
                  title="Paste RMS Limiter settings"
                >
                  <Clipboard className="w-3 h-3" />
                  {dict.dialogs.common.paste}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex min-w-[180px] flex-col items-center justify-center gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex w-20 flex-col items-center gap-1">
                <p className="text-xs">{dict.dialogs.limiterDetails.outDb}</p>
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
                <p className="font-mono text-xs">{outputDb !== null ? `${outputDb.toFixed(1)} dB` : "---"}</p>
              </div>
              <div className="flex w-20 flex-col items-center gap-1">
                <p className="text-xs">{dict.dialogs.limiterDetails.limitDb}</p>
                <MeterWithScale
                  value={limiterCompDb}
                  dbTop={20}
                  dbBottom={0}
                  height={METER_H}
                  width={METER_W}
                  fillDirection="top-down"
                />
                <p className="font-mono text-xs">{limiterCompDb.toFixed(1)} dB</p>
              </div>
            </div>
            <Separator className="w-16" />
            <CenteredEditableField
              label={dict.dialogs.limiterDetails.load}
              value={String(resolvedLoadOhm)}
              unit="Ω"
              inputMode="decimal"
              onCommit={commitOhms}
            />
          </div>

          <div className="flex h-full flex-col items-center">
            <p className="text-center text-xs">{dict.dialogs.limiterDetails.peak}</p>
            <div className="flex flex-1 items-center justify-center py-3">
              <Slider
                orientation="vertical"
                min={limiterDisplayMinVp(PEAK_LIMITER_THRESHOLD_MIN_VP, bridgeMode)}
                max={maxVp}
                step={0.01}
                value={[peakSliderV]}
                disabled={!peak.enabled}
                onValueChange={([v]) => setPeakSliderV(v!)}
                onValueCommit={([v]) =>
                  void onSetPeakThreshold(mac, channel, fromLimiterDisplayVoltage(v!, bridgeMode), {
                    ...peakConfig,
                    thresholdVp: fromLimiterDisplayVoltage(v!, bridgeMode)
                  })
                }
              />
            </div>
            <div className="flex w-full flex-col justify-center gap-1">
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
                {peak.enabled ? dict.dialogs.limiterDetails.on : dict.dialogs.limiterDetails.off}
              </Button>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPeak}
                  className="h-auto py-1 px-2 text-[9px] flex-1 gap-1"
                  title="Copy Peak Limiter settings"
                >
                  <Copy className="w-3 h-3" />
                  {dict.dialogs.common.copy}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePastePeak}
                  disabled={!canPastePeakLimiter()}
                  className="h-auto py-1 px-2 text-[9px] flex-1 gap-1"
                  title="Paste Peak Limiter settings"
                >
                  <Clipboard className="w-3 h-3" />
                  {dict.dialogs.common.paste}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
          <div className="space-y-2">
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.threshold}
              value={rmsSliderV.toFixed(2)}
              unit="Vrms"
              onCommit={commitRmsThreshold}
            />
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.prms}
              value={String(liveRmsPrmsW)}
              unit="W"
              onCommit={commitRmsPower}
            />
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.attack}
              value={String(rms.attackMs)}
              unit="ms"
              inputMode="numeric"
              onCommit={commitRmsAttack}
            />
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.release}
              value={String(rms.releaseMultiplier)}
              unit="xAtk"
              inputMode="numeric"
              onCommit={commitRmsReleaseMultiplier}
            />
          </div>

          <Separator orientation="vertical" className="self-stretch h-auto" />

          <div className="space-y-2">
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.threshold}
              value={peakSliderV.toFixed(2)}
              unit="Vpeak"
              onCommit={commitPeakThreshold}
            />
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.ppeak}
              value={String(livePeakPpeakW)}
              unit="W"
              onCommit={commitPeakPower}
            />
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.hold}
              value={String(peak.holdMs)}
              unit="ms"
              inputMode="numeric"
              onCommit={commitPeakHold}
            />
            <EditableLimiterFieldRow
              label={dict.dialogs.limiterDetails.release}
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
