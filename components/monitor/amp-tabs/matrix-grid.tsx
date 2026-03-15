"use client";

import { useEffect, useState } from "react";
import type { ChannelParams } from "@/stores/AmpStore";
import { useAmpActions } from "@/hooks/useAmpActions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MATRIX_GAIN_MAX_DB, MATRIX_GAIN_MIN_DB } from "@/lib/constants";

const INPUT_LABELS = ["AIn1", "AIn2", "AIn3", "AIn4"];

function MatrixCell({
  gain,
  active,
  disabled,
  onToggleActive,
  onGainChange
}: {
  gain: number;
  active: boolean;
  disabled?: boolean;
  onToggleActive: () => void;
  onGainChange: (db: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(gain));

  useEffect(() => {
    setDraft(String(gain));
  }, [gain]);

  const label = active ? (gain === 0 ? "0 dB" : `${gain > 0 ? "+" : ""}${gain} dB`) : "Mute";

  const clampGain = (value: number) => Math.max(MATRIX_GAIN_MIN_DB, Math.min(MATRIX_GAIN_MAX_DB, value));

  const handleCommit = (close = false) => {
    if (disabled) {
      if (close) setOpen(false);
      return;
    }
    const parsed = Number.parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      const clamped = clampGain(parsed);
      setDraft(String(clamped));
      onGainChange(clamped);
    } else {
      setDraft(String(gain));
    }
    if (close) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`
            flex flex-col items-center justify-center rounded-md w-24 h-14
            text-xs font-medium border gap-0.5 select-none transition-colors
            ${
              disabled
                ? "bg-muted/30 border-border text-muted-foreground/60 cursor-not-allowed"
                : active
                  ? "bg-card border-primary text-foreground"
                  : "bg-card border-border text-muted-foreground cursor-pointer"
            }
          `}
        >
          <span>{disabled ? "N/A" : label}</span>
          <span className={`text-[9px] ${active && !disabled ? "text-primary" : "text-muted-foreground"}`}>
            {disabled ? "Disabled" : active ? "Active" : "Bypassed"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3 space-y-2" sideOffset={8}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Matrix Gain</div>
        <Input
          type="number"
          step="0.5"
          min={String(MATRIX_GAIN_MIN_DB)}
          max={String(MATRIX_GAIN_MAX_DB)}
          disabled={disabled || !active}
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
          disabled={disabled}
          onClick={onToggleActive}
        >
          {active ? "Bypass" : "Enable"}
        </Button>
        <div className="text-[10px] text-muted-foreground text-center">
          Range: {MATRIX_GAIN_MIN_DB.toFixed(1)} to +{MATRIX_GAIN_MAX_DB.toFixed(1)} dB
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MatrixGrid({
  channels,
  mac,
  analogInputCount
}: {
  channels: ChannelParams["channels"];
  mac: string;
  analogInputCount?: number;
}) {
  const { setMatrixGain, setMatrixActive } = useAmpActions();
  const enabledInputCount = Math.max(0, Math.min(4, analogInputCount ?? 4));

  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-16" />
            {INPUT_LABELS.map((label, idx) => (
              <th
                key={label}
                className={`text-center text-xs font-semibold pb-1 w-24 ${
                  idx < enabledInputCount ? "text-muted-foreground" : "text-muted-foreground/50"
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <tr key={ch.channel}>
              <td className="text-xs font-semibold text-muted-foreground pr-2 text-right align-middle whitespace-nowrap">
                {ch.outputName}
              </td>
              {ch.matrix.map((cell) => {
                const enabled = cell.source < enabledInputCount;
                return (
                  <td key={cell.source} className="align-middle">
                    <MatrixCell
                      gain={cell.gain}
                      active={cell.active}
                      disabled={!enabled}
                      onToggleActive={() =>
                        enabled &&
                        setMatrixActive(mac, ch.channel as 0 | 1 | 2 | 3, cell.source as 0 | 1 | 2 | 3, !cell.active)
                      }
                      onGainChange={(db) =>
                        enabled && setMatrixGain(mac, ch.channel as 0 | 1 | 2 | 3, cell.source as 0 | 1 | 2 | 3, db)
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
