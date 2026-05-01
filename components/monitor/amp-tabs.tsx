"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAmpStore } from "@/stores/AmpStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import {
  LayoutDashboardIcon,
  GridIcon,
  SlidersHorizontalIcon,
  Link2Icon,
  LibraryBig,
  Lock,
  LockOpen,
  Power,
  PowerOff,
} from "lucide-react";
import { AssignAmpsDialog } from "@/components/dialogs/assign-amps-dialog";
import { StatusLed } from "@/components/custom/status-led";
import { useI18n } from "@/components/layout/i18n-provider";
import { AMP_NAME_MAX_LENGTH } from "@/lib/constants";
import { AmpUnreachableCard } from "@/components/custom/amp-unreachable-card";
import { InputWithCheck } from "@/components/custom/input-with-check";
import { AmpRackSidebar } from "@/components/monitor/amp-rack-sidebar";
import { useTabStore, type AmpSection } from "@/stores/TabStore";
import { useAmpActions } from "@/hooks/useAmpActions";
import { DEFAULT_AMP_OPTIONS, useAmpOptionStore } from "@/stores/AmpOptionStore";
import { useLibraryStore } from "@/stores/LibraryStore";
import { useAmpPresets } from "@/hooks/useAmpPresets";
import { MainPanel } from "@/components/monitor/amp-tabs/main-panel";
import { MatrixPanel } from "@/components/monitor/amp-tabs/matrix-panel";
import { PreferencesPanel } from "@/components/monitor/amp-tabs/preferences-panel";
import { LinkingPanel } from "@/components/monitor/amp-tabs/linking-panel";
import { SpeakerLibraryBrowser } from "@/components/monitor/amp-tabs/speaker-library-browser";
import { SpeakerModelDraft } from "@/components/monitor/amp-tabs/speaker-device";
import { SpeakerControlBar } from "@/components/monitor/amp-tabs/speaker-control-bar";


