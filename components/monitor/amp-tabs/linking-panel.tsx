"use client";

import { useState } from "react";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import { useProjectStore } from "@/stores/ProjectStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { LinkingGroupsDialog } from "@/components/dialogs/linking-groups-dialog";
import {
  LINK_SCOPES,
  normalizeAmpLinkConfig,
  type AmpLinkConfig,
  type LinkGroup,
  type LinkScope
} from "@/lib/amp-action-linking";
import { useI18n } from "@/components/layout/i18n-provider";
import { getChannelLabels } from "@/lib/channel-labels";

type LinkingCopy = {
  triggerLabel: string;
  title: string;
  description: string;
};

function withScopeGroups(linking: AmpLinkConfig, scope: LinkScope, groups: LinkGroup[]): AmpLinkConfig {
  const next = normalizeAmpLinkConfig({
    ...linking,
    scopes: {
      ...linking.scopes,
      [scope]: {
        enabled: groups.length > 0,
        groups
      }
    }
  });

  next.enabled = LINK_SCOPES.some((item) => next.scopes[item].enabled);
  return next;
}

function ScopeLinkingDialog({
  mac,
  scope,
  groups,
  copy,
  channelLabels
}: {
  mac: string;
  scope: LinkScope;
  groups: LinkGroup[];
  copy: LinkingCopy;
  channelLabels: string[];
}) {
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linking = getStoredAmpLinkConfig(byMac, mac);
  const { updateAmpLinking } = useProjectStore();
  const linkDict = dict.dialogs.linkingGroups;

  return (
    <LinkingGroupsDialog
      triggerLabel={copy.triggerLabel}
      triggerMode="card"
      title={copy.title}
      description={copy.description}
      currentGroupsLabel={linkDict.currentGroupsLabel}
      buildGroupLabel={linkDict.buildGroupLabel}
      emptyText={linkDict.emptyText}
      helperText={linkDict.helperText}
      clearAllLabel={linkDict.clearAllLabel}
      addGroupLabel={linkDict.addGroupLabel}
      cancelLabel={dict.dialogs.common.cancel}
      saveLabel={linkDict.saveLabel}
      savingLabel={dict.dialogs.common.saving}
      offLabel={linkDict.offLabel}
      selectedCountSuffix={linkDict.selectedCountSuffix}
      validationMessages={{
        alreadyLinked: linkDict.validation.alreadyLinked,
        tooFewChannels: linkDict.validation.tooFewChannels,
        channelOutOfRange: linkDict.validation.channelOutOfRange,
        invalidLinkableCount: linkDict.validation.invalidLinkableCount,
        invalidLink: linkDict.validation.invalidLink
      }}
      channelLabels={channelLabels}
      value={groups}
      onSave={(nextGroups) => updateAmpLinking(mac, withScopeGroups(linking, scope, nextGroups))}
    />
  );
}

export function LinkingPanel({ mac, channelCount }: { mac: string; channelCount: number }) {
  const [open, setOpen] = useState(false);
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linking = getStoredAmpLinkConfig(byMac, mac);
  const linkDict = dict.dialogs.linkingGroups;

  const maxGroupChannel = Object.values(linking.scopes)
    .flatMap((scope) => scope.groups)
    .flatMap((group) => group.channels)
    .reduce((max, channel) => Math.max(max, channel), -1);
  const effectiveChannelCount = Math.max(channelCount, maxGroupChannel + 1);
  const channelLabels = getChannelLabels(effectiveChannelCount);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="mb-6 h-auto w-full justify-between px-3 py-2 text-left"
        onClick={() => setOpen(true)}
      >
        <span>
          <span className="block text-sm font-medium">{linkDict.panelTitle}</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">{linkDict.panelDescription}</span>
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{linkDict.panelTitle}</DialogTitle>
            <DialogDescription>{linkDict.panelDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Input</p>
            <ScopeLinkingDialog
              mac={mac}
              scope="muteIn"
              groups={linking.scopes.muteIn.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.inputMuteTrigger,
                title: linkDict.inputMuteTitle,
                description: linkDict.inputMuteDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="volumeIn"
              groups={linking.scopes.volumeIn.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.inputVolumeTrigger,
                title: linkDict.inputVolumeTitle,
                description: linkDict.inputVolumeDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="inputEq"
              groups={linking.scopes.inputEq.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.inputEqTrigger,
                title: linkDict.inputEqTitle,
                description: linkDict.inputEqDescription
              }}
            />

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output</p>

            <ScopeLinkingDialog
              mac={mac}
              scope="muteOut"
              groups={linking.scopes.muteOut.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.outputMuteTrigger,
                title: linkDict.outputMuteTitle,
                description: linkDict.outputMuteDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="noiseGateOut"
              groups={linking.scopes.noiseGateOut.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.noiseGateTrigger,
                title: linkDict.noiseGateTitle,
                description: linkDict.noiseGateDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="polarityOut"
              groups={linking.scopes.polarityOut.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.polarityTrigger,
                title: linkDict.polarityTitle,
                description: linkDict.polarityDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="trimOut"
              groups={linking.scopes.trimOut.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.trimOutTrigger,
                title: linkDict.trimOutTitle,
                description: linkDict.trimOutDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="delayOut"
              groups={linking.scopes.delayOut.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.delayOutTrigger,
                title: linkDict.delayOutTitle,
                description: linkDict.delayOutDescription
              }}
            />

            <ScopeLinkingDialog
              mac={mac}
              scope="outputEq"
              groups={linking.scopes.outputEq.groups}
              channelLabels={channelLabels}
              copy={{
                triggerLabel: linkDict.outputEqTrigger,
                title: linkDict.outputEqTitle,
                description: linkDict.outputEqDescription
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
