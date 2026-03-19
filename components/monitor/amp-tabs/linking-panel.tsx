"use client";

import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import { useProjectStore } from "@/stores/ProjectStore";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LinkingGroupsDialog } from "@/components/dialogs/linking-groups-dialog";
import { Link2Icon } from "lucide-react";
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
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linking = getStoredAmpLinkConfig(byMac, mac);
  const linkDict = dict.dialogs.linkingGroups;
  const activeScopes = LINK_SCOPES.filter((scope) => linking.scopes[scope].groups.length > 0);
  const activeGroupCount = activeScopes.reduce((sum, scope) => sum + linking.scopes[scope].groups.length, 0);

  const maxGroupChannel = Object.values(linking.scopes)
    .flatMap((scope) => scope.groups)
    .flatMap((group) => group.channels)
    .reduce((max, channel) => Math.max(max, channel), -1);
  const effectiveChannelCount = Math.max(channelCount, maxGroupChannel + 1);
  const channelLabels = getChannelLabels(effectiveChannelCount);

  return (
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
        scope="volumeOut"
        groups={linking.scopes.volumeOut.groups}
        channelLabels={channelLabels}
        copy={{
          triggerLabel: linkDict.outputVolumeTrigger,
          title: linkDict.outputVolumeTitle,
          description: linkDict.outputVolumeDescription
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
  );
}
