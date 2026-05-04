"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAmpStore, type EqBand } from "@/stores/AmpStore";
import {
  useToolboxStore,
  type GroupControllerNode,
  type EqGroupAssignee,
  type EqGroupProperty,
  type GroupAssignee
} from "@/stores/ToolboxStore";
import { dispatch } from "@/lib/queue-dispatch";
import {
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_Q_MIN,
  EQ_BAND_Q_MAX,
  CROSSOVER_FREQ_MIN_HZ,
  CROSSOVER_FREQ_MAX_HZ,
  OUTPUT_VOLUME_MIN_DB,
  OUTPUT_VOLUME_MAX_DB,
  DELAY_MIN_MS,
  DELAY_IN_MAX_MS,
  DELAY_OUT_MAX_MS
} from "@/lib/constants";
import { EQ_BAND_LABELS } from "@/lib/eq";

const EQ_PROPERTY_META: Record<
  EqGroupProperty,
  { label: string; unit: string; min: number; max: number; step: number }
> = {
  gain: { label: "Level", unit: "dB", min: EQ_BAND_GAIN_MIN_DB, max: EQ_BAND_GAIN_MAX_DB, step: 0.5 },
  freq: { label: "Freq", unit: "Hz", min: CROSSOVER_FREQ_MIN_HZ, max: CROSSOVER_FREQ_MAX_HZ, step: 10 },
  q: { label: "Q", unit: "Q", min: EQ_BAND_Q_MIN, max: EQ_BAND_Q_MAX, step: 0.05 },
  bypass: { label: "Bypass", unit: "Byp", min: 0, max: 1, step: 1 }
};

function getValueFromBand(band: EqBand, property: EqGroupProperty): number {
  switch (property) {
    case "gain":
      return band.gain;
    case "freq":
      return band.freq;
    case "q":
      return band.q;
    case "bypass":
      return band.bypass ? 1 : 0;
  }
}

function formatEqValue(value: number, property: EqGroupProperty): string {
  switch (property) {
    case "gain":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
    case "freq":
      return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
    case "q":
      return value.toFixed(2);
    case "bypass":
      return value === 1 ? "Bypassed" : "Active";
  }
}

