"use client";

import { useEffect, useState } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import type { AmpPreset } from "@/stores/AmpStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { formatRuntime } from "@/lib/generic";
import { LayoutDashboardIcon, GridIcon, SlidersHorizontalIcon, ChevronRight } from "lucide-react";
import { HeartbeatDashboard } from "@/components/monitor/amp-tabs/heartbeat-dashboard";
import { LinkingPanel } from "@/components/monitor/amp-tabs/linking-panel";
import { LimiterBlock } from "@/components/monitor/amp-tabs/limiter-panel";
import { MatrixGrid } from "@/components/monitor/amp-tabs/matrix-grid";
import { SourceConfigDialog } from "@/components/dialogs/source-config-dialog";
import { CopyJsonButton, JsonTree, type JsonValue } from "@/components/monitor/amp-tabs/json-viewer";
import { useI18n } from "@/components/layout/i18n-provider";

type AmpSection = "main" | "matrix" | "preferences";

export function AmpTabs() {
  const dict = useI18n();
  const { amps, getDisplayName } = useAmpStore();
  const {
    fetchPresets,
    recallPreset,
    storePreset,
    fetching,
    recallingSlot,
    storingSlot,
    error: presetsError
  } = useAmpPresets();

  const [selectedMac, setSelectedMac] = useState<string | null>(amps.length > 0 ? amps[0].mac : null);
  const [activeSection, setActiveSection] = useState<AmpSection>("main");
  const [activePreset, setActivePreset] = useState<AmpPreset | null>(null);
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [storePresetName, setStorePresetName] = useState("");

  const onlineCount = amps.filter((amp) => amp.reachable).length;
  const selectedAmp = amps.find((a) => a.mac === selectedMac);
  const preferenceChannelTrees = selectedAmp?.channelParams?.channels.map((channel) => {
    const flags = selectedAmp.channelFlags?.find((flag) => flag.channel === channel.channel) ?? null;

    return {
      meta: {
        channel: channel.channel,
        inputName: channel.inputName,
        outputName: channel.outputName
      },
      input: {
        gainIn: channel.gainIn,
        volumeIn: channel.volumeIn,
        muteIn: channel.muteIn,
        delayIn: channel.delayIn,
        source: {
          sourceTypeCode: channel.sourceTypeCode,
          sourceType: channel.sourceType,
          sourceDelay: channel.sourceDelay,
          sourceTrim: channel.sourceTrim,
          sourceInputs: channel.sourceInputs
        }
      },
      output: {
        trimOut: channel.trimOut,
        muteOut: channel.muteOut,
        noiseGateOut: channel.noiseGateOut,
        delayOut: channel.delayOut,
        invertedOut: channel.invertedOut,
        powerMode: channel.powerMode
      },
      limiters: {
        rmsLimiter: channel.rmsLimiter,
        peakLimiter: channel.peakLimiter
      },
      matrix: channel.matrix,
      eq: {
        in: channel.eqIn,
        out: channel.eqOut
      },
      flags
    } as unknown as JsonValue;
  });

  useEffect(() => {
    if (activeSection === "preferences" && selectedAmp?.reachable && selectedAmp.presets === undefined && !fetching) {
      void fetchPresets(selectedAmp.mac);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, selectedMac]);

  useEffect(() => {
    setActivePreset(null);
    setRecallDialogOpen(false);
    setStoreDialogOpen(false);
    setStorePresetName("");
  }, [selectedMac]);

  if (!amps || amps.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        {dict.monitor.ampTabs.noAmpsAssigned}
      </div>
    );
  }

  return (
    <div className="grid w-full gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-border/50 bg-card/25 p-2">
        <div className="mb-2 flex items-center justify-between border-b border-border/50 px-2 pb-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {dict.monitor.ampTabs.ampRack}
            </p>
            <p className="text-sm font-semibold">
              {dict.monitor.ampTabs.devicesCount.replace("{count}", String(amps.length))}
            </p>
          </div>
          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
            {onlineCount} {dict.monitor.online}
          </span>
        </div>

        <div className="space-y-1.5">
          {amps.map((amp) => {
            const selected = selectedMac === amp.mac;
            return (
              <Button
                key={amp.mac}
                variant={selected ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedMac(amp.mac)}
                className="h-11 w-full justify-start gap-2.5 whitespace-nowrap px-2.5 font-medium"
              >
                <div
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${amp.reachable ? "bg-emerald-500" : "bg-rose-500"}`}
                />
                <div className="min-w-0 text-left">
                  <p className="truncate text-xs font-semibold">{getDisplayName(amp)}</p>
                  <p className="truncate text-[10px] opacity-70">{amp.mac}</p>
                </div>
              </Button>
            );
          })}
        </div>
      </aside>

      {selectedAmp && (
        <div className="min-w-0 overflow-hidden rounded-lg border border-border/50 bg-card/20">
          <Tabs
            value={activeSection}
            onValueChange={(v) => setActiveSection(v as AmpSection)}
            orientation="horizontal"
            className="flex flex-col"
          >
            <div className="border-b border-border/50 px-3 pb-2 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {selectedAmp.reachable ? dict.monitor.ampTabs.connected : dict.monitor.ampTabs.offline}
                  </p>
                  <h2 className="truncate text-lg font-semibold leading-tight">{getDisplayName(selectedAmp)}</h2>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="font-mono">
                    {selectedAmp.ip ?? dict.monitor.ampTabs.noIp}
                  </Badge>
                </div>
              </div>

              <TabsList className="mt-2 grid h-9 w-full grid-cols-3 gap-1 px-1">
                <TabsTrigger value="main" className="h-7 w-full justify-center px-3">
                  <LayoutDashboardIcon className="size-4" />
                  {dict.monitor.ampTabs.tabMain}
                </TabsTrigger>
                <TabsTrigger value="matrix" className="h-7 w-full justify-center px-3">
                  <GridIcon className="size-4" />
                  {dict.monitor.ampTabs.tabMatrixLimiter}
                </TabsTrigger>
                <TabsTrigger value="preferences" className="h-7 w-full justify-center px-3">
                  <SlidersHorizontalIcon className="size-4" />
                  {dict.monitor.ampTabs.tabPreferences}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="main" className="p-4 mt-0">
              {!selectedAmp.reachable ? (
                <p className="text-sm text-muted-foreground">{dict.monitor.ampTabs.ampUnreachable}</p>
              ) : !selectedAmp.heartbeat ? (
                <p className="text-sm text-muted-foreground animate-pulse">{dict.monitor.ampTabs.waitingForData}</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border/50 bg-background/30 p-2.5">
                  <HeartbeatDashboard
                    hb={selectedAmp.heartbeat}
                    mac={selectedAmp.mac}
                    ratedRmsV={selectedAmp.ratedRmsV}
                    channelParams={selectedAmp.channelParams}
                    bridgePairs={selectedAmp.bridgePairs}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="matrix" className="p-4 mt-0">
              {!selectedAmp.channelParams ? (
                <p className="text-sm text-muted-foreground animate-pulse">{dict.monitor.ampTabs.waitingForData}</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border/50 bg-background/30 p-2.5">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] xl:gap-3">
                    <section className="flex min-h-[360px] flex-col gap-2">
                      <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {dict.monitor.ampTabs.matrix}
                      </h3>
                      <div className="flex justify-center">
                        <SourceConfigDialog
                          channels={selectedAmp.channelParams.channels}
                          mac={selectedAmp.mac}
                          capabilities={selectedAmp.sourceCapabilities}
                        />
                      </div>
                      <div className="flex flex-1 items-center justify-center overflow-auto">
                        <MatrixGrid
                          channels={selectedAmp.channelParams.channels}
                          mac={selectedAmp.mac}
                          analogInputCount={selectedAmp.sourceCapabilities?.analogInputCount}
                        />
                      </div>
                    </section>

                    <div className="hidden xl:block self-stretch w-px bg-border/60" />

                    <section className="flex min-h-[360px] flex-col gap-2">
                      <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {dict.monitor.ampTabs.limiters}
                      </h3>
                      <div className="flex flex-1 items-center justify-center">
                        <LimiterBlock
                          mac={selectedAmp.mac}
                          ratedRmsV={selectedAmp.ratedRmsV}
                          channelOhms={selectedAmp.constants.channels.map((channel) => channel.ohms)}
                          bridgePairs={selectedAmp.bridgePairs}
                          heartbeat={selectedAmp.heartbeat}
                          channels={selectedAmp.channelParams.channels}
                          limiters={selectedAmp.heartbeat?.limiters ?? [0, 0, 0, 0]}
                          showTitle={false}
                        />
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="preferences" className="p-4 mt-0">
              <Collapsible defaultOpen={false} className="mb-4">
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50 transition-colors [&[data-state=open]>svg]:rotate-90">
                  <ChevronRight className="shrink-0 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200" />
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      selectedAmp.reachable ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm font-semibold">{getDisplayName(selectedAmp)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-3 px-1">
                    <div>
                      <dt className="font-semibold">MAC:</dt>
                      <dd className="font-mono">{selectedAmp.mac}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Version:</dt>
                      <dd>{selectedAmp.version || "---"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">ID:</dt>
                      <dd>{selectedAmp.id || "---"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Runtime:</dt>
                      <dd>{selectedAmp.run_time !== undefined ? formatRuntime(selectedAmp.run_time) : "---"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Rated Output:</dt>
                      <dd>{selectedAmp.ratedRmsV !== undefined ? `${selectedAmp.ratedRmsV} V RMS` : "---"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Analog_signal_Input_chx:</dt>
                      <dd>
                        {selectedAmp.analog_signal_input_chx !== undefined
                          ? selectedAmp.analog_signal_input_chx
                          : "---"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Output_chx:</dt>
                      <dd>{selectedAmp.output_chx !== undefined ? selectedAmp.output_chx : "---"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Digital_signal_input_chx:</dt>
                      <dd>
                        {selectedAmp.basic_info?.Digital_signal_input_chx !== undefined
                          ? selectedAmp.basic_info.Digital_signal_input_chx
                          : "---"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Gain_max:</dt>
                      <dd>{selectedAmp.gain_max !== undefined ? selectedAmp.gain_max : "---"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Machine_state:</dt>
                      <dd>{selectedAmp.machine_state !== undefined ? selectedAmp.machine_state : "---"}</dd>
                    </div>
                  </dl>
                </CollapsibleContent>
              </Collapsible>

              <LinkingPanel
                mac={selectedAmp.mac}
                channelCount={selectedAmp.channelParams?.channels.length ?? selectedAmp.constants.channels.length}
              />

              <div>
                <ConfirmActionDialog
                  open={recallDialogOpen}
                  onOpenChange={setRecallDialogOpen}
                  title={dict.dialogs.presets.recallTitle}
                  description={
                    activePreset
                      ? dict.dialogs.presets.recallDescription
                          .replace("{slot}", String(activePreset.slot))
                          .replace("{name}", activePreset.name)
                      : dict.dialogs.presets.recallFallbackDescription
                  }
                  confirmLabel={
                    recallingSlot === activePreset?.slot ? dict.dialogs.presets.recalling : dict.dialogs.presets.recall
                  }
                  confirmDisabled={!selectedAmp?.reachable || activePreset === null || recallingSlot !== null}
                  onConfirm={async () => {
                    if (!selectedAmp || !activePreset) return;
                    const ok = await recallPreset(selectedAmp.mac, activePreset.slot, activePreset.name);
                    if (ok) setRecallDialogOpen(false);
                  }}
                />

                <ConfirmActionDialog
                  open={storeDialogOpen}
                  onOpenChange={(open) => {
                    setStoreDialogOpen(open);
                    if (!open && activePreset) setStorePresetName(activePreset.name);
                  }}
                  title={dict.dialogs.presets.storeTitle}
                  description={
                    activePreset
                      ? dict.dialogs.presets.storeDescription.replace("{slot}", String(activePreset.slot))
                      : dict.dialogs.presets.storeFallbackDescription
                  }
                  confirmLabel={
                    storingSlot === activePreset?.slot ? dict.dialogs.presets.storing : dict.dialogs.presets.store
                  }
                  confirmDisabled={
                    !selectedAmp?.reachable ||
                    activePreset === null ||
                    storingSlot !== null ||
                    storePresetName.trim().length === 0
                  }
                  onConfirm={async () => {
                    if (!selectedAmp || !activePreset) return;
                    const ok = await storePreset(selectedAmp.mac, activePreset.slot, storePresetName);
                    if (ok) setStoreDialogOpen(false);
                  }}
                >
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      {dict.dialogs.presets.presetName}
                    </label>
                    <Input
                      value={storePresetName}
                      onChange={(e) => setStorePresetName(e.target.value)}
                      placeholder={dict.dialogs.presets.presetNamePlaceholder}
                      maxLength={32}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">{storePresetName.length}/32</p>
                  </div>
                </ConfirmActionDialog>

                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold">{dict.monitor.ampTabs.presets}</h3>
                  {fetching && (
                    <span className="text-xs text-muted-foreground animate-pulse">{dict.monitor.ampTabs.loading}</span>
                  )}
                  {!fetching && selectedAmp.presets !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {dict.monitor.ampTabs.usedCount.replace("{count}", String(selectedAmp.presets.length))}
                    </span>
                  )}
                </div>

                {presetsError && <p className="text-xs text-destructive mb-2">{presetsError}</p>}

                {!fetching && !selectedAmp.presets && !presetsError && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAmp.reachable
                      ? dict.monitor.ampTabs.loadingPresets
                      : dict.monitor.ampTabs.presetsUnavailable}
                  </p>
                )}

                {selectedAmp.presets?.length === 0 && (
                  <p className="text-xs text-muted-foreground">{dict.monitor.ampTabs.noPresetsSaved}</p>
                )}

                {selectedAmp.presets && selectedAmp.presets.length > 0 && (
                  <ul className="space-y-1">
                    {selectedAmp.presets.map((preset) => (
                      <li key={preset.slot} className="list-none">
                        <div
                          role="button"
                          tabIndex={selectedAmp.reachable ? 0 : -1}
                          onClick={() => {
                            if (!selectedAmp.reachable) return;
                            setActivePreset((current) => (current?.slot === preset.slot ? null : preset));
                            setStorePresetName(preset.name);
                          }}
                          onKeyDown={(e) => {
                            if (!selectedAmp.reachable) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActivePreset((current) => (current?.slot === preset.slot ? null : preset));
                              setStorePresetName(preset.name);
                            }
                          }}
                          className={`flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-sm text-left transition-colors ${
                            activePreset?.slot === preset.slot ? "border-primary/40 bg-accent" : "hover:bg-accent"
                          } ${!selectedAmp.reachable ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                        >
                          <span className="w-6 text-center text-xs font-mono text-muted-foreground">{preset.slot}</span>
                          <span className="font-medium flex-1 min-w-0 truncate">{preset.name}</span>
                          {activePreset?.slot === preset.slot && (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStorePresetName(preset.name);
                                  setStoreDialogOpen(true);
                                }}
                              >
                                {dict.dialogs.presets.store}
                              </Button>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecallDialogOpen(true);
                                }}
                              >
                                {dict.dialogs.presets.recall}
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedAmp.channelParams && (
                <Collapsible defaultOpen={false} className="mt-6 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-muted/50 transition-colors [&[data-state=open]>svg]:rotate-90">
                      <ChevronRight className="shrink-0 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200" />
                      <span className="text-sm font-semibold">{dict.monitor.ampTabs.channelData}</span>
                    </CollapsibleTrigger>
                    <CopyJsonButton data={preferenceChannelTrees ?? selectedAmp.channelParams.channels} />
                  </div>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-3">
                      {selectedAmp.channelParams.channels.map((channel, idx) => (
                        <JsonTree
                          key={channel.channel}
                          label={dict.monitor.ampTabs.channelLabel
                            .replace("{channel}", String(channel.channel))
                            .replace("{input}", channel.inputName)
                            .replace("{output}", channel.outputName)}
                          value={(preferenceChannelTrees?.[idx] ?? channel) as unknown as JsonValue}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
