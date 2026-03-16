"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { LinkGroup } from "@/lib/amp-action-linking";
import { normalizeLinkingGroups, validateLinkGroup, type LinkingGroup } from "@/lib/linking-validator";

function formatChannelList(channelLabels: string[], channels: number[]): string {
  return channels.map((channel) => channelLabels[channel] ?? String(channel)).join(" + ");
}

function toValidatorGroups(groups: LinkGroup[]): LinkingGroup[] {
  return groups.map((group) => ({ channels: group.channels }));
}

function toLinkGroups(channelLabels: string[], groups: LinkingGroup[]): LinkGroup[] {
  return groups.map((group, index) => ({
    id: `group-${index + 1}`,
    name: formatChannelList(channelLabels, group.channels),
    channels: group.channels as Array<0 | 1 | 2 | 3>
  }));
}

function getUsedChannels(groups: LinkGroup[]): Set<number> {
  return new Set(groups.flatMap((group) => group.channels));
}

function summarizeGroups(channelLabels: string[], groups: LinkGroup[], offLabel: string): string {
  if (groups.length === 0) return offLabel;
  return groups.map((group) => formatChannelList(channelLabels, group.channels)).join(" | ");
}

function normalizeInitialGroups(channelLabels: string[], groups: LinkGroup[]): LinkGroup[] {
  return toLinkGroups(channelLabels, normalizeLinkingGroups(channelLabels.length, toValidatorGroups(groups)));
}

export function LinkingGroupsDialog({
  triggerLabel,
  triggerDescription,
  triggerMode = "compact",
  title,
  description,
  currentGroupsLabel,
  buildGroupLabel,
  emptyText,
  helperText,
  clearAllLabel,
  addGroupLabel,
  cancelLabel,
  saveLabel,
  savingLabel,
  offLabel,
  selectedCountSuffix,
  validationMessages,
  channelLabels,
  value,
  onSave
}: {
  triggerLabel: string;
  triggerDescription?: string;
  triggerMode?: "compact" | "card";
  title: string;
  description: string;
  currentGroupsLabel: string;
  buildGroupLabel: string;
  emptyText: string;
  helperText: string;
  clearAllLabel: string;
  addGroupLabel: string;
  cancelLabel: string;
  saveLabel: string;
  savingLabel: string;
  offLabel: string;
  selectedCountSuffix: string;
  validationMessages: {
    alreadyLinked: string;
    tooFewChannels: string;
    channelOutOfRange: string;
    invalidLinkableCount: string;
    invalidLink: string;
  };
  channelLabels: string[];
  value: LinkGroup[];
  onSave: (groups: LinkGroup[]) => Promise<void>;
}) {
  const normalizedValue = useMemo(() => normalizeInitialGroups(channelLabels, value), [channelLabels, value]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftGroups, setDraftGroups] = useState<LinkGroup[]>(normalizedValue);
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const usedChannels = useMemo(() => getUsedChannels(draftGroups), [draftGroups]);

  const openDialog = (nextOpen: boolean) => {
    if (saving) return;
    if (nextOpen) {
      setDraftGroups(normalizedValue);
      setSelectedChannels([]);
    }
    setOpen(nextOpen);
  };

  const toggleChannelSelection = (channel: number) => {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel].sort((a, b) => a - b)
    );
  };

  const addGroup = () => {
    const result = validateLinkGroup({
      linkableCount: channelLabels.length,
      existingGroups: toValidatorGroups(draftGroups),
      channels: selectedChannels
    });

    if (!result.valid) {
      const message =
        result.reason === "already-linked"
          ? validationMessages.alreadyLinked
          : result.reason === "too-few-channels"
            ? validationMessages.tooFewChannels
            : result.reason === "channel-out-of-range" ||
                result.reason === "source-out-of-range" ||
                result.reason === "target-out-of-range"
              ? validationMessages.channelOutOfRange
              : result.reason === "invalid-linkable-count"
                ? validationMessages.invalidLinkableCount
                : validationMessages.invalidLink;
      toast.error(message);
      return;
    }

    setDraftGroups(toLinkGroups(channelLabels, result.nextGroups));
    setSelectedChannels([]);
  };

  const removeGroup = (groupId: string) => {
    setDraftGroups((current) => current.filter((group) => group.id !== groupId));
  };

  const clearAll = () => {
    setDraftGroups([]);
    setSelectedChannels([]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draftGroups);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const status = summarizeGroups(channelLabels, normalizedValue, offLabel);

  return (
    <>
      {triggerMode === "card" ? (
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full items-center justify-between gap-3 px-3 py-2 text-left whitespace-normal"
          onClick={() => openDialog(true)}
        >
          <span className="min-w-0 flex-1 text-sm font-medium leading-tight">{triggerLabel}</span>
          <span className="shrink-0 text-xs text-muted-foreground text-right">{status}</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => openDialog(true)}
        >
          {triggerLabel}: {status}
        </Button>
      )}

      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent className="sm:max-w-sm" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {currentGroupsLabel}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={clearAll}
                  disabled={saving || draftGroups.length === 0}
                >
                  {clearAllLabel}
                </Button>
              </div>

              {draftGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyText}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {draftGroups.map((group) => (
                    <Button
                      key={group.id}
                      type="button"
                      variant="destructive"
                      disabled={saving}
                      onClick={() => removeGroup(group.id)}
                      className="h-auto px-2 py-1"
                    >
                      {formatChannelList(channelLabels, group.channels)}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {buildGroupLabel}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {selectedChannels.length} {selectedCountSuffix}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {channelLabels.map((label, channel) => {
                  const selected = selectedChannels.includes(channel);
                  const occupied = usedChannels.has(channel);

                  return (
                    <Button
                      key={label}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      disabled={saving || occupied}
                      onClick={() => toggleChannelSelection(channel)}
                      className={`px-2 text-xs ${occupied ? "opacity-45" : ""}`}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{helperText}</p>
                <Button type="button" size="sm" disabled={saving || selectedChannels.length < 2} onClick={addGroup}>
                  {addGroupLabel}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => openDialog(false)} disabled={saving}>
              {cancelLabel}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? savingLabel : saveLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
