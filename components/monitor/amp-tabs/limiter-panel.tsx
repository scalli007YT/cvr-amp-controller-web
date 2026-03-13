"use client";

import type { ChannelParams } from "@/stores/AmpStore";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const CH_LABELS = ["A", "B", "C", "D"];

function LimiterGrBar({
  gainReduction,
  height = 48,
}: {
  gainReduction: number;
  height?: number;
}) {
  const GR_MAX = 20;
  const depth = Math.min(GR_MAX, Math.max(0, -gainReduction));
  const fill = depth / GR_MAX;
  const active = depth > 0.1;

  return (
    <div
      className="relative rounded-sm overflow-hidden bg-muted/30 border border-border/60 w-3 flex-shrink-0"
      style={{ height }}
      title={`GR: ${gainReduction.toFixed(1)} dB`}
    >
      <div
        className={`absolute top-0 left-0 right-0 transition-all duration-75 ${active ? "bg-amber-400" : "bg-muted/20"}`}
        style={{ height: `${fill * 100}%` }}
      />
    </div>
  );
}

export function LimiterBlock({
  label,
  channels,
  limiters,
}: {
  label: string;
  channels: ChannelParams["channels"];
  limiters: number[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col gap-3">
        {channels.map((ch, i) => {
          const isRms = label.startsWith("RMS");
          const lim = isRms ? ch.rmsLimiter : ch.peakLimiter;
          const gr = limiters[i] ?? 0;
          const enabled = lim.enabled;

          return (
            <Card
              key={i}
              className={`relative overflow-visible rounded-tr-none transition-colors ${
                enabled ? "" : "border-border/30 bg-muted/20 opacity-50"
              }`}
            >
              <div
                className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full z-10 ${
                  enabled ? "bg-green-500" : "bg-red-500/60"
                }`}
              />
              <CardContent className="flex items-center gap-4 px-4">
                <div className="flex items-center gap-2 w-20 flex-shrink-0">
                  <span className="text-[13px] font-bold text-foreground w-10">
                    Out{CH_LABELS[i]}
                  </span>
                  <LimiterGrBar gainReduction={gr} height={28} />
                </div>

                <Separator
                  orientation="vertical"
                  className="self-stretch h-auto opacity-40 flex-shrink-0"
                />

                <div className="flex gap-4 flex-shrink-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      Threshold
                    </span>
                    <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                      {"thresholdVrms" in lim
                        ? `${lim.thresholdVrms.toFixed(2)} V`
                        : `${(lim as typeof ch.peakLimiter).thresholdVp.toFixed(2)} V`}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {"thresholdVrms" in lim ? "Vrms" : "Vpeak"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      {"thresholdVrms" in lim ? "Prms" : "Ppeak"}
                    </span>
                    <span className="font-mono text-[13px] font-semibold tabular-nums leading-none">
                      {"thresholdVrms" in lim
                        ? `${ch.rmsLimiter.prmsW} W`
                        : `${ch.peakLimiter.ppeakW} W`}
                    </span>
                  </div>
                </div>

                <Separator
                  orientation="vertical"
                  className="self-stretch h-auto opacity-40 flex-shrink-0"
                />

                <div className="flex gap-4">
                  {"attackMs" in lim ? (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground">Atk</span>
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
                          {lim.attackMs} ms
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground">Rel</span>
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
                          ×{lim.releaseMultiplier}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground">Hold</span>
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
                          {(lim as typeof ch.peakLimiter).holdMs} ms
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-muted-foreground">Rel</span>
                        <span className="font-mono text-[11px] font-semibold tabular-nums">
                          {(lim as typeof ch.peakLimiter).releaseMs} ms
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
