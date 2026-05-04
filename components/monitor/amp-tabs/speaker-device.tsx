"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, RotateCcw, Settings2, SplitSquareVertical, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildRowSegments, formatChannelList, toScopeKey, type RowSegment } from "@/lib/speaker-config";
import {
  formatPostApplyResultSummary,
  runPostApplyActions,
  type PostApplyContext,
  type SpeakerApplyPolicy
} from "@/lib/speaker-apply-policy";
import { useAmpActions } from "@/hooks/useAmpActions";
import { useAmpStore } from "@/stores/AmpStore";
import { computeSyncHashFromParsed, embedHashInName, extractBaseNameFromName } from "@/lib/speaker-sync-hash";
import { waitForFreshChannelData } from "@/lib/wait-for-fresh-channel-data";
import {
  type LibraryFileEntry,
  useLibraryStore,
  type SaveWayMapping,
  type ApplyWayMapping,
  type SaveProgress,
  type ApplyProgress
} from "@/stores/LibraryStore";
import { type SpeakerProfileDraft, SpeakerConfigEditorDialog } from "@/components/dialogs/speaker-config-editor-dialog";
import {
  type ChannelGroup,
  type SpeakerDragItem,
  type SpeakerOutputAssignment,
  findGroupForChannel,
  useSpeakerConfigStore
} from "@/stores/SpeakerConfigStore";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/components/layout/i18n-provider";

const EMPTY_SELECTION: number[] = [];
const EMPTY_ASSIGNMENTS: Record<number, SpeakerOutputAssignment> = {};
const EMPTY_GROUPS: ChannelGroup[] = [];

interface SpeakerDeviceDraftProps {
  channelCount?: number;
  scope?: string | null;
}

type SpeakerToastsDict = {
  saveProgressReading: string;
  saveProgressReadingDesc: string;
  savingTitle: string;
  saveProgressWriting: string;
  saveProgressRefreshing: string;
  applyProgressTitle: string;
  applyProgressSending: string;
  applyProgressFinished: string;
  applyProgressFailed: string;
  applyProgressRetry: string;
  applyProgressClean: string;
};

function buildSaveProgressMessage(
  progress: SaveProgress,
  t: SpeakerToastsDict
): { title: string; description?: string } {
  if (progress.stage === "reading-way") {
    return {
      title: t.saveProgressReading
        .replace("{current}", String(progress.current))
        .replace("{total}", String(progress.total)),
      description: t.saveProgressReadingDesc
        .replace("{label}", progress.label || `Way ${progress.current}`)
        .replace("{channel}", String((progress.channel ?? 0) + 1))
    };
  }

  if (progress.stage === "writing-library") {
    return {
      title: t.savingTitle,
      description: t.saveProgressWriting
    };
  }

  return {
    title: t.savingTitle,
    description: t.saveProgressRefreshing
  };
}

function buildApplyProgressMessage(
  progress: ApplyProgress,
  t: SpeakerToastsDict
): { title: string; description?: string } {
  // progress.channels are 0-based (API convention); convert to 1-based for display
  const channelText = formatChannelList(progress.channels.map((ch) => ch + 1));
  const progressTitle = t.applyProgressTitle
    .replace("{current}", String(progress.current))
    .replace("{total}", String(progress.total));

  if (progress.stage === "sending-way") {
    return {
      title: progressTitle,
      description: t.applyProgressSending.replace("{channels}", channelText)
    };
  }

  const result = progress.result;
  if (!result) {
    return {
      title: progressTitle,
      description: t.applyProgressFinished.replace("{channels}", channelText)
    };
  }

  if (!result.sent) {
    return {
      title: progressTitle,
      description: t.applyProgressFailed.replace("{channels}", channelText)
    };
  }

  const recoveryUsed = result.frameAttemptsMax > 1 || result.fragmentRetries > 0;
  return {
    title: progressTitle,
    description: recoveryUsed
      ? t.applyProgressRetry.replace("{channels}", channelText)
      : t.applyProgressClean.replace("{channels}", channelText)
  };
}

