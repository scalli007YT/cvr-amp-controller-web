"use client";

import { memo, useEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAmpStore } from "@/stores/AmpStore";
import { useToolboxStore, type MonitorNode, type MonitorMetric, type MonitorAssignee } from "@/stores/ToolboxStore";
import { useVuMeters } from "@/hooks/useVuMeters";
import { MiniVuMeter } from "@/components/toolbox/mini-vu-meter";
import { voltageToMeterDb, rmsToPeakVoltage } from "@/lib/generic";

const METRIC_META: Record<MonitorMetric, { label: string; unit: string; decimals: number }> = {
  vu: { label: "VU", unit: "dB", decimals: 1 },
  temperature: { label: "Temp", unit: "\u00b0C", decimals: 0 },
  impedance: { label: "Impedance", unit: "\u03a9", decimals: 1 },
  voltage: { label: "Voltage", unit: "V", decimals: 2 },
  limiter: { label: "Limiter", unit: "dB", decimals: 1 },
  headroom: { label: "Headroom", unit: "dB", decimals: 1 }
};

function HeadroomRow({
  assignee,
  label,
  headroomType
}: {
  assignee: MonitorAssignee;
  label: string;
  headroomType: "rms" | "peak";
}) {
  const vu = useVuMeters(assignee.mac);
  const amp = useAmpStore((s) => s.amps.find((a) => a.mac === assignee.mac));
  const outputDbu = vu?.outputDbu[assignee.channel] ?? null;
  // Treat silence (≤ -80 dBu) as no signal — avoids inflated headroom when amp is idle
  const activeOutputDbu = outputDbu !== null && outputDbu > -80 ? outputDbu : null;
  const ch = amp?.channelParams?.channels[assignee.channel];
  const ratedRmsV = amp?.ratedRmsV;

  const thresholdDbu = (() => {
    if (!ch || !ratedRmsV) return null;
    if (headroomType === "rms" && ch.rmsLimiter.enabled) {
      return voltageToMeterDb(ch.rmsLimiter.thresholdVrms, ratedRmsV);
    }
    if (headroomType === "peak" && ch.peakLimiter.enabled) {
      return voltageToMeterDb(ch.peakLimiter.thresholdVp, rmsToPeakVoltage(ratedRmsV));
    }
    return null;
  })();

  const headroom = activeOutputDbu !== null && thresholdDbu !== null ? activeOutputDbu - thresholdDbu : null;

  // Peak hold: retain the highest (worst) value for 2 seconds
  const [heldValue, setHeldValue] = useState<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (headroom === null) return;
    setHeldValue((prev) => {
      if (prev === null || headroom > prev) {
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => setHeldValue(null), 2000);
        return headroom;
      }
      return prev;
    });
  }, [headroom]);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    []
  );

  const displayed = heldValue ?? headroom;
  const isOver = displayed !== null && displayed > 0;
  const colorClass = displayed === null ? "text-muted-foreground" : isOver ? "text-red-400" : "text-green-400";

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-[10px] text-muted-foreground">{label}</span>
      <span className={`font-mono text-[10px] tabular-nums ${colorClass}`}>
        {displayed !== null ? `${displayed >= 0 ? "+" : ""}${displayed.toFixed(1)} dB` : "\u2014"}
      </span>
    </div>
  );
}

function VuRow({
  assignee,
  label,
  vuTarget
}: {
  assignee: MonitorAssignee;
  label: string;
  vuTarget: "input" | "output";
}) {
  const amp = useAmpStore((s) => s.amps.find((a) => a.mac === assignee.mac));
  const value =
    vuTarget === "input"
      ? (amp?.heartbeat?.inputDbfs[assignee.channel] ?? null)
      : (amp?.heartbeat?.outputDbu[assignee.channel] ?? null);
  const unit = vuTarget === "input" ? "dBFS" : "dBu";
  const min = -100;
  // Treat floor values as no-signal
  const displayValue = value !== null && value > min ? value : null;
  return <MiniVuMeter value={displayValue} min={min} max={0} unit={unit} label={label} />;
}

function getMetricColor(metric: MonitorMetric, value: number): string {
  if (metric === "temperature") {
    if (value >= 80) return "text-red-500";
    if (value >= 60) return "text-yellow-500";
    return "text-foreground";
  }
  if (metric === "limiter") {
    if (value < -6) return "text-red-500";
    if (value < -3) return "text-yellow-500";
    return "text-green-500";
  }
  return "text-foreground";
}

export const MonitorNodeComponent = memo(function MonitorNodeComponent({ id, data }: NodeProps<MonitorNode>) {
  const { label, metric, assignees, vuTarget = "output", headroomType = "rms" } = data;
  const amps = useAmpStore((s) => s.amps);
  const getDisplayName = useAmpStore((s) => s.getDisplayName);

  const meta = METRIC_META[metric];

  const getLiveValue = (mac: string, channel: number): number | null => {
    const amp = amps.find((a) => a.mac === mac);
    if (!amp) return null;
    switch (metric) {
      case "vu":
        return null;
      case "headroom":
        return null; // handled by HeadroomRow
      case "temperature":
        return amp.heartbeat?.temperatures[channel] ?? null;
      case "impedance":
        return amp.heartbeat?.outputImpedance[channel] ?? null;
      case "voltage":
        return amp.heartbeat?.outputVoltages[channel] ?? null;
      case "limiter": {
        const raw = amp.heartbeat?.limiters[channel];
        return raw !== undefined ? -Math.abs(raw) : null;
      }
    }
  };

  const measureRef = useRef<HTMLDivElement>(null);
  const [nodeSize, setNodeSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const GRID = 16;
      setNodeSize({ width: Math.ceil(width / GRID) * GRID, height: Math.ceil(height / GRID) * GRID });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="rounded-lg border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm"
      style={nodeSize ? { width: nodeSize.width, height: nodeSize.height, overflow: "hidden" } : undefined}
    >
      <div ref={measureRef} className="w-max mx-auto">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{label}</span>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[9px] leading-none font-medium uppercase text-muted-foreground">
              {metric === "vu"
                ? vuTarget === "input"
                  ? "In VU"
                  : "Out VU"
                : metric === "headroom"
                  ? `${headroomType.toUpperCase()} Headroom`
                  : meta.label}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => useToolboxStore.getState().setSelectedNodeId(id)}
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>

        {assignees.length > 0 ? (
          <div className="flex min-w-[260px] flex-col gap-1.5 px-4 py-3">
            {assignees.map((assignee, i) => {
              const amp = amps.find((a) => a.mac === assignee.mac);
              const ampName = amp ? getDisplayName(amp) : assignee.mac.slice(-5);
              const rowLabel = `${ampName} ${assignee.channel + 1}`;

              if (metric === "vu") {
                return <VuRow key={i} assignee={assignee} label={rowLabel} vuTarget={vuTarget} />;
              }

              if (metric === "headroom") {
                return <HeadroomRow key={i} assignee={assignee} label={rowLabel} headroomType={headroomType} />;
              }

              const value = getLiveValue(assignee.mac, assignee.channel);
              const colorClass = value !== null ? getMetricColor(metric, value) : "text-muted-foreground";
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[10px] text-muted-foreground truncate">{rowLabel}</span>
                  <span className={`font-mono text-[10px] ${colorClass}`}>
                    {value !== null ? `${value.toFixed(meta.decimals)} ${meta.unit}` : "\u2014"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-3">
            <p className="text-[10px] text-muted-foreground">No channels assigned</p>
          </div>
        )}
      </div>
    </div>
  );
});