export function AmpTabs() {
  const dict = useI18n();
  const { amps, getDisplayName, updateAmpStatus } = useAmpStore();
  const { fetchPresets, refreshCurrentPreset } = useAmpPresets();

  const selectedMac = useTabStore((state) => state.selectedAmpMac);
  const setSelectedMac = useTabStore((state) => state.setSelectedAmpMac);
  const activeSection = useTabStore((state) => state.selectedSection);
  const setSelectedSection = useTabStore((state) => state.setSelectedSection);

  const [renameDraft, setRenameDraft] = useState("");
  const [renameConfirmOpen, setRenameConfirmOpen] = useState(false);
  const [pendingRename, setPendingRename] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [lockUpdating, setLockUpdating] = useState(false);
  const [standbyUpdating, setStandbyUpdating] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const { setAmpLock, setAmpStandby } = useAmpActions();
  const ampOptionsRaw = useAmpOptionStore((s) => s.options[(selectedMac ?? "").toUpperCase()]);
  const speakerApplying = useLibraryStore((state) => state.applying);
  const ampOptions = { ...DEFAULT_AMP_OPTIONS, ...ampOptionsRaw };
  const fetching = useAmpPresets().fetching;

  const selectedAmp = amps.find((a) => a.mac === selectedMac) ?? amps[0];
  // Filter channels based on authoritative output_chx from discovery (FC=0)
  const effectiveChannelCount = selectedAmp?.output_chx ?? selectedAmp?.channelParams?.channels.length ?? 0;
  const effectiveChannels = selectedAmp?.channelParams?.channels.slice(0, effectiveChannelCount) ?? [];
  const effectiveChannelOhms = selectedAmp?.constants.channels.slice(0, effectiveChannelCount) ?? [];

  // ---------------------------------------------------------------------------
  // Effects — amp selection, preset hydration, option hydration
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedAmp?.mac) return;
    void useAmpOptionStore.getState().ensureHydrated(selectedAmp.mac);
  }, [selectedAmp?.mac]);

  useEffect(() => {
    if (!amps.length) {
      if (selectedMac !== null) setSelectedMac(null);
      return;
    }
    if (!selectedMac || !amps.some((amp) => amp.mac === selectedMac)) {
      setSelectedMac(amps[0].mac);
    }
  }, [amps, selectedMac, setSelectedMac]);

  useEffect(() => {
    if (!selectedAmp?.reachable || selectedAmp.presets !== undefined || fetching) return;
    void fetchPresets(selectedAmp.mac);
  }, [selectedAmp?.mac, selectedAmp?.reachable, selectedAmp?.presets, fetching, fetchPresets]);

  useEffect(() => {
    if (!selectedAmp?.reachable) return;
    if (speakerApplying) return;

    void refreshCurrentPreset(selectedAmp.mac);
    const timer = setInterval(() => {
      if (useLibraryStore.getState().applying) return;
      void refreshCurrentPreset(selectedAmp.mac);
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedAmp?.mac, selectedAmp?.reachable, refreshCurrentPreset, speakerApplying]);

  useEffect(() => {
    if (!selectedAmp) return;
    setRenameDraft(getDisplayName(selectedAmp));
  }, [selectedAmp?.mac, selectedAmp?.name, selectedAmp?.lastKnownName, selectedAmp?.customName, getDisplayName]);

  // ---------------------------------------------------------------------------
  // Amp-level actions: rename, lock, standby
  // ---------------------------------------------------------------------------

  const renameAmp = async (nextNameRaw: string) => {
    if (!selectedAmp || renaming) return false;
    const nextName = nextNameRaw.trim();
    if (nextName.length === 0) return false;

    setRenaming(true);
    try {
      const response = await fetch("/api/amp-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mac: selectedAmp.mac, action: "renameAmp", channel: 0, value: nextName })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      updateAmpStatus(selectedAmp.mac, { name: nextName, lastKnownName: nextName });
      setRenameDraft(nextName);
      setPendingRename("");
      setRenameConfirmOpen(false);
      toast.success("Amp name updated");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Rename failed: ${message}`);
      setRenameDraft(getDisplayName(selectedAmp));
      setRenameConfirmOpen(false);
      setPendingRename("");
      return false;
    } finally {
      setRenaming(false);
    }
  };

  const submitRename = async () => {
    if (!selectedAmp || pendingRename.trim().length === 0 || renaming) return;
    await renameAmp(pendingRename);
  };

  const setSelectedAmpLock = async () => {
    if (!selectedAmp || lockUpdating) return;
    const nextLocked = !(selectedAmp.locked ?? false);
    setLockUpdating(true);
    try {
      await setAmpLock(selectedAmp.mac, nextLocked);
      updateAmpStatus(selectedAmp.mac, { locked: nextLocked });
      toast.success(nextLocked ? "Amp locked" : "Amp unlocked");
    } catch {
      // Error toast handled in useAmpActions
    } finally {
      setLockUpdating(false);
    }
  };

  const setSelectedAmpStandby = async () => {
    if (!selectedAmp || standbyUpdating) return;
    const nextStandby = !(selectedAmp.standby ?? false);
    const mac = selectedAmp.mac;
    setStandbyUpdating(true);
    try {
      await setAmpStandby(mac, nextStandby);
      const confirmed = await new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 5000;
        const check = () => {
          const amp = useAmpStore.getState().amps.find((a) => a.mac === mac);
          if (amp?.standby === nextStandby) {
            resolve(true);
            return;
          }
          if (Date.now() >= deadline) {
            resolve(false);
            return;
          }
          setTimeout(check, 100);
        };
        setTimeout(check, 100);
      });
      if (confirmed) {
        toast.success(nextStandby ? "Amp in standby" : "Amp normal");
      } else {
        toast.error("Standby command was not confirmed by the amp");
      }
    } catch {
      // Error toast handled in useAmpActions
    } finally {
      setStandbyUpdating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (!amps || amps.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-border/50 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        <p className="w-full max-w-sm">{dict.monitor.ampTabs.noAmpsAssigned}</p>
        <AssignAmpsDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          trigger={
            <Button variant="outline" className="mt-4 w-full max-w-sm">
              {dict.monitor.ampTabs.assignAction}
            </Button>
          }
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main layout: sidebar + device console
  // ---------------------------------------------------------------------------

  return (
    <div className="grid min-h-0 w-full flex-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
      <AmpRackSidebar dictionary={dict.monitor} />

      {/* Unreachable state */}
      {selectedAmp && !selectedAmp.reachable && (
        <AmpUnreachableCard
          ampName={getDisplayName(selectedAmp)}
          ip={selectedAmp.ip}
          message={dict.monitor.ampTabs.ampUnreachable}
        />
      )}

      {/* Device console */}
      {selectedAmp && selectedAmp.reachable && (
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/20">
          <Tabs
            value={activeSection}
            onValueChange={(v) => setSelectedSection(v as AmpSection)}
            orientation="horizontal"
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Device header bar */}
            <div className="border-b border-border/50 px-3 pb-2 pt-2">
              <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {selectedAmp.reachable ? dict.monitor.ampTabs.connected : dict.monitor.ampTabs.offline}
                  </p>
                  <InputWithCheck
                    value={renameDraft}
                    maxLength={AMP_NAME_MAX_LENGTH}
                    className="h-8 text-lg font-semibold leading-tight"
                    disabled={renaming}
                    onChange={setRenameDraft}
                    onCommit={() => {
                      if (!selectedAmp || renaming) return;
                      const trimmedDraft = renameDraft.trim();
                      const currentName = getDisplayName(selectedAmp).trim();
                      if (trimmedDraft.length === 0) {
                        setRenameDraft(currentName);
                        return;
                      }
                      if (trimmedDraft === currentName) return;
                      void renameAmp(trimmedDraft);
                    }}
                    onBlur={() => {
                      const trimmedDraft = renameDraft.trim();
                      const currentName = getDisplayName(selectedAmp).trim();
                      if (trimmedDraft.length === 0) {
                        setRenameDraft(currentName);
                        return;
                      }
                      if (trimmedDraft === currentName) return;
                      setPendingRename(trimmedDraft);
                      setRenameConfirmOpen(true);
                    }}
                  />
                </div>
                <span className="pointer-events-none absolute left-1/2 hidden max-w-[40%] -translate-x-1/2 truncate text-center text-xs text-muted-foreground xl:block">
                  {dict.monitor.ampTabs.currentPresetLabel}: {selectedAmp.current_preset?.trim() || "---"}
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <StatusLed channelFlags={selectedAmp.channelFlags} standby={selectedAmp.standby} />
                  <Badge variant="outline" className="font-mono">
                    {selectedAmp.ip ?? dict.monitor.ampTabs.noIp}
                  </Badge>
                  <Button
                    size="icon"
                    variant={selectedAmp.locked ? "secondary" : "outline"}
                    disabled={lockUpdating}
                    onClick={() => void setSelectedAmpLock()}
                    className="h-9 w-9"
                    aria-label={selectedAmp.locked ? "Unlock amp" : "Lock amp"}
                    title={selectedAmp.locked ? "Unlock" : "Lock"}
                  >
                    {selectedAmp.locked ? (
                      <Lock className="size-4 text-red-500" />
                    ) : (
                      <LockOpen className="size-4 text-green-500" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant={selectedAmp.standby ? "secondary" : "outline"}
                    disabled={standbyUpdating}
                    onClick={() => void setSelectedAmpStandby()}
                    className="h-9 w-9"
                    aria-label={selectedAmp.standby ? "Normal amp" : "Standby amp"}
                    title={selectedAmp.standby ? "Normal" : "Standby"}
                  >
                    {selectedAmp.standby ? (
                      <PowerOff className="size-4 text-orange-500" />
                    ) : (
                      <Power className="size-4 text-green-500" />
                    )}
                  </Button>
                </div>
              </div>

              <TabsList className="mt-2 grid h-9 w-full grid-cols-5 gap-1 px-1">
                <TabsTrigger value="main" className="h-7 w-full justify-center px-1 sm:px-3">
                  <LayoutDashboardIcon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{dict.monitor.ampTabs.tabMain}</span>
                </TabsTrigger>
                <TabsTrigger value="matrix" className="h-7 w-full justify-center px-1 sm:px-3">
                  <GridIcon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{dict.monitor.ampTabs.tabMatrixLimiter}</span>
                </TabsTrigger>
                <TabsTrigger value="linking" className="h-7 w-full justify-center px-1 sm:px-3">
                  <Link2Icon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{dict.dialogs.linkingGroups.panelTitle}</span>
                </TabsTrigger>
                <TabsTrigger value="preferences" className="h-7 w-full justify-center px-1 sm:px-3">
                  <SlidersHorizontalIcon className="size-4 shrink-0" />
                  <span className="hidden sm:inline">{dict.monitor.ampTabs.tabPreferences}</span>
                </TabsTrigger>
                <TabsTrigger value="speaker-config" className="h-7 w-full justify-center px-1 sm:px-3">
                  <LibraryBig className="size-4 shrink-0" />
                  <span className="hidden sm:inline">Speaker Config</span>
                </TabsTrigger>

              </TabsList>
            </div>

            {/* Rename confirmation dialog */}
            <ConfirmActionDialog
              open={renameConfirmOpen}
              onOpenChange={(open) => {
                setRenameConfirmOpen(open);
                if (!open && selectedAmp) {
                  setPendingRename("");
                  setRenameDraft(getDisplayName(selectedAmp));
                }
              }}
              title="Rename amplifier"
              description={pendingRename ? `Rename to \"${pendingRename}\"?` : "Confirm amp rename."}
              confirmLabel={renaming ? "Renaming..." : "Rename"}
              confirmDisabled={renaming || pendingRename.trim().length === 0}
              onConfirm={submitRename}
            />

            {/* Tab panels — each delegated to its own component */}
            <TabsContent value="main" className="min-h-0 flex-1 overflow-y-auto p-4 mt-0">
              <MainPanel amp={selectedAmp} ampOptions={ampOptions} />
            </TabsContent>

            <TabsContent value="matrix" className="min-h-0 flex-1 overflow-y-auto p-4 mt-0">
              <MatrixPanel
                amp={selectedAmp}
                effectiveChannels={effectiveChannels}
                effectiveChannelCount={effectiveChannelCount}
                effectiveChannelOhms={effectiveChannelOhms}
                ampOptions={ampOptions}
              />
            </TabsContent>

            <TabsContent value="linking" className="min-h-0 flex-1 overflow-y-auto p-4 mt-0">
              <div className="overflow-hidden rounded-md border border-border/50 bg-background/30 p-2.5">
                <LinkingPanel
                  mac={selectedAmp.mac}
                  channelCount={effectiveChannelCount || selectedAmp.constants.channels.length}
                />
              </div>
            </TabsContent>

            <TabsContent value="preferences" className="min-h-0 flex-1 overflow-y-auto p-4 mt-0">
              <PreferencesPanel
                amp={selectedAmp}
                ampOptions={ampOptions}
                effectiveChannels={effectiveChannels}
                getDisplayName={getDisplayName}
              />
            </TabsContent>

            <TabsContent value="speaker-config" className="min-h-0 flex-1 overflow-y-auto p-4 mt-0">
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_200px_minmax(0,0.9fr)]">
                <SpeakerModelDraft channelCount={effectiveChannelCount || 4} scope={selectedMac} />
                <SpeakerControlBar scope={selectedMac} channelCount={effectiveChannelCount || 4} />
                <SpeakerLibraryBrowser isActive={activeSection === "speaker-config"} />
              </div>
            </TabsContent>


          </Tabs>
        </div>
      )}
    </div>
  );
}