/** Build a list of visual row segments from channel groups. */
export function SpeakerModelDraft({ channelCount = 4, scope }: SpeakerDeviceDraftProps) {
  const i18n = useI18n();
  const dict = i18n.dialogs.speakerConfig;
  const t = dict.toasts;
  const rowCount = Math.max(1, Math.min(channelCount, 8));
  const scopeKey = toScopeKey(scope);
  const lastClickedChannelRef = useRef<number | null>(null);
  const [previewChannels, setPreviewChannels] = useState<number[]>([]);
  const [previewValid, setPreviewValid] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<SpeakerProfileDraft>({
    brand: "",
    family: "",
    model: "",
    application: "",
    notes: "",
    ways: [{ id: "way-1", label: "Way 1", role: "custom" }]
  });
  const [editorTargetChannel, setEditorTargetChannel] = useState(1);
  const [editorSegmentKey, setEditorSegmentKey] = useState<string | null>(null);
  const [editorDraftBySegment, setEditorDraftBySegment] = useState<Record<string, SpeakerProfileDraft>>({});
  // When editing an existing assignment, store its current library id so saveToLibrary can PUT instead of POST.
  const [editorExistingId, setEditorExistingId] = useState<string | null>(null);

  const libraryFiles = useLibraryStore((state) => state.files);
  const libraryHasLoaded = useLibraryStore((state) => state.hasLoaded);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);
  const saving = useLibraryStore((state) => state.saving);
  const saveToLibrary = useLibraryStore((state) => state.saveToLibrary);
  const applying = useLibraryStore((state) => state.applying);
  const applyToDevice = useLibraryStore((state) => state.applyToDevice);

  const selectedOutputChannelsByScope = useSpeakerConfigStore((state) => state.selectedOutputChannelsByScope);
  const outputAssignmentsByScope = useSpeakerConfigStore((state) => state.outputAssignmentsByScope);
  const channelGroupsByScope = useSpeakerConfigStore((state) => state.channelGroupsByScope);
  const activeDraggedItem = useSpeakerConfigStore((state) => state.activeDraggedItem);
  const dragHoverChannel = useSpeakerConfigStore((state) => state.dragHoverChannel);
  const setActiveDraggedItem = useSpeakerConfigStore((state) => state.setActiveDraggedItem);
  const setOutputChannels = useSpeakerConfigStore((state) => state.setOutputChannels);
  const clearOutputChannels = useSpeakerConfigStore((state) => state.clearOutputChannels);
  const clearAllScope = useSpeakerConfigStore((state) => state.clearAllScope);
  const assignItemToOutputs = useSpeakerConfigStore((state) => state.assignItemToOutputs);
  const hydrateScopeFromGlobalStore = useSpeakerConfigStore((state) => state.hydrateScopeFromGlobalStore);
  const persistScopeToGlobalStore = useSpeakerConfigStore((state) => state.persistScopeToGlobalStore);

  // Post-apply policy state
  const postApplyEnabled = useSpeakerConfigStore((state) => state.postApplyEnabled);
  const postApplyChannelActions = useSpeakerConfigStore((state) => state.postApplyChannelActions);
  const postApplyTopologyActions = useSpeakerConfigStore((state) => state.postApplyTopologyActions);
  const setPostApplyEnabled = useSpeakerConfigStore((state) => state.setPostApplyEnabled);
  const togglePostApplyChannelAction = useSpeakerConfigStore((state) => state.togglePostApplyChannelAction);
  const togglePostApplyTopologyAction = useSpeakerConfigStore((state) => state.togglePostApplyTopologyAction);

  // Amp actions for post-apply operations
  const { muteOut, noiseGateOut, setTrimOut, setBridgePair, setAllBridgePairs, renameOutput } = useAmpActions();
  const selectedOutputChannels = selectedOutputChannelsByScope[scopeKey] ?? EMPTY_SELECTION;
  const outputAssignments = outputAssignmentsByScope[scopeKey] ?? EMPTY_ASSIGNMENTS;
  const channelGroups = channelGroupsByScope[scopeKey] ?? EMPTY_GROUPS;
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);

  const segments = useMemo(() => buildRowSegments(rowCount, channelGroups), [rowCount, channelGroups]);

  // Build the post-apply policy from store state
  const applyPolicy = useMemo<SpeakerApplyPolicy>(
    () => ({
      enabled: postApplyEnabled,
      channelActions: {
        enabled: postApplyEnabled && postApplyChannelActions.length > 0,
        actions: postApplyChannelActions
      },
      topologyActions: {
        enabled: postApplyEnabled && postApplyTopologyActions.length > 0,
        actions: postApplyTopologyActions
      },
      behavior: {
        failureMode: "continue-and-report"
      }
    }),
    [postApplyEnabled, postApplyChannelActions, postApplyTopologyActions]
  );

  useEffect(() => {
    if (libraryHasLoaded) return;
    void loadLibrary();
  }, [libraryHasLoaded, loadLibrary]);

  useEffect(() => {
    if (!scope) {
      setHydratedScopeKey(null);
      return;
    }

    const key = scope.trim().toUpperCase();
    let cancelled = false;

    void (async () => {
      await hydrateScopeFromGlobalStore(scope);
      if (!cancelled) {
        setHydratedScopeKey(key);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, hydrateScopeFromGlobalStore]);

  useEffect(() => {
    if (!scope || hydratedScopeKey !== scopeKey) return;

    const timer = setTimeout(() => {
      void persistScopeToGlobalStore(scope);
    }, 250);

    return () => clearTimeout(timer);
  }, [
    scope,
    scopeKey,
    hydratedScopeKey,
    selectedOutputChannels,
    channelGroups,
    outputAssignments,
    persistScopeToGlobalStore
  ]);

  const buildRangeSelection = (from: number, to: number): number[] => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  };

  const deriveDraftFromProfile = (profile: LibraryFileEntry): SpeakerProfileDraft => {
    const ways =
      profile.ways.length > 0
        ? profile.ways.map((way) => ({ id: way.id, label: way.label, role: way.role }))
        : [{ id: "way-1", label: "Way 1", role: "custom" }];

    return {
      id: profile.id,
      brand: profile.brand,
      family: profile.family,
      model: profile.model,
      application: profile.application,
      notes: profile.notes,
      ways
    };
  };

  const deriveDraftForSegment = (segment: RowSegment): SpeakerProfileDraft => {
    const firstAssignment = outputAssignments[segment.channels[0]] as SpeakerOutputAssignment | undefined;

    if (!firstAssignment) {
      const defaultWays =
        segment.type === "join"
          ? segment.channels.map((_, index) => ({ id: `way-${index + 1}`, label: `Way ${index + 1}`, role: "custom" }))
          : [{ id: "way-1", label: "Way 1", role: "custom" }];

      return {
        brand: "",
        family: "",
        model: "",
        application: "",
        notes: "",
        ways: defaultWays
      };
    }

    const fromLibrary = libraryFiles.find((file) => file.id === firstAssignment.itemId);
    if (fromLibrary) {
      return deriveDraftFromProfile(fromLibrary);
    }

    const groupAssignments = segment.channels
      .map((ch) => outputAssignments[ch] as SpeakerOutputAssignment | undefined)
      .filter((entry): entry is SpeakerOutputAssignment => Boolean(entry))
      .sort((left, right) => left.wayIndex - right.wayIndex);

    const derivedWays =
      groupAssignments.length > 0
        ? groupAssignments.map((entry, index) => ({
            id: `way-${entry.wayIndex + 1}`,
            label: entry.wayLabel || `Way ${index + 1}`,
            role: "custom"
          }))
        : [{ id: "way-1", label: "Way 1", role: "custom" }];

    return {
      id: firstAssignment.itemId,
      brand: "",
      family: "",
      model: firstAssignment.model,
      application: "",
      notes: "",
      ways: derivedWays
    };
  };

  const getSegmentKey = (segment: RowSegment): string => `${scopeKey}:${segment.channels.join("-")}`;

  const openEditorForSegment = (segment: RowSegment) => {
    const segmentKey = getSegmentKey(segment);
    const cachedDraft = editorDraftBySegment[segmentKey];
    const draft = cachedDraft ?? deriveDraftForSegment(segment);

    // Determine whether this is editing an existing library profile.
    // If the segment's itemId resolves to a file in the library, treat it as an update.
    const firstAssignment = Object.values(outputAssignments).find(
      (a): a is SpeakerOutputAssignment => !!a && segment.channels.includes((a as SpeakerOutputAssignment).channel)
    );
    const existingFile = firstAssignment ? libraryFiles.find((f) => f.id === firstAssignment.itemId) : null;

    setEditorTargetChannel(segment.channels[0]);
    setEditorSegmentKey(segmentKey);
    setEditorDraft(draft);
    setEditorExistingId(existingFile?.id ?? null);
    setEditorOpen(true);
  };

  const buildDropSpan = (startChannel: number, wayCount: number) => {
    const count = Math.max(1, Math.round(wayCount));
    // Bridge-aware: if dropping a 1-way config on a bridged channel, expand to the full bridge pair
    if (count === 1) {
      const bridge = channelGroups.find((g) => g.type === "bridge" && g.channels.includes(startChannel));
      if (bridge) {
        return { channels: [...bridge.channels].sort((a, b) => a - b), valid: true };
      }
    }
    const end = startChannel + count - 1;
    const channels = Array.from({ length: count }, (_, index) => startChannel + index);
    return { channels, valid: end <= rowCount };
  };

  useEffect(() => {
    if (!activeDraggedItem || dragHoverChannel === null) {
      setPreviewChannels([]);
      setPreviewValid(true);
      return;
    }

    const span = buildDropSpan(dragHoverChannel, activeDraggedItem.wayCount);
    setPreviewChannels(span.channels);
    setPreviewValid(span.valid);
  }, [activeDraggedItem, dragHoverChannel, channelGroups, rowCount]);

  // Set of channels that are valid starting positions for the current drag item.
  // Used to highlight/dim channels before the user hovers a specific target.
  const possibleStartChannels = useMemo<Set<number>>(() => {
    if (!activeDraggedItem) return new Set();
    const wayCount = Math.max(1, Math.round(activeDraggedItem.wayCount));
    const result = new Set<number>();
    for (let ch = 1; ch <= rowCount; ch++) {
      // 1-way configs fit anywhere; multi-way need enough consecutive channels
      if (wayCount === 1 || ch + wayCount - 1 <= rowCount) {
        result.add(ch);
      }
    }
    return result;
  }, [activeDraggedItem, rowCount]);

  /** Expand a channel click to include all linked (joined/bridged) group members. */
  const expandToGroup = (channel: number): number[] => {
    const group = findGroupForChannel(channelGroups, channel);
    return group ? group.channels : [channel];
  };

  const handleChannelClick = (row: number, event: React.MouseEvent) => {
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const grouped = expandToGroup(row);

    if (event.shiftKey) {
      const anchor = lastClickedChannelRef.current ?? selectedOutputChannels[selectedOutputChannels.length - 1] ?? row;
      setOutputChannels(buildRangeSelection(anchor, row), scope);
      lastClickedChannelRef.current = row;
      return;
    }

    if (ctrlOrMeta) {
      const alreadySelected = grouped.every((ch) => selectedOutputChannels.includes(ch));
      const next = alreadySelected
        ? selectedOutputChannels.filter((ch) => !grouped.includes(ch))
        : [...new Set([...selectedOutputChannels, ...grouped])].sort((a, b) => a - b);
      setOutputChannels(next, scope);
      lastClickedChannelRef.current = row;
      return;
    }

    setOutputChannels(grouped, scope);
    lastClickedChannelRef.current = row;
  };

  /** Render a single physical output button */
  const renderOutputButton = (row: number) => {
    const selected = selectedOutputChannels.includes(row);
    const inPreview = previewChannels.includes(row);
    const isDragging = activeDraggedItem !== null;
    const isPossibleTarget = isDragging && possibleStartChannels.has(row);

    return (
      <button
        key={`out-${row}`}
        data-output-selector="true"
        data-output-drop-target="true"
        data-output-channel={row}
        data-output-max={rowCount}
        data-output-scope={scope ?? ""}
        type="button"
        onClick={(e) => handleChannelClick(row, e)}
        className={cn(
          "flex h-9 w-full items-center justify-center rounded-md border border-dashed px-2 transition-colors duration-200",
          inPreview && previewValid
            ? "border-amber-400/80 bg-amber-500/20 text-amber-200"
            : inPreview && !previewValid
              ? "border-destructive/80 bg-destructive/10 text-destructive"
              : isDragging && isPossibleTarget
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                : isDragging && !isPossibleTarget
                  ? "border-border/25 bg-background/10 text-muted-foreground/30"
                  : selected
                    ? "border-primary/70 bg-primary/15 text-primary"
                    : "border-border/50 bg-background/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
        )}
        aria-pressed={selected}
        title={
          selected
            ? `CH ${row} selected (Ctrl+Click add, Shift+Click range, Click single)`
            : `Select CH ${row} (Ctrl+Click add, Shift+Click range)`
        }
      >
        <span
          className={cn(
            "relative grid size-6 place-items-center rounded-full border transition-colors duration-200",
            inPreview && !previewValid
              ? "border-destructive/80 bg-destructive/15 text-destructive"
              : isDragging && isPossibleTarget
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                : isDragging && !isPossibleTarget
                  ? "border-border/20 text-muted-foreground/30"
                  : selected
                    ? "border-primary/70 bg-primary/20 text-primary"
                    : "border-border/60 text-muted-foreground"
          )}
        >
          <span className="pointer-events-none absolute inset-0 grid place-items-center translate-y-[0.5px] text-[11px] font-semibold leading-none tabular-nums">
            {row}
          </span>
        </span>
      </button>
    );
  };

  const applySegment = useCallback(
    (segment: RowSegment, linkedProfile: LibraryFileEntry) => {
      if (!scope || applying) return;

      // Build per-way apply mappings from the library profile.
      // For bridges: all bridge channels receive the single way's data.
      // For joins: each way maps to its corresponding channel.
      // For singles: way 0 → the single channel.
      const wayMappings: ApplyWayMapping[] = [];
      const wayCount = segment.type === "join" ? segment.channels.length : 1;

      if (segment.type === "bridge") {
        const wayData = linkedProfile.deviceData?.[0];
        if (wayData?.hex) {
          wayMappings.push({
            hex: wayData.hex,
            channels: segment.channels.map((ch) => ch - 1), // 1-based → 0-based
            wayLabel: linkedProfile.ways[0]?.label
          });
        }
      } else {
        for (let idx = 0; idx < wayCount; idx++) {
          const wayData = linkedProfile.deviceData?.[idx];
          const ch = segment.channels[idx];
          if (wayData?.hex && ch !== undefined) {
            wayMappings.push({
              hex: wayData.hex,
              channels: [ch - 1], // 1-based → 0-based
              wayLabel: linkedProfile.ways[idx]?.label
            });
          }
        }
      }

      if (wayMappings.length === 0) {
        toast.error(t.noPayload);
        return;
      }

      // Warn when the profile has fewer ways than the segment has channels (issue #2)
      const skippedWays = wayCount - wayMappings.length;
      if (skippedWays > 0) {
        toast.warning(
          t.waysSkippedTitle.replace("{count}", String(skippedWays)).replace("{s}", skippedWays === 1 ? "" : "s"),
          {
            description: t.waysSkippedDesc
              .replace("{ways}", skippedWays === 1 ? "that way" : "those ways")
              .replace("{applied}", String(wayMappings.length))
              .replace("{total}", String(wayCount))
              .replace("{s}", wayMappings.length === 1 ? "" : "s")
          }
        );
      }

      // Collect all 0-based channels that will be targeted
      const allAppliedChannels0Based = Array.from(new Set(wayMappings.flatMap((m) => m.channels))).sort(
        (a, b) => a - b
      );

      void (async () => {
        const toastId = `speaker-apply-${scope}-${segment.channels.join("-")}`;
        toast.loading(t.applyingTitle, {
          id: toastId,
          description: t.applyingPreparing
            .replace("{count}", String(wayMappings.length))
            .replace("{s}", wayMappings.length === 1 ? "" : "s")
        });

        const outcome = await applyToDevice({
          mac: scope,
          wayMappings,
          speakerName: linkedProfile.model,
          onProgress: (progress) => {
            const next = buildApplyProgressMessage(progress, t);
            toast.loading(next.title, { id: toastId, description: next.description });
          }
        });

        if (!outcome.ok) {
          const firstError = outcome.results.find((r) => !r.sent)?.error;
          toast.error(t.applyFailedTitle, {
            id: toastId,
            description: firstError ?? outcome.error ?? t.applyFailedFallback
          });
          return;
        }

        // Embed sync hash into output channel names after successful apply.
        // Wait for the poller to deliver fresh params (stale data would produce wrong hash).
        const wayLabelByChannel = new Map<number, string>(
          wayMappings.flatMap((m) => m.channels.map((ch) => [ch, m.wayLabel ?? ""]))
        );
        try {
          const freshParams = await waitForFreshChannelData(scope);
          if (freshParams?.channels) {
            for (const ch0 of allAppliedChannels0Based) {
              const chData = freshParams.channels[ch0];
              if (!chData) continue;
              const hash = computeSyncHashFromParsed(chData);
              const baseName = wayLabelByChannel.get(ch0) || extractBaseNameFromName(chData.outputName);
              const newName = embedHashInName(baseName, hash);
              await renameOutput(scope, ch0 as 0 | 1 | 2 | 3, newName);
            }
          }
        } catch {
          // Hash embedding is best-effort — don't fail the apply
        }

        // Payload apply succeeded — run post-apply actions if enabled
        const hasPostApplyActions =
          applyPolicy.enabled &&
          ((applyPolicy.channelActions.enabled && applyPolicy.channelActions.actions.length > 0) ||
            (applyPolicy.topologyActions.enabled && applyPolicy.topologyActions.actions.length > 0));

        if (hasPostApplyActions) {
          toast.loading(t.runningPostApply, {
            id: toastId,
            description: t.runningPostApplyDesc
          });
        }

        // Compute bridgePairsToEnable for adjustBridgeMode
        // Each bridge group in channelGroups with 2 channels means that pair should be bridged
        const totalOutputChannels = rowCount;
        const bridgePairsToEnable = channelGroups
          .filter((g) => g.type === "bridge" && g.channels.length === 2)
          .map((g) => Math.floor((Math.min(...g.channels) - 1) / 2));

        const postApplyContext: PostApplyContext = {
          mac: scope,
          segmentType: segment.type,
          segmentChannels1Based: segment.channels,
          appliedTargets0Based: allAppliedChannels0Based,
          totalOutputChannels,
          bridgePairsToEnable
        };

        const postApplyResult = await runPostApplyActions(applyPolicy, postApplyContext, {
          muteOut,
          noiseGateOut,
          setTrimOut,
          setBridgePair,
          setAllBridgePairs
        });

        // Build final status message
        const totalTargets = outcome.results.reduce((sum, r) => sum + r.channels.length, 0);
        const postApplyOk = !postApplyResult || postApplyResult.failed === 0;
        const postApplySummary = postApplyResult ? formatPostApplyResultSummary(postApplyResult) : null;

        const baseDescription = `Applied to ${totalTargets} output${totalTargets === 1 ? "" : "s"}`;

        if (postApplyOk) {
          toast.success(t.applySuccessTitle, {
            id: toastId,
            description: postApplySummary ? `${baseDescription}. ${postApplySummary}` : baseDescription
          });
        } else {
          toast.warning(t.applyWarningTitle, {
            id: toastId,
            description: postApplySummary ?? "Some post-apply actions failed"
          });
        }
      })();
    },
    [
      scope,
      applying,
      applyToDevice,
      applyPolicy,
      muteOut,
      noiseGateOut,
      setTrimOut,
      setBridgePair,
      setAllBridgePairs,
      renameOutput
    ]
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-md border border-border/50 bg-background/30 p-4"
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-output-selector="true"]') || target.closest('[data-speaker-editor-trigger="true"]')) {
          return;
        }

        if (selectedOutputChannels.length > 0) {
          clearOutputChannels(scope);
          lastClickedChannelRef.current = null;
        }
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{dict.device.sectionTitle}</h3>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-muted/10 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            title={dict.device.clearAll ?? "Clear all"}
            onClick={() => {
              clearAllScope(scope);
              void persistScopeToGlobalStore(scope);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                  postApplyEnabled
                    ? "border-primary/30 bg-primary/5 text-primary hover:border-primary/60 hover:bg-primary/15"
                    : "border-border/40 bg-muted/10 text-muted-foreground hover:border-border/60 hover:bg-muted/20"
                )}
                title="Post-apply settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">{dict.device.postApplyTitle}</h4>
                  <p className="text-xs text-muted-foreground">{dict.device.postApplyDescription}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="post-apply-enabled"
                      checked={postApplyEnabled}
                      onCheckedChange={(checked) => setPostApplyEnabled(checked === true)}
                    />
                    <Label htmlFor="post-apply-enabled" className="text-sm font-medium">
                      {dict.device.postApplyEnable}
                    </Label>
                  </div>

                  <div className={cn("space-y-2 pl-1", !postApplyEnabled && "opacity-50 pointer-events-none")}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {dict.device.postApplyChannelActionsLabel}
                    </p>
                    <div className="space-y-2 pl-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="post-apply-unmute"
                          checked={postApplyChannelActions.includes("unmuteOut")}
                          onCheckedChange={() => togglePostApplyChannelAction("unmuteOut")}
                        />
                        <Label htmlFor="post-apply-unmute" className="text-sm">
                          {dict.device.postApplyUnmute}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="post-apply-gate"
                          checked={postApplyChannelActions.includes("disableNoiseGateOut")}
                          onCheckedChange={() => togglePostApplyChannelAction("disableNoiseGateOut")}
                        />
                        <Label htmlFor="post-apply-gate" className="text-sm">
                          {dict.device.postApplyNoiseGate}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="post-apply-trim"
                          checked={postApplyChannelActions.includes("resetTrimOut")}
                          onCheckedChange={() => togglePostApplyChannelAction("resetTrimOut")}
                        />
                        <Label htmlFor="post-apply-trim" className="text-sm">
                          {dict.device.postApplyTrim}
                        </Label>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-muted-foreground pt-2">
                      {dict.device.postApplyTopologyLabel}
                    </p>
                    <div className="space-y-2 pl-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="post-apply-bridge"
                          checked={postApplyTopologyActions.includes("adjustBridgeMode")}
                          onCheckedChange={() => togglePostApplyTopologyAction("adjustBridgeMode")}
                        />
                        <Label htmlFor="post-apply-bridge" className="text-sm">
                          {dict.device.postApplyBridge}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="rounded-md border border-border/50 bg-muted/10 p-2.5">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-0">
            {/* Column headers */}
            <div className="pr-3">
              <p className="mb-1.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground">
                {dict.device.colSpeakerModel}
              </p>
            </div>
            <div className="border-l border-border/35 px-3">
              <p className="mb-1.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground">
                {dict.device.colWaysDescription}
              </p>
            </div>
            <div className="border-l border-border/35 pl-3">
              <p className="mb-1.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground">
                {dict.device.colPhysicalOutputs}
              </p>
            </div>

            {/* Rows rendered per segment */}
            {segments.map((segment) => {
              const firstCh = segment.channels[0];
              const channelCount = segment.channels.length;
              const assignment = outputAssignments[firstCh];
              const wayCount = segment.type === "join" ? channelCount : segment.type === "bridge" ? 1 : 1;
              const linkIcon =
                segment.type === "join" ? (
                  <Link2 className="h-3 w-3 text-primary/60" />
                ) : segment.type === "bridge" ? (
                  <SplitSquareVertical className="h-3 w-3 text-primary/60" />
                ) : null;

              // Resolve the library profile to check for injectable deviceData
              const firstAssignment = assignment as SpeakerOutputAssignment | undefined;
              const linkedProfile = firstAssignment
                ? libraryFiles.find((f) => f.id === firstAssignment.itemId)
                : undefined;
              const hasDeviceData = linkedProfile?.deviceData?.some((d) => d?.hex) ?? false;

              return (
                <div key={`seg-${firstCh}`} className="col-span-3 grid grid-cols-subgrid">
                  {/* Speaker Model column — 1 row spanning the whole group */}
                  <div className="pr-3">
                    <div
                      className="flex w-full items-center gap-1"
                      style={{ height: `${channelCount * 2.25 + (channelCount - 1) * 0.375}rem` }}
                    >
                      <button
                        type="button"
                        data-speaker-editor-trigger="true"
                        onClick={() => openEditorForSegment(segment)}
                        className="flex h-full min-w-0 flex-1 items-center rounded-md border border-border/40 bg-muted/10 px-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                      >
                        <span className="truncate text-[13px] text-foreground/90">{assignment?.model || "-"}</span>
                      </button>
                      {hasDeviceData && (
                        <button
                          type="button"
                          onClick={() => linkedProfile && applySegment(segment, linkedProfile)}
                          disabled={applying}
                          className={cn(
                            "flex h-full w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                            applying
                              ? "cursor-wait border-border/30 bg-muted/5 text-muted-foreground/40"
                              : "border-primary/30 bg-primary/5 text-primary hover:border-primary/60 hover:bg-primary/15"
                          )}
                          title="Apply speaker config to device"
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* spacer matching the gap between segments */}
                    <div className="h-1.5" />
                  </div>

                  {/* Ways Description column */}
                  <div className="border-l border-border/35 px-3">
                    {segment.type === "bridge" ? (
                      <>
                        {/* Bridge: 1 way row spanning entire height */}
                        <button
                          type="button"
                          data-speaker-editor-trigger="true"
                          onClick={() => openEditorForSegment(segment)}
                          className="flex w-full items-center rounded-md border border-border/40 bg-muted/10 px-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                          style={{ height: `${channelCount * 2.25 + (channelCount - 1) * 0.375}rem` }}
                        >
                          <span className="text-[13px] text-muted-foreground">
                            {assignment?.wayLabel || `${wayCount}-way`}
                          </span>
                        </button>
                        <div className="h-1.5" />
                      </>
                    ) : segment.type === "join" ? (
                      <>
                        {/* Join: one row per way */}
                        <div className="space-y-1.5">
                          {segment.channels.map((ch, idx) => {
                            const chAssignment = outputAssignments[ch];
                            return (
                              <button
                                key={`ways-${ch}`}
                                type="button"
                                data-speaker-editor-trigger="true"
                                onClick={() => openEditorForSegment(segment)}
                                className="flex h-9 w-full items-center rounded-md border border-border/40 bg-muted/10 px-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                              >
                                <span className="text-[13px] text-muted-foreground">
                                  {chAssignment?.wayLabel || `Way ${idx + 1}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="h-1.5" />
                      </>
                    ) : (
                      <>
                        {/* Single channel: 1 way row */}
                        <button
                          type="button"
                          data-speaker-editor-trigger="true"
                          onClick={() => openEditorForSegment(segment)}
                          className="flex h-9 w-full items-center rounded-md border border-border/40 bg-muted/10 px-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
                        >
                          <span className="text-[13px] text-muted-foreground">{assignment?.wayLabel || "-"}</span>
                        </button>
                        <div className="h-1.5" />
                      </>
                    )}
                  </div>

                  {/* Physical Outputs column */}
                  <div className="border-l border-border/35 pl-3">
                    <div className="space-y-0">
                      {segment.channels.map((ch, idx) => (
                        <div key={`outgrp-${ch}`}>
                          {renderOutputButton(ch)}
                          {/* Link indicator between grouped channels */}
                          {idx < segment.channels.length - 1 && linkIcon && (
                            <div className="flex justify-center py-0.5">{linkIcon}</div>
                          )}
                          {/* Spacer after last channel in group */}
                          {idx === segment.channels.length - 1 && <div className="h-1.5" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SpeakerConfigEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initialDraft={editorDraft}
        saving={saving}
        existingId={editorExistingId ?? undefined}
        onChange={(draft) => {
          setEditorDraft(draft);
          if (editorSegmentKey) {
            setEditorDraftBySegment((prev) => ({ ...prev, [editorSegmentKey]: draft }));
          }
        }}
        onSave={(draft) => {
          if (!scope) return;

          // Guard: ensure all ways fall within the valid 0-based channel range (issue #2)
          const lastPhysCh = editorTargetChannel - 1 + (draft.ways.length - 1);
          if (lastPhysCh > 7) {
            toast.error(t.channelOutOfRangeTitle, {
              description: t.channelOutOfRangeDesc
                .replace("{count}", String(draft.ways.length))
                .replace("{s}", draft.ways.length === 1 ? "" : "s")
                .replace("{ch}", String(editorTargetChannel))
            });
            return;
          }

          // Map each way to its physical output channel (0-based for the API)
          const wayMappings: SaveWayMapping[] = draft.ways.map((way, idx) => ({
            label: way.label || `Way ${idx + 1}`,
            role: way.role || "custom",
            physicalChannel: editorTargetChannel - 1 + idx // 1-based → 0-based
          }));

          void (async () => {
            const toastId = `speaker-save-${scope}-${editorTargetChannel}`;
            toast.loading(t.savingTitle, {
              id: toastId,
              description: t.savingPreparing
                .replace("{count}", String(wayMappings.length))
                .replace("{s}", wayMappings.length === 1 ? "" : "s")
            });

            const outcome = await saveToLibrary({
              mac: scope,
              id: draft.id,
              existingId: editorExistingId ?? undefined,
              brand: draft.brand,
              family: draft.family,
              model: draft.model,
              application: draft.application,
              notes: draft.notes,
              wayMappings,
              onProgress: (progress) => {
                const next = buildSaveProgressMessage(progress, t);
                toast.loading(next.title, { id: toastId, description: next.description });
              }
            });

            if (!outcome.ok) {
              toast.error(t.saveFailedTitle, {
                id: toastId,
                description: outcome.error ?? t.saveFailedFallback
              });
              return;
            }

            // Commit the assignment only after the library file is confirmed saved.
            // Uses the server-side idSlug (not the raw draft.id) to guarantee the
            // foreign key resolves to an actual file.
            const committedId = outcome.savedId ?? draft.id ?? "speaker-profile";
            const displayModel =
              [draft.brand, draft.model].filter(Boolean).join(" ").trim() || committedId || "Speaker";
            assignItemToOutputs({
              startChannel: editorTargetChannel,
              maxChannels: rowCount,
              item: {
                id: committedId,
                model: displayModel,
                ways: draft.ways.map((w) => w.label).join(" & "),
                wayCount: Math.max(1, draft.ways.length)
              },
              scope
            });

            toast.success(t.saveSuccessTitle, {
              id: toastId,
              description: t.saveSuccessDesc
                .replace("{count}", String(wayMappings.length))
                .replace("{s}", wayMappings.length === 1 ? "" : "s")
            });
            setEditorOpen(false);
          })();
        }}
      />
    </section>
  );
}