export const GroupControllerNodeComponent = memo(function GroupControllerNodeComponent({
  id,
  data
}: NodeProps<GroupControllerNode>) {
  const { label, mode, assignees, properties, muteTarget, delayTarget } = data;
  const amps = useAmpStore((s) => s.amps);
  const getDisplayName = useAmpStore((s) => s.getDisplayName);

  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [optimisticValues, setOptimisticValues] = useState<Record<string, number>>({});

  const getChannelParam = useCallback(
    (a: GroupAssignee) => {
      const amp = amps.find((x) => x.mac === a.mac);
      return amp?.channelParams?.channels[a.channel] ?? null;
    },
    [amps]
  );

  const getLiveValue = useCallback(
    (key: string): number | null => {
      if (mode === "volume") {
        const a = assignees.find((x) => `${x.mac}:${x.channel}` === key);
        if (!a) return null;
        const ch = getChannelParam(a);
        return ch?.volumeOut ?? null;
      }
      if (mode === "mute") {
        const a = assignees.find((x) => `${x.mac}:${x.channel}` === key);
        if (!a) return null;
        const ch = getChannelParam(a);
        if (!ch) return null;
        const target = muteTarget ?? "output";
        return target === "input" ? (ch.muteIn ? 1 : 0) : ch.muteOut ? 1 : 0;
      }
      if (mode === "delay") {
        const a = assignees.find((x) => `${x.mac}:${x.channel}` === key);
        if (!a) return null;
        const ch = getChannelParam(a);
        if (!ch) return null;
        const target = delayTarget ?? "output";
        return target === "input" ? ch.delayIn : ch.delayOut;
      }
      return null;
    },
    [mode, assignees, muteTarget, delayTarget, getChannelParam]
  );

  useEffect(() => {
    if (Object.keys(optimisticValues).length === 0) return;
    setOptimisticValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const target = next[key];
        const live = getLiveValue(key);
        const tolerance = mode === "delay" ? 0.1 : 0.5;
        if (live !== null && Math.abs(live - target) <= tolerance) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [amps, optimisticValues, getLiveValue, mode]);

  const eqAssignees = mode === "eq" ? (assignees as EqGroupAssignee[]) : [];
  const [eqOptimistic, setEqOptimistic] = useState<Partial<Record<EqGroupProperty, number>>>({});
  const [eqSliderValues, setEqSliderValues] = useState<Partial<Record<EqGroupProperty, number>>>({});

  const eqLiveValues = (property: EqGroupProperty) =>
    eqAssignees.map((a) => {
      const amp = amps.find((x) => x.mac === a.mac);
      const ch = amp?.channelParams?.channels[a.channel];
      const bands = a.target === "input" ? ch?.eqIn : ch?.eqOut;
      if (!bands?.[a.band]) return null;
      return getValueFromBand(bands[a.band], property);
    });

  useEffect(() => {
    if (mode !== "eq" || Object.keys(eqOptimistic).length === 0) return;
    setEqOptimistic((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const prop of Object.keys(next) as EqGroupProperty[]) {
        const target = next[prop]!;
        const tolerance = EQ_PROPERTY_META[prop].step;
        const liveVals = eqAssignees.map((a) => {
          const amp = amps.find((x) => x.mac === a.mac);
          const ch = amp?.channelParams?.channels[a.channel];
          const bands = a.target === "input" ? ch?.eqIn : ch?.eqOut;
          return bands?.[a.band] ? getValueFromBand(bands[a.band], prop) : null;
        });
        if (liveVals.some((v) => v !== null && Math.abs(v - target) <= tolerance)) {
          delete next[prop];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [amps, eqAssignees, eqOptimistic, mode]);

  const handleVolumeChange = useCallback((value: number) => {
    setSliderValues((prev) => ({ ...prev, volume: value }));
  }, []);

  const handleVolumeCommit = useCallback(
    (value: number) => {
      if (assignees.length === 0) return;
      setOptimisticValues((prev) => {
        const next = { ...prev };
        assignees.forEach((a) => {
          next[`${a.mac}:${a.channel}`] = value;
        });
        return next;
      });
      setSliderValues((prev) => {
        const n = { ...prev };
        delete n.volume;
        return n;
      });
      void dispatch({
        origin: "GroupController",
        action: "volumeOut",
        priority: "reliable",
        targets: assignees.map((a) => ({ mac: a.mac, channel: a.channel })),
        endpoint: "/api/amp-actions",
        buildPayload: (t) => ({ mac: t.mac, action: "volumeOut", channel: t.channel, value }),
        suppressToast: true
      });
    },
    [assignees]
  );

  const handleMuteSet = useCallback(
    (muted: boolean) => {
      if (assignees.length === 0) return;
      const target = muteTarget ?? "output";
      const action = target === "input" ? "muteIn" : "muteOut";
      void dispatch({
        origin: "GroupController",
        action,
        priority: "reliable",
        targets: assignees.map((a) => ({ mac: a.mac, channel: a.channel })),
        endpoint: "/api/amp-actions",
        buildPayload: (t) => ({ mac: t.mac, action, channel: t.channel, value: muted }),
        suppressToast: true
      });
    },
    [assignees, muteTarget]
  );

  const handleMuteToggleChannel = useCallback(
    (mac: string, channel: number, currentlyMuted: boolean) => {
      const target = muteTarget ?? "output";
      const action = target === "input" ? "muteIn" : "muteOut";
      void dispatch({
        origin: "GroupController",
        action,
        priority: "reliable",
        targets: [{ mac, channel }],
        endpoint: "/api/amp-actions",
        buildPayload: (t) => ({ mac: t.mac, action, channel: t.channel, value: !currentlyMuted }),
        suppressToast: true
      });
    },
    [muteTarget]
  );

  const handleDelayChange = useCallback((value: number) => {
    setSliderValues((prev) => ({ ...prev, delay: value }));
  }, []);

  const handleDelayCommit = useCallback(
    (value: number) => {
      if (assignees.length === 0) return;
      const target = delayTarget ?? "output";
      const action = target === "input" ? "delayIn" : "delayOut";
      setOptimisticValues((prev) => {
        const next = { ...prev };
        assignees.forEach((a) => {
          next[`${a.mac}:${a.channel}`] = value;
        });
        return next;
      });
      setSliderValues((prev) => {
        const n = { ...prev };
        delete n.delay;
        return n;
      });
      void dispatch({
        origin: "GroupController",
        action,
        priority: "reliable",
        targets: assignees.map((a) => ({ mac: a.mac, channel: a.channel })),
        endpoint: "/api/amp-actions",
        buildPayload: (t) => ({ mac: t.mac, action, channel: t.channel, value }),
        suppressToast: true
      });
    },
    [assignees, delayTarget]
  );

  const handleEqSliderChange = useCallback((property: EqGroupProperty, value: number) => {
    setEqSliderValues((prev) => ({ ...prev, [property]: value }));
  }, []);

  const handleEqSliderCommit = useCallback(
    (property: EqGroupProperty, value: number) => {
      if (eqAssignees.length === 0) return;
      setEqOptimistic((prev) => ({ ...prev, [property]: value }));
      setEqSliderValues((prev) => {
        const n = { ...prev };
        delete n[property];
        return n;
      });
      const actionMap = { gain: "eqBandGain", freq: "eqBandFreq", q: "eqBandQ" } as const;
      const action = actionMap[property as "gain" | "freq" | "q"];
      void dispatch({
        origin: "GroupController",
        action,
        priority: "reliable",
        targets: eqAssignees.map((a) => ({ mac: a.mac, channel: a.channel })),
        endpoint: "/api/amp-actions",
        buildPayload: (t) => {
          const assignee = eqAssignees.find((a) => a.mac === t.mac && a.channel === t.channel)!;
          return { mac: t.mac, action, channel: t.channel, value, target: assignee.target, band: assignee.band };
        },
        suppressToast: true
      });
    },
    [eqAssignees]
  );

  const handleBypassSet = useCallback(
    (bypassed: boolean) => {
      if (eqAssignees.length === 0) return;
      const currentAmps = useAmpStore.getState().amps;
      void dispatch({
        origin: "GroupController",
        action: "eqBandType",
        priority: "reliable",
        targets: eqAssignees.map((a) => ({ mac: a.mac, channel: a.channel })),
        endpoint: "/api/amp-actions",
        buildPayload: (t) => {
          const assignee = eqAssignees.find((a) => a.mac === t.mac && a.channel === t.channel)!;
          const amp = currentAmps.find((a) => a.mac === t.mac);
          const ch = amp?.channelParams?.channels[assignee.channel];
          const bands = assignee.target === "input" ? ch?.eqIn : ch?.eqOut;
          const currentType = bands?.[assignee.band]?.type ?? 0;
          return {
            mac: t.mac,
            action: "eqBandType",
            channel: t.channel,
            value: currentType,
            target: assignee.target,
            band: assignee.band,
            bypass: bypassed
          };
        },
        suppressToast: true
      });
    },
    [eqAssignees]
  );

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

  const openDialog = useCallback(() => {
    useToolboxStore.getState().setSelectedNodeId(id);
  }, [id]);

  const PROPERTY_ORDER: EqGroupProperty[] = ["gain", "freq", "q", "bypass"];
  const activeProperties = PROPERTY_ORDER.filter((p) => (properties ?? []).includes(p));

  const aggregateLive = (key: "volume" | "delay"): number | null => {
    if (assignees.length === 0) return null;
    const vals = assignees.map((a) => getLiveValue(`${a.mac}:${a.channel}`)).filter((v): v is number => v !== null);
    return vals.length > 0 ? vals[0] : null;
  };

  const modeLabel = mode === "volume" ? "Volume" : mode === "mute" ? "Mute" : mode === "eq" ? "EQ" : "Delay";

  return (
    <div
      className="rounded-lg border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm"
      style={nodeSize ? { width: nodeSize.width, height: nodeSize.height, overflow: "hidden" } : undefined}
    >
      <div ref={measureRef} className="w-max mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{label}</span>
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[9px] leading-none font-medium uppercase text-muted-foreground">
              {modeLabel}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="size-6" onClick={openDialog}>
            <Settings2 className="size-3.5" />
          </Button>
        </div>

        {/* Assignee list */}
        {assignees.length > 0 ? (
          <div className="max-h-48 overflow-y-auto px-4 py-3">
            <table className="text-[10px]">
              <tbody>
                {assignees.map((assignee, i) => {
                  const amp = amps.find((a) => a.mac === assignee.mac);
                  const ampName = amp ? getDisplayName(amp) : assignee.mac.slice(-5);
                  const isEq = mode === "eq" && "band" in assignee;
                  const eqA = assignee as EqGroupAssignee;
                  return (
                    <tr key={i} className="border-b border-border/20 last:border-0">
                      <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">{ampName}</td>
                      <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">Ch {assignee.channel + 1}</td>
                      {isEq && (
                        <>
                          <td className="py-1 pr-3 text-muted-foreground">{eqA.target === "input" ? "In" : "Out"}</td>
                          <td className="py-1 pr-3 text-muted-foreground">{EQ_BAND_LABELS[eqA.band]}</td>
                        </>
                      )}
                      {mode === "volume" && (
                        <td className="py-1 pl-2 text-right font-mono whitespace-nowrap text-foreground">
                          {(() => {
                            const ch = getChannelParam(assignee);
                            return ch ? `${ch.volumeOut > 0 ? "+" : ""}${ch.volumeOut.toFixed(1)} dB` : "\u2014";
                          })()}
                        </td>
                      )}
                      {mode === "mute" && (() => {
                        const ch = getChannelParam(assignee);
                        const muted = ch ? ((muteTarget ?? "output") === "input" ? ch.muteIn : ch.muteOut) : null;
                        return (
                          <td className="py-1 pl-2 text-right">
                            {muted !== null ? (
                              <button
                                onClick={() => handleMuteToggleChannel(assignee.mac, assignee.channel, muted)}
                                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                  muted
                                    ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                                    : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                                }`}
                              >
                                {muted ? "Muted" : "Active"}
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">\u2014</span>
                            )}
                          </td>
                        );
                      })()}
                      {mode === "delay" && (
                        <td className="py-1 pl-2 text-right font-mono whitespace-nowrap text-foreground">
                          {(() => {
                            const ch = getChannelParam(assignee);
                            if (!ch) return "\u2014";
                            const val = (delayTarget ?? "output") === "input" ? ch.delayIn : ch.delayOut;
                            return `${val.toFixed(2)} ms`;
                          })()}
                        </td>
                      )}
                      {mode === "eq" &&
                        activeProperties.map((prop) => {
                          const live = eqLiveValues(prop)[i];
                          const isByp = prop === "bypass";
                          return (
                            <td
                              key={prop}
                              className={`py-1 pl-2 text-right font-mono whitespace-nowrap ${
                                isByp && live !== null
                                  ? live === 1
                                    ? "text-yellow-500"
                                    : "text-green-500"
                                  : "text-foreground"
                              }`}
                            >
                              {live !== null ? formatEqValue(live, prop) : "\u2014"}
                              {!isByp && live !== null && (
                                <span className="ml-0.5 text-muted-foreground">{EQ_PROPERTY_META[prop].unit}</span>
                              )}
                            </td>
                          );
                        })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-3">
            <p className="text-[10px] text-muted-foreground">No assignees configured</p>
          </div>
        )}

        {/* Volume control */}
        {assignees.length > 0 &&
          mode === "volume" &&
          (() => {
            const live = aggregateLive("volume") ?? OUTPUT_VOLUME_MIN_DB;
            const pendingKey = assignees.map((a) => `${a.mac}:${a.channel}`).find((k) => k in optimisticValues);
            const displayValue = sliderValues.volume ?? (pendingKey ? optimisticValues[pendingKey] : undefined) ?? live;
            const isPending = !!pendingKey;
            return (
              <div className="border-t border-border/50 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Volume
                  </span>
                  <span className="text-[10px] font-mono font-medium">
                    {displayValue > 0 ? "+" : ""}
                    {displayValue.toFixed(1)} dB
                  </span>
                </div>
                <Slider
                  min={OUTPUT_VOLUME_MIN_DB}
                  max={OUTPUT_VOLUME_MAX_DB}
                  step={0.5}
                  value={[displayValue]}
                  onValueChange={(vals) => handleVolumeChange(vals[0])}
                  onValueCommit={(vals) => handleVolumeCommit(vals[0])}
                  disabled={isPending}
                  className={`w-full${isPending ? " opacity-50" : ""}`}
                />
              </div>
            );
          })()}

        {/* Mute control */}
        {assignees.length > 0 &&
          mode === "mute" &&
          (() => {
            const target = muteTarget ?? "output";
            const muteVals = assignees
              .map((a) => {
                const ch = getChannelParam(a);
                if (!ch) return null;
                return target === "input" ? (ch.muteIn ? 1 : 0) : ch.muteOut ? 1 : 0;
              })
              .filter((v): v is 0 | 1 => v !== null);
            const allMuted = muteVals.length > 0 && muteVals.every((v) => v === 1);
            const allUnmuted = muteVals.length > 0 && muteVals.every((v) => v === 0);
            const highlighted = allUnmuted ? "active" : allMuted ? "muted" : "";
            return (
              <div className="border-t border-border/50 px-4 py-3">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {target === "input" ? "Input Mute" : "Output Mute"}
                </span>
                <div className="flex overflow-hidden rounded-md border border-border/50">
                  <button
                    disabled={highlighted === "active"}
                    className={`group flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                      highlighted === "active"
                        ? "bg-green-500/15 text-green-500 cursor-default"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    onClick={() => handleMuteSet(false)}
                  >
                    <span className={highlighted === "active" ? "" : "group-hover:hidden"}>Active</span>
                    {highlighted !== "active" && <span className="hidden group-hover:inline">Unmute All</span>}
                  </button>
                  <div className="w-px bg-border/50" />
                  <button
                    disabled={highlighted === "muted"}
                    className={`group flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                      highlighted === "muted"
                        ? "bg-red-500/15 text-red-500 cursor-default"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    onClick={() => handleMuteSet(true)}
                  >
                    <span className={highlighted === "muted" ? "" : "group-hover:hidden"}>Muted</span>
                    {highlighted !== "muted" && <span className="hidden group-hover:inline">Mute All</span>}
                  </button>
                </div>
              </div>
            );
          })()}

        {/* Delay control */}
        {assignees.length > 0 &&
          mode === "delay" &&
          (() => {
            const target = delayTarget ?? "output";
            const maxMs = target === "input" ? DELAY_IN_MAX_MS : DELAY_OUT_MAX_MS;
            const live = aggregateLive("delay") ?? DELAY_MIN_MS;
            const pendingKey = assignees.map((a) => `${a.mac}:${a.channel}`).find((k) => k in optimisticValues);
            const displayValue = sliderValues.delay ?? (pendingKey ? optimisticValues[pendingKey] : undefined) ?? live;
            const isPending = !!pendingKey;
            return (
              <div className="border-t border-border/50 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {target === "input" ? "Input Delay" : "Output Delay"}
                  </span>
                  <span className="text-[10px] font-mono font-medium">{displayValue.toFixed(2)} ms</span>
                </div>
                <Slider
                  min={DELAY_MIN_MS}
                  max={maxMs}
                  step={0.01}
                  value={[displayValue]}
                  onValueChange={(vals) => handleDelayChange(vals[0])}
                  onValueCommit={(vals) => handleDelayCommit(vals[0])}
                  disabled={isPending}
                  className={`w-full${isPending ? " opacity-50" : ""}`}
                />
              </div>
            );
          })()}

        {/* EQ controls */}
        {assignees.length > 0 &&
          mode === "eq" &&
          activeProperties.map((property) => {
            const meta = EQ_PROPERTY_META[property];
            const values = eqLiveValues(property);
            const firstLive = values.find((v) => v !== null) ?? meta.min;
            const displayValue = eqSliderValues[property] ?? eqOptimistic[property] ?? firstLive;
            const isPending = property in eqOptimistic;

            return (
              <div key={property} className="border-t border-border/50 px-4 py-3">
                {property === "bypass" ? (
                  (() => {
                    const bypassVals = values.filter((v): v is number => v !== null);
                    const allActive = bypassVals.length > 0 && bypassVals.every((v) => v === 0);
                    const allBypassed = bypassVals.length > 0 && bypassVals.every((v) => v === 1);
                    const highlighted = allActive ? "active" : allBypassed ? "bypassed" : "";
                    return (
                      <>
                        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                        </span>
                        <div
                          className={`flex overflow-hidden rounded-md border border-border/50${isPending ? " opacity-50 pointer-events-none" : ""}`}
                        >
                          <button
                            disabled={highlighted === "active"}
                            className={`group flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                              highlighted === "active"
                                ? "bg-green-500/15 text-green-500 cursor-default"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                            onClick={() => handleBypassSet(false)}
                          >
                            <span className={highlighted === "active" ? "" : "group-hover:hidden"}>Active</span>
                            {highlighted !== "active" && <span className="hidden group-hover:inline">Set Active</span>}
                          </button>
                          <div className="w-px bg-border/50" />
                          <button
                            disabled={highlighted === "bypassed"}
                            className={`group flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                              highlighted === "bypassed"
                                ? "bg-yellow-500/15 text-yellow-500 cursor-default"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                            onClick={() => handleBypassSet(true)}
                          >
                            <span className={highlighted === "bypassed" ? "" : "group-hover:hidden"}>Bypassed</span>
                            {highlighted !== "bypassed" && (
                              <span className="hidden group-hover:inline">Set Bypassed</span>
                            )}
                          </button>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {meta.label}
                      </span>
                      <span className="text-[10px] font-mono font-medium">
                        {formatEqValue(displayValue, property)} {meta.unit}
                      </span>
                    </div>
                    <Slider
                      min={meta.min}
                      max={meta.max}
                      step={meta.step}
                      value={[displayValue]}
                      onValueChange={(vals) => handleEqSliderChange(property, vals[0])}
                      onValueCommit={(vals) => handleEqSliderCommit(property, vals[0])}
                      disabled={isPending}
                      className={`w-full${isPending ? " opacity-50" : ""}`}
                    />
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
});
