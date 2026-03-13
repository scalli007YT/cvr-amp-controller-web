"use client";

import { useEffect, useState } from "react";
import { useAmpStore } from "@/stores/AmpStore";
import type { AmpPreset } from "@/stores/AmpStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import { formatRuntime } from "@/lib/generic";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
  ChevronRight,
} from "lucide-react";
import { HeartbeatDashboard } from "@/components/monitor/amp-tabs/heartbeat-dashboard";
import { LimiterBlock } from "@/components/monitor/amp-tabs/limiter-panel";
import { MatrixGrid } from "@/components/monitor/amp-tabs/matrix-grid";
import {
  CopyJsonButton,
  JsonTree,
  type JsonValue,
} from "@/components/monitor/amp-tabs/json-viewer";

type AmpSection = "main" | "matrix" | "preferences";

export function AmpTabs() {
  const { amps, getDisplayName } = useAmpStore();
  const {
    fetchPresets,
    recallPreset,
    storePreset,
    fetching,
    recallingSlot,
    storingSlot,
    error: presetsError,
  } = useAmpPresets();

  const [selectedMac, setSelectedMac] = useState<string | null>(
    amps.length > 0 ? amps[0].mac : null,
  );
  const [activeSection, setActiveSection] = useState<AmpSection>("main");
  const [activePreset, setActivePreset] = useState<AmpPreset | null>(null);
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const [storeDialogOpen, setStoreDialogOpen] = useState(false);
  const [storePresetName, setStorePresetName] = useState("");

  const onlineCount = amps.filter((amp) => amp.reachable).length;
  const selectedAmp = amps.find((a) => a.mac === selectedMac);

  useEffect(() => {
    if (
      activeSection === "preferences" &&
      selectedAmp?.reachable &&
      selectedAmp.presets === undefined &&
      !fetching
    ) {
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
        No amps assigned. Add amps to start monitoring.
      </div>
    );
  }

  return (
    <div className="grid w-full gap-3 xl:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-border/50 bg-card/25 p-2">
        <div className="mb-2 flex items-center justify-between border-b border-border/50 px-2 pb-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Amp Rack
            </p>
            <p className="text-sm font-semibold">{amps.length} Devices</p>
          </div>
          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
            {onlineCount} online
          </span>
        </div>

        <div className="space-y-1.5">
          {amps.map((amp) => {
            const selected = selectedMac === amp.mac;
            return (
              <Button
                key={amp.mac}
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMac(amp.mac)}
                className={`h-11 w-full justify-start gap-2.5 whitespace-nowrap border px-2.5 font-medium transition-colors ${
                  selected
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/50 bg-card/30 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <div
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    amp.reachable ? "bg-emerald-500" : "bg-rose-500"
                  }`}
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
                    {selectedAmp.reachable ? "Connected" : "Offline"}
                  </p>
                  <h2 className="truncate text-lg font-semibold leading-tight">
                    {getDisplayName(selectedAmp)}
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge
                    variant="outline"
                    className="rounded border-border/50 bg-muted/20 font-mono"
                  >
                    {selectedAmp.ip ?? "no ip"}
                  </Badge>
                </div>
              </div>

              <TabsList className="mt-2 h-9 w-full justify-start gap-1 rounded-md border border-border/50 bg-background/35 px-1">
                <TabsTrigger
                  value="main"
                  className="h-7 flex-none border border-transparent px-3 data-active:border-primary/45 data-active:bg-primary/18 data-active:text-foreground"
                >
                  <LayoutDashboardIcon className="size-4" />
                  Main
                </TabsTrigger>
                <TabsTrigger
                  value="matrix"
                  className="h-7 flex-none border border-transparent px-3 data-active:border-primary/45 data-active:bg-primary/18 data-active:text-foreground"
                >
                  <GridIcon className="size-4" />
                  Matrix / Limiter
                </TabsTrigger>
                <TabsTrigger
                  value="preferences"
                  className="h-7 flex-none border border-transparent px-3 data-active:border-primary/45 data-active:bg-primary/18 data-active:text-foreground"
                >
                  <SlidersHorizontalIcon className="size-4" />
                  Preferences
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="main" className="p-4 mt-0">
              {!selectedAmp.reachable ? (
                <p className="text-sm text-muted-foreground">Amp is unreachable.</p>
              ) : !selectedAmp.heartbeat ? (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Waiting for data�
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border/50 bg-background/30 p-2.5">
                  <HeartbeatDashboard
                    hb={selectedAmp.heartbeat}
                    mac={selectedAmp.mac}
                    ratedRmsV={selectedAmp.ratedRmsV}
                    channelParams={selectedAmp.channelParams}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="matrix" className="p-4 mt-0">
              {!selectedAmp.channelParams ? (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Waiting for data�
                </p>
              ) : (
                <div className="flex flex-wrap gap-6 items-start">
                  <div className="flex flex-col gap-2 flex-shrink-0 rounded-md border border-border/50 bg-background/30 p-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Crosspoint Matrix
                    </span>
                    <MatrixGrid
                      channels={selectedAmp.channelParams.channels}
                      mac={selectedAmp.mac}
                    />
                  </div>

                  <div className="flex gap-6 rounded-md border border-border/50 bg-background/30 p-2.5">
                    <LimiterBlock
                      label="RMS Limiter"
                      channels={selectedAmp.channelParams.channels}
                      limiters={selectedAmp.heartbeat?.limiters ?? [0, 0, 0, 0]}
                    />
                    <Separator
                      orientation="vertical"
                      className="self-stretch h-auto opacity-40"
                    />
                    <LimiterBlock
                      label="Peak Limiter"
                      channels={selectedAmp.channelParams.channels}
                      limiters={selectedAmp.heartbeat?.limiters ?? [0, 0, 0, 0]}
                    />
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
                  <span className="text-sm font-semibold">
                    {getDisplayName(selectedAmp)}
                  </span>
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
                      <dd>
                        {selectedAmp.run_time !== undefined
                          ? formatRuntime(selectedAmp.run_time)
                          : "---"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Rated Output:</dt>
                      <dd>
                        {selectedAmp.ratedRmsV !== undefined
                          ? `${selectedAmp.ratedRmsV} V RMS`
                          : "---"}
                      </dd>
                    </div>
                  </dl>
                </CollapsibleContent>
              </Collapsible>

              <div>
                <ConfirmActionDialog
                  open={recallDialogOpen}
                  onOpenChange={setRecallDialogOpen}
                  title="Recall Preset"
                  description={
                    activePreset
                      ? `Recall preset ${activePreset.slot}: ${activePreset.name}?`
                      : "Recall this preset?"
                  }
                  confirmLabel={
                    recallingSlot === activePreset?.slot ? "Recalling..." : "Recall"
                  }
                  confirmDisabled={
                    !selectedAmp?.reachable ||
                    activePreset === null ||
                    recallingSlot !== null
                  }
                  onConfirm={async () => {
                    if (!selectedAmp || !activePreset) return;
                    const ok = await recallPreset(
                      selectedAmp.mac,
                      activePreset.slot,
                      activePreset.name,
                    );
                    if (ok) setRecallDialogOpen(false);
                  }}
                />

                <ConfirmActionDialog
                  open={storeDialogOpen}
                  onOpenChange={(open) => {
                    setStoreDialogOpen(open);
                    if (!open && activePreset) setStorePresetName(activePreset.name);
                  }}
                  title="Store Preset"
                  description={
                    activePreset
                      ? `Store current device state to preset ${activePreset.slot}.`
                      : "Choose a name for this preset."
                  }
                  confirmLabel={
                    storingSlot === activePreset?.slot ? "Storing..." : "Store"
                  }
                  confirmDisabled={
                    !selectedAmp?.reachable ||
                    activePreset === null ||
                    storingSlot !== null ||
                    storePresetName.trim().length === 0
                  }
                  onConfirm={async () => {
                    if (!selectedAmp || !activePreset) return;
                    const ok = await storePreset(
                      selectedAmp.mac,
                      activePreset.slot,
                      storePresetName,
                    );
                    if (ok) setStoreDialogOpen(false);
                  }}
                >
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Preset Name
                    </label>
                    <Input
                      value={storePresetName}
                      onChange={(e) => setStorePresetName(e.target.value)}
                      placeholder="Enter preset name"
                      maxLength={32}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">
                      {storePresetName.length}/32
                    </p>
                  </div>
                </ConfirmActionDialog>

                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold">Presets</h3>
                  {fetching && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Loading...
                    </span>
                  )}
                  {!fetching && selectedAmp.presets !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {selectedAmp.presets.length} used
                    </span>
                  )}
                </div>

                {presetsError && <p className="text-xs text-destructive mb-2">{presetsError}</p>}

                {!fetching && !selectedAmp.presets && !presetsError && (
                  <p className="text-xs text-muted-foreground">
                    {selectedAmp.reachable
                      ? "Loading presets..."
                      : "Amp is unreachable - presets unavailable."}
                  </p>
                )}

                {selectedAmp.presets?.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No presets saved on this device.
                  </p>
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
                            setActivePreset((current) =>
                              current?.slot === preset.slot ? null : preset,
                            );
                            setStorePresetName(preset.name);
                          }}
                          onKeyDown={(e) => {
                            if (!selectedAmp.reachable) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActivePreset((current) =>
                                current?.slot === preset.slot ? null : preset,
                              );
                              setStorePresetName(preset.name);
                            }
                          }}
                          className={`flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-sm text-left transition-colors ${
                            activePreset?.slot === preset.slot
                              ? "border-primary/40 bg-accent"
                              : "hover:bg-accent"
                          } ${
                            !selectedAmp.reachable
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }`}
                        >
                          <span className="w-6 text-center text-xs font-mono text-muted-foreground">
                            {preset.slot}
                          </span>
                          <span className="font-medium flex-1 min-w-0 truncate">
                            {preset.name}
                          </span>
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
                                Store
                              </Button>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecallDialogOpen(true);
                                }}
                              >
                                Recall
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
                      <span className="text-sm font-semibold">Channel Data</span>
                    </CollapsibleTrigger>
                    <CopyJsonButton data={selectedAmp.channelParams.channels} />
                  </div>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-3">
                      {selectedAmp.channelParams.channels.map((ch) => (
                        <JsonTree
                          key={ch.channel}
                          label={`Channel ${ch.channel} - ${ch.inputName} -> ${ch.outputName}`}
                          value={ch as unknown as JsonValue}
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
