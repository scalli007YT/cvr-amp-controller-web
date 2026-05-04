"use client";

interface MiniVuMeterProps {
  value: number | null;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  /** When true, high value = green, low value = red (for headroom display) */
  invertColors?: boolean;
}

function getBarColor(value: number, invert: boolean): string {
  if (invert) {
    if (value <= 3) return "bg-red-500/80";
    if (value <= 9) return "bg-yellow-500/80";
    return "bg-green-500/70";
  }
  if (value >= -3) return "bg-red-500/80";
  if (value >= -10) return "bg-yellow-500/80";
  return "bg-green-500/70";
}

function getTextColor(value: number, invert: boolean): string {
  if (invert) {
    if (value <= 3) return "text-red-400";
    if (value <= 9) return "text-yellow-400";
    return "text-green-400";
  }
  if (value >= -3) return "text-red-400";
  if (value >= -10) return "text-yellow-400";
  return "text-green-400";
}

export function MiniVuMeter({ value, min = -100, max = 0, unit = "dB", label, invertColors = false }: MiniVuMeterProps) {
  const hasSignal = value !== null && value > min;
  const clampedValue = hasSignal ? Math.min(Math.max(value!, min), max) : min;
  const fillPct = hasSignal ? ((clampedValue - min) / (max - min)) * 100 : 0;
  const barColor = hasSignal ? getBarColor(clampedValue, invertColors) : "";
  const textColor = hasSignal ? getTextColor(clampedValue, invertColors) : "text-muted-foreground/50";

  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-20 shrink-0 truncate text-[10px] text-muted-foreground">{label}</span>}
      {/* Bar track */}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-75 ${barColor}`}
          style={{ width: `${fillPct}%` }}
        />
        {/* Tick marks at -48 -36 -24 -12 */}
        {[-75, -50, -25, -10, -3].map((db) => (
          <div
            key={db}
            className="absolute inset-y-0 w-px bg-background/40"
            style={{ left: `${((db - min) / (max - min)) * 100}%` }}
          />
        ))}
      </div>
      {/* Numeric readout */}
      <span className={`w-16 shrink-0 text-right font-mono text-[10px] leading-none tabular-nums ${textColor}`}>
        {hasSignal ? `${value!.toFixed(1)} ${unit}` : `\u2014 ${unit}`}
      </span>
    </div>
  );
}
