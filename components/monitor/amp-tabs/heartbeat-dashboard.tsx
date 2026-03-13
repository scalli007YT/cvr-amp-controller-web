"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { HeartbeatData, ChannelParams } from "@/stores/AmpStore";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useVuMeters } from "@/hooks/useVuMeters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { EqBandDialog } from "@/components/monitor/amp-tabs/eq-controls";
import { COLORS } from "@/lib/colors";
import {
  voltageToMeterDb,
  rmsToPeakVoltage,
  formatDbfs,
} from "@/lib/generic";
import { getPowerModeName } from "@/lib/parse-channel-data";

const CH_LABELS = ["A", "B", "C", "D"];
const POWER_MODE_OPTIONS = [0, 1, 2] as const;

function DelayPopover({
  delayMs,
  maxMs,
  label,
  onSet,
}: {
  delayMs: number | undefined;
  maxMs: number;
  label: string;
  onSet: (ms: number) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleOpen = (next: boolean) => {
    if (next) {
      setInputVal(
        delayMs !== undefined
          ? delayMs.toLocaleString("en-US", { maximumFractionDigits: 1 })
          : "0",
      );
    }
    setOpen(next);
  };

  const commit = () => {
    const parsed = Number.parseFloat(inputVal.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    void onSet(Math.min(maxMs, parsed));
    setOpen(false);
  };

  const active = delayMs !== undefined && delayMs > 0;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex flex-col items-center w-full rounded border px-1.5 py-1 cursor-pointer select-none transition-colors ${
            delayMs === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : active
                ? "border-sky-500/60 bg-sky-500/15 hover:bg-sky-500/25"
                : "border-border/60 bg-muted/30 hover:border-sky-500/40 hover:bg-muted/50"
          }`}
        >
          <span
            className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${active ? "text-sky-400" : ""}`}
          >
            {delayMs !== undefined ? delayMs.toFixed(1) : "~"}
          </span>
          <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" side="right" align="center">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">Delay</span>
          <span className="text-[10px] text-muted-foreground">0 - {maxMs} ms</span>
        </div>
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              type="number"
              min={0}
              max={maxMs}
              step={0.1}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-8 text-sm font-mono tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0 w-5">ms</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={commit}>
              Set
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PowerModePill({
  mode,
  channelLabel,
  onConfirm,
}: {
  mode: number | undefined;
  channelLabel: string;
  onConfirm: (mode: number) => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<number | null>(null);

  const currentMode = mode ?? 0;
  const nextMode = pendingMode ?? currentMode;

  const requestModeChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed === currentMode) return;
    setMenuOpen(false);
    setPendingMode(parsed);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (pendingMode === null) return;
    void onConfirm(pendingMode);
    setConfirmOpen(false);
    setPendingMode(null);
  };

  const handleConfirmOpen = (open: boolean) => {
    setConfirmOpen(open);
    if (!open) setPendingMode(null);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={mode === undefined}
            className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
              mode === undefined
                ? "border-border/30 bg-muted/10 text-muted-foreground/30"
                : "border-border/40 bg-muted/20 text-muted-foreground/80 hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {mode === undefined ? "Power Mode" : getPowerModeName(currentMode)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuLabel>Output Power Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(currentMode)}
            onValueChange={requestModeChange}
          >
            {POWER_MODE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option} value={String(option)}>
                {getPowerModeName(option)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={handleConfirmOpen}
        title="Change Power Mode"
        description={`Are you sure you want to switch output ${channelLabel} to ${getPowerModeName(nextMode)}?`}
        confirmLabel="Are you sure?"
        onConfirm={handleConfirm}
      />
    </>
  );
}

function outDbScale(): { top: number; bot: number; ticks: number[] } {
  return { top: 0, bot: -40, ticks: [0, -8, -16, -24, -32, -40] };
}

const IN_DB_TOP = 0;
const IN_DB_BOT = -60;
const IN_SCALE = [0, -12, -24, -36, -48, -60];

function MeterBar({
  value,
  dbTop,
  dbBottom,
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
  thresholdLines?: { db: number; color: string; label?: string }[];
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
      {thresholdLines?.map(({ db, color, label }, idx) => {
        const pct = Math.min(1, Math.max(0, (db - dbBottom) / dbRange));
        if (db < dbBottom || db > dbTop) return null;

        const lineStyle: CSSProperties = {
          bottom: `calc(${pct * 100}% - 1px)`,
          height: 3,
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
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: 3.5,
                    height: 3,
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
          className="text-[9px] text-foreground/65 leading-none text-right pr-1 block"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function HeartbeatDashboard({
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

  const vu = useVuMeters(mac);
  const {
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    setDelayIn,
    setDelayOut,
    setPowerModeOut,
  } = useAmpActions();

  const vuOutputDbu = vu?.outputDbu ?? hb.outputDbu.map(() => null);
  const vuInputDbfs = vu?.inputDbfs ?? hb.inputDbfs;
  const { top: OUT_DB_TOP, bot: OUT_DB_BOT, ticks: OUT_SCALE } = outDbScale();

  const METER_H = 220;
  const BAR_W = 36;
  const COL_W = 64;
  const LABEL_H = 24;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex gap-6 text-xs select-none overflow-x-auto items-start">
        <div className="flex flex-col flex-shrink-0">
          <span className="text-[11px] font-semibold text-center text-foreground/70 mb-3 tracking-wider uppercase">
            Volume / Source
          </span>
          <div className="flex gap-3 items-start">
            <div
              className="flex flex-col items-end flex-shrink-0"
              style={{ width: 28 }}
            >
              <div style={{ height: LABEL_H + 4 }} />
              <ScaleColumn ticks={IN_SCALE} height={METER_H} width={28} />
            </div>
            <div className="flex gap-3 items-start">
              {CH_LABELS.map((_, i) => {
                const dbfsVal = vuInputDbfs[i];
                const hasSignal = hb.inputStates[i] === 0;
                const isClip = dbfsVal !== null && dbfsVal > -1;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-0"
                    style={{ width: COL_W }}
                  >
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
                    <MeterBar
                      value={dbfsVal}
                      dbTop={IN_DB_TOP}
                      dbBottom={IN_DB_BOT}
                      clip={isClip}
                      width={BAR_W}
                      height={METER_H}
                    />
                    <div className="mt-1 w-full rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-center font-mono text-[10px] tabular-nums text-foreground/70">
                      {dbfsVal !== null ? `${dbfsVal.toFixed(1)} dB` : "---"}
                    </div>
                    <div
                      className={`mt-1 rounded px-1 py-0.5 text-[9px] font-semibold w-full text-center ${
                        isClip
                          ? "bg-red-500 text-white"
                          : "bg-muted/30 text-muted-foreground/60"
                      }`}
                    >
                      Clip
                    </div>
                    <div className="flex flex-col items-stretch gap-1.5 mt-3 w-full">
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
                        <span className="text-[9px] text-foreground/65 mt-0.5">dBFS</span>
                      </div>
                      <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {channelParams?.channels[i]?.volumeIn.toFixed(1) ?? "~"}
                        </span>
                        <span className="text-[9px] text-foreground/65 mt-0.5">Vol dB</span>
                      </div>
                      <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                        <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                          {channelParams?.channels[i]?.gainIn ?? "~"}
                        </span>
                        <span className="text-[9px] text-foreground/65 mt-0.5">Gain dB</span>
                      </div>
                      <DelayPopover
                        delayMs={channelParams?.channels[i]?.delayIn}
                        maxMs={100}
                        label="ms in"
                        onSet={(ms) => setDelayIn(mac, i as 0 | 1 | 2 | 3, ms)}
                      />
                      {(() => {
                        const muted = channelParams?.channels[i]?.muteIn;
                        const canClick = muted !== undefined;
                        return (
                          <Button
                            disabled={!canClick}
                            size="sm"
                            onClick={() =>
                              canClick && void muteIn(mac, i as 0 | 1 | 2 | 3, !muted)
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
                      <EqBandDialog
                        triggerLabel="EQ In"
                        title={`Input EQ - Ch ${CH_LABELS[i]}`}
                        mac={mac}
                        channel={i as 0 | 1 | 2 | 3}
                        target="input"
                        bands={channelParams?.channels[i]?.eqIn}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col flex-shrink-0 border-l border-border/40 pl-6">
          <span className="text-[11px] font-semibold text-center text-foreground/70 mb-3 tracking-wider uppercase">
            Output
          </span>
          <div className="flex gap-3 items-start">
            <div
              className="flex flex-col items-end flex-shrink-0"
              style={{ width: 32 }}
            >
              <div
                className="flex items-end justify-end pr-1 w-full"
                style={{ height: LABEL_H, marginBottom: 4 }}
              >
                <span className="text-[9px] text-muted-foreground leading-none">dB</span>
              </div>
              <ScaleColumn ticks={OUT_SCALE} height={METER_H} width={32} />
            </div>

            {CH_LABELS.map((ch, i) => {
              const st = hb.outputStates[i] ?? 0;
              const v = hb.outputVoltages[i];
              const a = hb.outputCurrents[i];
              const dbu = vuOutputDbu[i];
              const temp = hb.temperatures[i] ?? 0;
              const isClip = st === 5;
              const isActive = st === 0 || st === 8;
              const dbuVal =
                dbu === null || dbu <= OUT_DB_BOT ? null : Math.min(dbu, OUT_DB_TOP);

              const chParam = channelParams?.channels[i];
              const thresholdLines: {
                db: number;
                color: string;
                label: string;
              }[] = [];

              if (chParam?.rmsLimiter.enabled) {
                const d = voltageToMeterDb(chParam.rmsLimiter.thresholdVrms, ratedRmsV);
                if (d !== null) {
                  thresholdLines.push({
                    db: d,
                    color: COLORS.RMS_LIMITER,
                    label: `RMS ${chParam.rmsLimiter.thresholdVrms.toFixed(2)} Vrms - ${chParam.rmsLimiter.prmsW} W (${d.toFixed(1)} dB)`,
                  });
                }
              }

              if (chParam?.peakLimiter.enabled) {
                const d = voltageToMeterDb(
                  chParam.peakLimiter.thresholdVp,
                  rmsToPeakVoltage(ratedRmsV),
                );
                if (d !== null) {
                  thresholdLines.push({
                    db: d,
                    color: COLORS.PEAK_LIMITER,
                    label: `Peak ${chParam.peakLimiter.thresholdVp.toFixed(2)} Vp - ${chParam.peakLimiter.ppeakW} W (${d.toFixed(1)} dB)`,
                  });
                }
              }

              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-0"
                  style={{ width: COL_W }}
                >
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
                  <MeterBar
                    value={dbuVal}
                    dbTop={OUT_DB_TOP}
                    dbBottom={OUT_DB_BOT}
                    clip={isClip}
                    width={BAR_W}
                    height={METER_H}
                    thresholdLines={thresholdLines}
                  />
                  <div className="mt-1 w-full rounded border border-border/50 bg-muted/40 px-1 py-0.5 text-center font-mono text-[10px] tabular-nums text-foreground/70">
                    {dbuVal !== null ? `${dbuVal.toFixed(1)} dB` : "---"}
                  </div>
                  <div
                    className={`mt-1 rounded px-1 py-0.5 text-[9px] font-semibold w-full text-center ${
                      isClip
                        ? "bg-red-500 text-white"
                        : "bg-muted/30 text-muted-foreground/60"
                    }`}
                  >
                    Clip
                  </div>
                  <div className="flex flex-col items-stretch gap-1.5 mt-3 w-full">
                    <div
                      className={`flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1 ${v <= 0.01 ? "opacity-40" : ""}`}
                    >
                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                        {v > 0.01 ? f1(v) : "0"}
                      </span>
                      <span className="text-[9px] text-foreground/65 mt-0.5">V</span>
                    </div>
                    <div
                      className={`flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1 ${a <= 0.001 ? "opacity-40" : ""}`}
                    >
                      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                        {a > 0.001 ? f1(a) : "0"}
                      </span>
                      <span className="text-[9px] text-foreground/65 mt-0.5">A</span>
                    </div>
                    <div className="flex flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1">
                      <span
                        className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${temp > 80 ? "text-red-500" : ""}`}
                      >
                        {f0(temp)}
                      </span>
                      <span className="text-[9px] text-foreground/65 mt-0.5">degC</span>
                    </div>
                    <DelayPopover
                      delayMs={channelParams?.channels[i]?.delayOut}
                      maxMs={20}
                      label="ms out"
                      onSet={(ms) => setDelayOut(mac, i as 0 | 1 | 2 | 3, ms)}
                    />
                    <PowerModePill
                      mode={channelParams?.channels[i]?.powerMode}
                      channelLabel={`Out${CH_LABELS[i]}`}
                      onConfirm={(mode) =>
                        setPowerModeOut(mac, i as 0 | 1 | 2 | 3, mode)
                      }
                    />
                    {(() => {
                      const muted = channelParams?.channels[i]?.muteOut;
                      const canClick = muted !== undefined;
                      return (
                        <Button
                          disabled={!canClick}
                          size="sm"
                          onClick={() =>
                            canClick && void muteOut(mac, i as 0 | 1 | 2 | 3, !muted)
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
                    {(() => {
                      const ng = channelParams?.channels[i]?.noiseGateOut;
                      const canClick = ng !== undefined;
                      return (
                        <Button
                          disabled={!canClick}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            canClick && void noiseGateOut(mac, i as 0 | 1 | 2 | 3, !ng)
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
                            void invertPolarityOut(mac, i as 0 | 1 | 2 | 3, !inverted)
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
                    <EqBandDialog
                      triggerLabel="EQ Out"
                      title={`Output EQ - Ch ${CH_LABELS[i]}`}
                      mac={mac}
                      channel={i as 0 | 1 | 2 | 3}
                      target="output"
                      bands={channelParams?.channels[i]?.eqOut}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/40 text-[11px] flex-wrap">
            <span className="text-muted-foreground">
              PSU
              <span
                className={`font-semibold tabular-nums font-mono ml-1 ${(hb.temperatures[4] ?? 0) > 80 ? "text-red-500" : ""}`}
              >
                {f0(hb.temperatures[4] ?? 0)}
              </span>
              <span className="text-[10px] ml-0.5">degC</span>
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
