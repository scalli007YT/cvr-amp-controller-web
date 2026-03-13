"use client";

import type { ChannelParams } from "@/stores/AmpStore";
import { Card, CardContent } from "@/components/ui/card";
import { useVuMeters } from "@/hooks/useVuMeters";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useProjectStore } from "@/stores/ProjectStore";
import { LimiterDetailsDialog } from "@/components/dialogs/limiter-details-dialog";
import type { HeartbeatData } from "@/stores/AmpStore";

const CH_LABELS = ["A", "B", "C", "D"];

export function LimiterBlock({
  mac,
  ratedRmsV,
  channelOhms,
  heartbeat,
  channels,
  limiters,
}: {
  mac: string;
  ratedRmsV?: number;
  channelOhms: number[];
  heartbeat?: HeartbeatData;
  channels: ChannelParams["channels"];
  limiters: number[];
}) {
  const vu = useVuMeters(mac);
  const {
    rmsLimiterOut,
    peakLimiterOut,
    setRmsLimiterAttack,
    setRmsLimiterReleaseMultiplier,
    setRmsLimiterThreshold,
    setPeakLimiterHold,
    setPeakLimiterRelease,
    setPeakLimiterThreshold,
  } = useAmpActions();
  const { updateAmpChannelOhms } = useProjectStore();
  const vuOutputDbu = vu?.outputDbu ??
    heartbeat?.outputDbu?.map(() => null) ?? [null, null, null, null];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Limiters
      </span>

      <div className="grid grid-cols-[84px_1fr_1fr_1fr] items-center gap-4 px-3 py-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>Name</span>
        <span>Thresh</span>
        <span>W</span>
        <span>Status</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {channels.map((ch, i) => {
          const rms = ch.rmsLimiter;
          const peak = ch.peakLimiter;
          const gr = limiters[i] ?? 0;
          const outputDb = vuOutputDbu[i] ?? null;
          const enabled = rms.enabled || peak.enabled;
          const channelName = `Out${CH_LABELS[i]}`;
          const loadOhm = channelOhms[i];

          return (
            <LimiterDetailsDialog
              key={i}
              mac={mac}
              channel={i as 0 | 1 | 2 | 3}
              channelName={channelName}
              ratedRmsV={ratedRmsV}
              loadOhm={loadOhm}
              rms={rms}
              peak={peak}
              gr={gr}
              outputDb={outputDb}
              onToggleRms={(toggleMac, toggleChannel, enabledValue) =>
                rmsLimiterOut(toggleMac, toggleChannel, enabledValue, {
                  attackMs: rms.attackMs,
                  releaseMultiplier: rms.releaseMultiplier,
                  thresholdVrms: rms.thresholdVrms,
                })
              }
              onTogglePeak={(toggleMac, toggleChannel, enabledValue) =>
                peakLimiterOut(toggleMac, toggleChannel, enabledValue, {
                  holdMs: peak.holdMs,
                  releaseMs: peak.releaseMs,
                  thresholdVp: peak.thresholdVp,
                })
              }
              onSetRmsAttack={setRmsLimiterAttack}
              onSetRmsReleaseMultiplier={setRmsLimiterReleaseMultiplier}
              onSetRmsThreshold={setRmsLimiterThreshold}
              onSetPeakHold={setPeakLimiterHold}
              onSetPeakRelease={setPeakLimiterRelease}
              onSetPeakThreshold={setPeakLimiterThreshold}
              onSetOhms={(ohmsMac, ohmsChannel, ohms) =>
                updateAmpChannelOhms(ohmsMac, ohmsChannel, ohms)
              }
              trigger={
                <Card
                  className={`relative cursor-pointer overflow-visible border border-border/25 bg-background/20 shadow-none transition-colors ${
                    enabled
                      ? "hover:bg-muted/15"
                      : "border-border/20 bg-background/10 opacity-75 hover:opacity-90"
                  }`}
                >
                  <CardContent className="grid grid-cols-[84px_1fr_1fr_1fr] items-center gap-4 px-3 py-2">
                    <div>
                      <p className="text-[13px] font-semibold leading-tight">
                        {channelName}
                      </p>
                    </div>

                    <div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-x-1 leading-tight">
                        <span className="text-[10px] text-muted-foreground">
                          R
                        </span>
                        <span className="font-mono text-[12px] tabular-nums">
                          {rms.thresholdVrms.toFixed(2)} V
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          P
                        </span>
                        <span className="font-mono text-[12px] tabular-nums">
                          {peak.thresholdVp.toFixed(2)} V
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-x-1 leading-tight">
                        <span className="text-[10px] text-muted-foreground">
                          R
                        </span>
                        <span className="font-mono text-[12px] tabular-nums">
                          {rms.prmsW} W
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          P
                        </span>
                        <span className="font-mono text-[12px] tabular-nums">
                          {peak.ppeakW} W
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="grid grid-cols-[12px_1fr] items-center gap-x-1 leading-tight">
                        <span className="text-[10px] text-muted-foreground">
                          R
                        </span>
                        <span
                          className={`text-[12px] ${rms.enabled ? "text-green-500" : "text-red-500"}`}
                        >
                          {rms.enabled ? "On" : "Off"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          P
                        </span>
                        <span
                          className={`text-[12px] ${peak.enabled ? "text-green-500" : "text-red-500"}`}
                        >
                          {peak.enabled ? "On" : "Off"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
