"use client";

import { useState } from "react";
import type { HeartbeatData, ChannelParams, BridgeReadback } from "@/stores/AmpStore";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useVuMeters } from "@/hooks/useVuMeters";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { EqBandDialog } from "@/components/monitor/amp-tabs/eq-controls";
import { VerticalDbMeter } from "@/components/monitor/vertical-db-meter";
import { COLORS } from "@/lib/colors";
import { OUTPUT_TRIM_MAX_DB, OUTPUT_TRIM_MIN_DB } from "@/lib/constants";
import { getLinkedChannels, type LinkScope } from "@/lib/amp-action-linking";
import { getChannelLabels } from "@/lib/channel-labels";
import { voltageToMeterDb, rmsToPeakVoltage, formatDbfs } from "@/lib/generic";
import { getPowerModeName } from "@/lib/parse-channel-data";
import { useI18n } from "@/components/layout/i18n-provider";

const POWER_MODE_OPTIONS = [0, 1, 2] as const;
type BridgePair = number;

function DelayPopover({
  delayMs,
  maxMs,
  label,
  onSet,
  buttonClassName,
  onButtonMouseEnter,
  onButtonMouseLeave,
  onButtonFocus,
  onButtonBlur
}: {
  delayMs: number | undefined;
  maxMs: number;
  label: string;
  onSet: (ms: number) => void | Promise<void>;
  buttonClassName?: string;
  onButtonMouseEnter?: () => void;
  onButtonMouseLeave?: () => void;
  onButtonFocus?: () => void;
  onButtonBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleOpen = (next: boolean) => {
    if (next) {
      setInputVal(delayMs !== undefined ? delayMs.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
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
          onMouseEnter={onButtonMouseEnter}
          onMouseLeave={onButtonMouseLeave}
          onFocus={onButtonFocus}
          onBlur={onButtonBlur}
          className={`flex flex-col items-center w-full rounded border px-1.5 py-1 cursor-pointer select-none transition-colors ${
            delayMs === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : active
                ? "border-sky-500/60 bg-sky-500/15 hover:bg-sky-500/25"
                : "border-border/60 bg-muted/30 hover:border-sky-500/40 hover:bg-muted/50"
          } ${buttonClassName ?? ""}`}
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
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VolumePopover({
  volumeDb,
  label,
  onSet,
  buttonClassName,
  onButtonMouseEnter,
  onButtonMouseLeave,
  onButtonFocus,
  onButtonBlur
}: {
  volumeDb: number | undefined;
  label: string;
  onSet: (db: number) => void | Promise<void>;
  buttonClassName?: string;
  onButtonMouseEnter?: () => void;
  onButtonMouseLeave?: () => void;
  onButtonFocus?: () => void;
  onButtonBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleOpen = (next: boolean) => {
    if (next) {
      setInputVal(volumeDb !== undefined ? volumeDb.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
    }
    setOpen(next);
  };

  const commit = () => {
    const parsed = Number.parseFloat(inputVal.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    void onSet(parsed);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onMouseEnter={onButtonMouseEnter}
          onMouseLeave={onButtonMouseLeave}
          onFocus={onButtonFocus}
          onBlur={onButtonBlur}
          className={`flex flex-col items-center w-full rounded border px-1.5 py-1 cursor-pointer select-none transition-colors ${
            volumeDb === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : "border-border/60 bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
          } ${buttonClassName ?? ""}`}
        >
          <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
            {volumeDb !== undefined ? volumeDb.toFixed(1) : "~"}
          </span>
          <span className="text-[9px] text-foreground/65 mt-0.5">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" side="right" align="center">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">Input Volume</span>
          <span className="text-[10px] text-muted-foreground">dB</span>
        </div>
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              type="number"
              step={0.1}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-8 text-sm font-mono tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0 w-5">dB</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={commit}>
              Set
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DbPopover({
  valueDb,
  label,
  title,
  minDb,
  maxDb,
  onSet,
  buttonClassName,
  onButtonMouseEnter,
  onButtonMouseLeave,
  onButtonFocus,
  onButtonBlur
}: {
  valueDb: number | undefined;
  label: string;
  title: string;
  minDb: number;
  maxDb: number;
  onSet: (db: number) => void | Promise<void>;
  buttonClassName?: string;
  onButtonMouseEnter?: () => void;
  onButtonMouseLeave?: () => void;
  onButtonFocus?: () => void;
  onButtonBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const handleOpen = (next: boolean) => {
    if (next) {
      setInputVal(valueDb !== undefined ? valueDb.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0");
    }
    setOpen(next);
  };

  const commit = () => {
    const parsed = Number.parseFloat(inputVal.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    void onSet(Math.max(minDb, Math.min(maxDb, parsed)));
    setOpen(false);
  };

  const active = valueDb !== undefined && valueDb !== 0;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onMouseEnter={onButtonMouseEnter}
          onMouseLeave={onButtonMouseLeave}
          onFocus={onButtonFocus}
          onBlur={onButtonBlur}
          className={`flex flex-col items-center w-full rounded border px-1.5 py-1 cursor-pointer select-none transition-colors ${
            valueDb === undefined
              ? "border-border/30 bg-muted/10 opacity-40 pointer-events-none"
              : active
                ? "border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25"
                : "border-border/60 bg-muted/30 hover:border-amber-500/40 hover:bg-muted/50"
          } ${buttonClassName ?? ""}`}
        >
          <span
            className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${active ? "text-amber-400" : ""}`}
          >
            {valueDb !== undefined ? valueDb.toFixed(1) : "~"}
          </span>
          <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" side="right" align="center">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">
            {minDb} - {maxDb} dB
          </span>
        </div>
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              type="number"
              min={minDb}
              max={maxDb}
              step={0.1}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-8 text-sm font-mono tabular-nums"
            />
            <span className="text-xs text-muted-foreground shrink-0 w-5">dB</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={commit}>
              Set
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOpen(false)}>
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
  triggerClassName,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  onTriggerFocus,
  onTriggerBlur
}: {
  mode: number | undefined;
  channelLabel: string;
  onConfirm: (mode: number) => void | Promise<void>;
  triggerClassName?: string;
  onTriggerMouseEnter?: () => void;
  onTriggerMouseLeave?: () => void;
  onTriggerFocus?: () => void;
  onTriggerBlur?: () => void;
}) {
  const dict = useI18n();
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
            onMouseEnter={onTriggerMouseEnter}
            onMouseLeave={onTriggerMouseLeave}
            onFocus={onTriggerFocus}
            onBlur={onTriggerBlur}
            className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
              mode === undefined
                ? "border-border/30 bg-muted/10 text-muted-foreground/30"
                : "border-border/40 bg-muted/20 text-muted-foreground/80 hover:border-primary/40 hover:text-foreground"
            } ${triggerClassName ?? ""}`}
          >
            {mode === undefined ? dict.dialogs.heartbeat.powerMode : getPowerModeName(currentMode)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuLabel>{dict.dialogs.heartbeat.outputPowerMode}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(currentMode)} onValueChange={requestModeChange}>
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
        title={dict.dialogs.heartbeat.changePowerModeTitle}
        description={dict.dialogs.heartbeat.changePowerModeDescription
          .replace("{channel}", channelLabel)
          .replace("{mode}", getPowerModeName(nextMode))}
        confirmLabel={dict.dialogs.heartbeat.changePowerModeConfirm}
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

function ScaleColumn({ ticks, height = 220, width = 24 }: { ticks: number[]; height?: number; width?: number }) {
  return (
    <div className="flex-shrink-0 flex flex-col justify-between" style={{ width, height }}>
      {ticks.map((t) => (
        <span key={t} className="text-[9px] text-foreground/65 leading-none text-right pr-1 block">
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
  bridgePairs
}: {
  hb: HeartbeatData;
  mac: string;
  ratedRmsV?: number;
  channelParams?: ChannelParams;
  bridgePairs?: BridgeReadback[];
}) {
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linkConfig = getStoredAmpLinkConfig(byMac, mac);
  const f1 = (n: number) => n.toFixed(1);
  const f0 = (n: number) => n.toFixed(0);

  const vu = useVuMeters(mac);
  const {
    setBridgePair,
    muteIn,
    muteOut,
    invertPolarityOut,
    noiseGateOut,
    setVolumeIn,
    setDelayIn,
    setDelayOut,
    setTrimOut,
    setPowerModeOut
  } = useAmpActions();

  const vuOutputDbu = vu?.outputDbu ?? hb.outputDbu.map(() => null);
  const vuInputDbfs = vu?.inputDbfs ?? hb.inputDbfs;
  const { top: OUT_DB_TOP, bot: OUT_DB_BOT, ticks: OUT_SCALE } = outDbScale();

  const METER_H = 220;
  const BAR_W = 36;
  const COL_W = 64;
  const LABEL_H = 24;
  const pairWidth = COL_W * 2 + 12;
  const channelCount = Math.max(
    channelParams?.channels.length ?? 0,
    hb.outputStates.length,
    hb.inputStates.length,
    hb.outputVoltages.length,
    hb.inputDbfs.length
  );
  const channelLabels = getChannelLabels(channelCount);
  const outputPairCount = Math.ceil(channelLabels.length / 2);
  const [bridgeConfirmOpen, setBridgeConfirmOpen] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [pendingBridgePair, setPendingBridgePair] = useState<BridgePair | null>(null);
  const [pendingBridgeNext, setPendingBridgeNext] = useState<boolean | null>(null);
  const [hoveredLink, setHoveredLink] = useState<{ scope: LinkScope; channel: number } | null>(null);

  const getLinkHoverProps = (scope: LinkScope, channel: number) => ({
    onMouseEnter: () => setHoveredLink({ scope, channel }),
    onMouseLeave: () => setHoveredLink(null),
    onFocus: () => setHoveredLink({ scope, channel }),
    onBlur: () => setHoveredLink(null)
  });

  const isLinkedHovered = (scope: LinkScope, channel: number) => {
    if (!hoveredLink || hoveredLink.scope !== scope) return false;
    return getLinkedChannels(linkConfig, scope, hoveredLink.channel).includes(channel);
  };

  const linkedHoverClass = (scope: LinkScope, channel: number, hoverClass: string) =>
    isLinkedHovered(scope, channel) ? hoverClass : "";

  const pairBridgeState = (pair: number) => bridgePairs?.[pair]?.bridged ?? null;

  const effectivePairBridgeState = (pair: number) => {
    if (bridgeBusy && pendingBridgePair !== null && pendingBridgeNext !== null && pendingBridgePair === pair) {
      return pendingBridgeNext;
    }

    return pairBridgeState(pair);
  };

  const requestBridgeToggle = (pairIndex: number) => {
    const currentState = effectivePairBridgeState(pairIndex);
    if (currentState === null) return;

    setPendingBridgePair(pairIndex);
    setPendingBridgeNext(!currentState);
    setBridgeConfirmOpen(true);
  };

  const handleBridgeDialogOpen = (open: boolean) => {
    if (bridgeBusy) return;
    setBridgeConfirmOpen(open);
    if (!open) {
      setPendingBridgePair(null);
      setPendingBridgeNext(null);
    }
  };

  const handleConfirmBridge = async () => {
    if (pendingBridgePair === null || pendingBridgeNext === null) return;

    setBridgeBusy(true);
    try {
      await setBridgePair(mac, pendingBridgePair, pendingBridgeNext);
    } finally {
      setBridgeBusy(false);
      setBridgeConfirmOpen(false);
      setPendingBridgePair(null);
      setPendingBridgeNext(null);
    }
  };

  const isBridgedSecondColumn = (channelIndex: number) => {
    if (channelIndex % 2 === 0) return false;
    const pairIndex = Math.floor(channelIndex / 2);
    return effectivePairBridgeState(pairIndex) === true;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-4 xl:gap-3 text-xs select-none w-full">
        <section className="flex min-h-[360px] flex-col gap-2">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Input
          </h3>
          <div className="flex flex-1 items-center justify-center overflow-auto">
            <div className="flex gap-3 items-start">
              <div className="flex flex-col items-end flex-shrink-0" style={{ width: 28 }}>
                <div style={{ height: LABEL_H + 4 }} />
                <ScaleColumn ticks={IN_SCALE} height={METER_H} width={28} />
              </div>
              <div className="flex gap-3 items-start">
                {channelLabels.map((_, i) => {
                  const dbfsVal = vuInputDbfs[i];
                  const hasSignal = hb.inputStates[i] === 0;
                  const isClip = dbfsVal !== null && dbfsVal > -1;
                  return (
                    <div key={i} className="flex flex-col items-center gap-0" style={{ width: COL_W }}>
                      <div
                        className={`rounded border px-1 text-[11px] font-semibold text-center w-full mb-1 ${
                          hasSignal
                            ? "border-green-500/50 bg-green-500/15 text-green-700 dark:text-green-400"
                            : "border-border/60 text-muted-foreground"
                        }`}
                        style={{
                          height: LABEL_H,
                          lineHeight: `${LABEL_H - 2}px`
                        }}
                      >
                        In{i + 1}
                      </div>
                      <VerticalDbMeter
                        value={dbfsVal}
                        dbTop={IN_DB_TOP}
                        dbBottom={IN_DB_BOT}
                        clip={isClip}
                        width={BAR_W}
                        height={METER_H}
                      />
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
                        <VolumePopover
                          volumeDb={channelParams?.channels[i]?.volumeIn}
                          label="Vol dB"
                          buttonClassName={linkedHoverClass("volumeIn", i, "border-primary/40 bg-muted/50")}
                          onButtonMouseEnter={getLinkHoverProps("volumeIn", i).onMouseEnter}
                          onButtonMouseLeave={getLinkHoverProps("volumeIn", i).onMouseLeave}
                          onButtonFocus={getLinkHoverProps("volumeIn", i).onFocus}
                          onButtonBlur={getLinkHoverProps("volumeIn", i).onBlur}
                          onSet={(db) => setVolumeIn(mac, i, db)}
                        />
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
                          onSet={(ms) => setDelayIn(mac, i, ms)}
                        />
                        {(() => {
                          const muted = channelParams?.channels[i]?.muteIn;
                          const canClick = muted !== undefined;
                          return (
                            <Button
                              disabled={!canClick}
                              size="sm"
                              {...getLinkHoverProps("muteIn", i)}
                              onClick={() => canClick && void muteIn(mac, i, !muted)}
                              className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                                muted === true
                                  ? "border-orange-500/60 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 hover:text-orange-400"
                                  : muted === false
                                    ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-orange-500/40 hover:text-orange-400/70"
                                    : "border-border/30 bg-muted/10 text-muted-foreground/30"
                              } ${linkedHoverClass("muteIn", i, muted === false ? "border-orange-500/40 text-orange-400/70" : "")}`}
                              variant="outline"
                            >
                              {muted === true ? "MUTED" : "Mute In"}
                            </Button>
                          );
                        })()}
                        <EqBandDialog
                          triggerLabel="EQ In"
                          title={`Input EQ - Ch ${channelLabels[i] ?? i + 1}`}
                          triggerClassName={linkedHoverClass("inputEq", i, "border-border/60 text-foreground/70")}
                          onTriggerMouseEnter={getLinkHoverProps("inputEq", i).onMouseEnter}
                          onTriggerMouseLeave={getLinkHoverProps("inputEq", i).onMouseLeave}
                          onTriggerFocus={getLinkHoverProps("inputEq", i).onFocus}
                          onTriggerBlur={getLinkHoverProps("inputEq", i).onBlur}
                          mac={mac}
                          channel={i}
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
        </section>

        <div className="hidden xl:block self-stretch w-px bg-border/60" />

        <section className="flex min-h-[360px] flex-col gap-2">
          <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Output
          </h3>
          <div className="flex flex-1 items-center justify-center overflow-auto">
            <div className="flex flex-col gap-1.5 items-start">
              <div className="flex gap-3 items-start">
                <div style={{ width: 32 }} />
                <div className="flex gap-3 items-start">
                  {Array.from({ length: outputPairCount }).map((_, pairIndex) => {
                    const firstChannel = pairIndex * 2;
                    const secondChannel = firstChannel + 1;
                    const state = effectivePairBridgeState(pairIndex);
                    const statusLabel = state === true ? "Bridge ON" : state === false ? "Bridge OFF" : "Bridge ?";

                    return (
                      <Button
                        key={pairIndex}
                        type="button"
                        variant="outline"
                        disabled={state === null || bridgeBusy}
                        onClick={() => requestBridgeToggle(pairIndex)}
                        className={`h-auto py-1 text-[10px] font-semibold transition-colors ${
                          state === true
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-500"
                            : "border-border/50 bg-muted/20 text-muted-foreground"
                        }`}
                        style={{ width: pairWidth }}
                      >
                        {channelLabels[firstChannel] ?? firstChannel + 1} /{" "}
                        {channelLabels[secondChannel] ?? secondChannel + 1} - {statusLabel}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="flex flex-col items-end flex-shrink-0" style={{ width: 32 }}>
                  <div className="flex items-end justify-end pr-1 w-full" style={{ height: LABEL_H, marginBottom: 4 }}>
                    <span className="text-[9px] text-muted-foreground leading-none">dB</span>
                  </div>
                  <ScaleColumn ticks={OUT_SCALE} height={METER_H} width={32} />
                </div>

                {channelLabels.map((ch, i) => {
                  const st = hb.outputStates[i] ?? 0;
                  const v = hb.outputVoltages[i];
                  const a = hb.outputCurrents[i];
                  const dbu = vuOutputDbu[i];
                  const temp = hb.temperatures[i] ?? 0;
                  const isClip = st === 5;
                  const isActive = st === 0 || st === 8;
                  const isDisabledByBridge = isBridgedSecondColumn(i);
                  const dbuVal = dbu === null || dbu <= OUT_DB_BOT ? null : Math.min(dbu, OUT_DB_TOP);

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
                        label: `RMS ${chParam.rmsLimiter.thresholdVrms.toFixed(2)} Vrms - ${chParam.rmsLimiter.prmsW} W (${d.toFixed(1)} dB)`
                      });
                    }
                  }

                  if (chParam?.peakLimiter.enabled) {
                    const d = voltageToMeterDb(chParam.peakLimiter.thresholdVp, rmsToPeakVoltage(ratedRmsV));
                    if (d !== null) {
                      thresholdLines.push({
                        db: d,
                        color: COLORS.PEAK_LIMITER,
                        label: `Peak ${chParam.peakLimiter.thresholdVp.toFixed(2)} Vp - ${chParam.peakLimiter.ppeakW} W (${d.toFixed(1)} dB)`
                      });
                    }
                  }

                  return (
                    <div
                      key={i}
                      aria-disabled={isDisabledByBridge}
                      className={`flex flex-col items-center gap-0 ${
                        isDisabledByBridge ? "opacity-45 pointer-events-none grayscale" : ""
                      }`}
                      style={{ width: COL_W }}
                    >
                      <div
                        className={`rounded border px-1 text-[11px] font-semibold text-center w-full mb-1 ${
                          isActive
                            ? "border-green-500/50 bg-green-500/15 text-green-700 dark:text-green-400"
                            : "border-border/60 text-muted-foreground"
                        }`}
                        style={{
                          height: LABEL_H,
                          lineHeight: `${LABEL_H - 2}px`
                        }}
                      >
                        Out{ch}
                      </div>
                      <VerticalDbMeter
                        value={dbuVal}
                        dbTop={OUT_DB_TOP}
                        dbBottom={OUT_DB_BOT}
                        clip={isClip}
                        width={BAR_W}
                        height={METER_H}
                        thresholdLines={thresholdLines}
                      />
                      <div
                        className={`mt-1 rounded px-1 py-0.5 text-[9px] font-semibold w-full text-center ${
                          isClip ? "bg-red-500 text-white" : "bg-muted/30 text-muted-foreground/60"
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
                          <span className="text-[9px] text-foreground/65 mt-0.5">°C</span>
                        </div>
                        <DelayPopover
                          delayMs={channelParams?.channels[i]?.delayOut}
                          maxMs={20}
                          label="ms out"
                          buttonClassName={linkedHoverClass(
                            "delayOut",
                            i,
                            (channelParams?.channels[i]?.delayOut ?? 0) > 0
                              ? "bg-sky-500/25"
                              : "border-sky-500/40 bg-muted/50"
                          )}
                          onButtonMouseEnter={getLinkHoverProps("delayOut", i).onMouseEnter}
                          onButtonMouseLeave={getLinkHoverProps("delayOut", i).onMouseLeave}
                          onButtonFocus={getLinkHoverProps("delayOut", i).onFocus}
                          onButtonBlur={getLinkHoverProps("delayOut", i).onBlur}
                          onSet={(ms) => setDelayOut(mac, i, ms)}
                        />
                        <DbPopover
                          valueDb={channelParams?.channels[i]?.trimOut}
                          label="Trim dB"
                          title="Output Trim"
                          minDb={OUTPUT_TRIM_MIN_DB}
                          maxDb={OUTPUT_TRIM_MAX_DB}
                          buttonClassName={linkedHoverClass(
                            "trimOut",
                            i,
                            (channelParams?.channels[i]?.trimOut ?? 0) !== 0
                              ? "bg-amber-500/25"
                              : "border-amber-500/40 bg-muted/50"
                          )}
                          onButtonMouseEnter={getLinkHoverProps("trimOut", i).onMouseEnter}
                          onButtonMouseLeave={getLinkHoverProps("trimOut", i).onMouseLeave}
                          onButtonFocus={getLinkHoverProps("trimOut", i).onFocus}
                          onButtonBlur={getLinkHoverProps("trimOut", i).onBlur}
                          onSet={(db) => setTrimOut(mac, i, db)}
                        />
                        <PowerModePill
                          mode={channelParams?.channels[i]?.powerMode}
                          channelLabel={`Out${channelLabels[i] ?? i + 1}`}
                          onConfirm={(mode) => setPowerModeOut(mac, i, mode)}
                        />
                        {(() => {
                          const muted = channelParams?.channels[i]?.muteOut;
                          const canClick = muted !== undefined;
                          return (
                            <Button
                              disabled={!canClick}
                              size="sm"
                              {...getLinkHoverProps("muteOut", i)}
                              onClick={() => canClick && void muteOut(mac, i, !muted)}
                              className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                                muted === true
                                  ? "border-orange-500/60 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 hover:text-orange-400"
                                  : muted === false
                                    ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-orange-500/40 hover:text-orange-400/70"
                                    : "border-border/30 bg-muted/10 text-muted-foreground/30"
                              } ${linkedHoverClass("muteOut", i, muted === false ? "border-orange-500/40 text-orange-400/70" : "")}`}
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
                              {...getLinkHoverProps("noiseGateOut", i)}
                              onClick={() => canClick && void noiseGateOut(mac, i, !ng)}
                              className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                                ng === true
                                  ? "border-sky-500/60 bg-sky-500/20 text-sky-400"
                                  : ng === false
                                    ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-sky-500/40 hover:text-sky-400/70"
                                    : "border-border/30 bg-muted/10 text-muted-foreground/30"
                              } ${linkedHoverClass("noiseGateOut", i, ng === false ? "border-sky-500/40 text-sky-400/70" : "")}`}
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
                              {...getLinkHoverProps("polarityOut", i)}
                              onClick={() => canClick && void invertPolarityOut(mac, i, !inverted)}
                              className={`w-full h-auto py-1 text-[11px] font-semibold transition-colors ${
                                inverted === true
                                  ? "border-primary/60 bg-primary/20 text-primary hover:bg-primary/25"
                                  : inverted === false
                                    ? "border-border/40 bg-muted/20 text-muted-foreground/50 hover:border-primary/40 hover:text-primary/80"
                                    : "border-border/30 bg-muted/10 text-muted-foreground/30"
                              } ${linkedHoverClass("polarityOut", i, inverted === false ? "border-primary/40 text-primary/80" : "")}`}
                            >
                              {inverted === true ? "INVERTED" : "Polarity"}
                            </Button>
                          );
                        })()}
                        <EqBandDialog
                          triggerLabel="EQ Out"
                          title={`Output EQ - Ch ${channelLabels[i] ?? i + 1}`}
                          triggerClassName={linkedHoverClass("outputEq", i, "border-border/60 text-foreground/70")}
                          onTriggerMouseEnter={getLinkHoverProps("outputEq", i).onMouseEnter}
                          onTriggerMouseLeave={getLinkHoverProps("outputEq", i).onMouseLeave}
                          onTriggerFocus={getLinkHoverProps("outputEq", i).onFocus}
                          onTriggerBlur={getLinkHoverProps("outputEq", i).onBlur}
                          mac={mac}
                          channel={i}
                          target="output"
                          bands={channelParams?.channels[i]?.eqOut}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center flex-wrap text-[10px] text-muted-foreground">
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
        </section>
      </div>

      <ConfirmActionDialog
        open={bridgeConfirmOpen}
        onOpenChange={handleBridgeDialogOpen}
        title={dict.dialogs.heartbeat.changeBridgeModeTitle}
        description={
          pendingBridgePair !== null && pendingBridgeNext !== null
            ? dict.dialogs.heartbeat.changeBridgeModeDescription
                .replace(
                  "{state}",
                  pendingBridgeNext ? dict.dialogs.limiterDetails.on : dict.dialogs.limiterDetails.off
                )
                .replace("{pairA}", channelLabels[pendingBridgePair * 2] ?? String(pendingBridgePair * 2 + 1))
                .replace("{pairB}", channelLabels[pendingBridgePair * 2 + 1] ?? String(pendingBridgePair * 2 + 2))
            : dict.dialogs.heartbeat.changeBridgeModeFallback
        }
        confirmLabel={bridgeBusy ? dict.dialogs.heartbeat.applying : dict.dialogs.heartbeat.applyBridgeChange}
        confirmDisabled={bridgeBusy || pendingBridgePair === null || pendingBridgeNext === null}
        onConfirm={handleConfirmBridge}
      />
    </TooltipProvider>
  );
}
