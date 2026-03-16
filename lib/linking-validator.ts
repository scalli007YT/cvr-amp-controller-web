export type LinkableIndex = number;

export interface LinkingGroup {
  channels: LinkableIndex[];
}

export type LinkValidationReason =
  | "ok"
  | "invalid-linkable-count"
  | "channel-out-of-range"
  | "too-few-channels"
  | "source-out-of-range"
  | "target-out-of-range"
  | "same-channel"
  | "already-linked";

export interface ValidateLinkGroupInput {
  linkableCount: number;
  existingGroups: LinkingGroup[];
  channels: LinkableIndex[];
}

export interface ValidateLinkInput {
  linkableCount: number;
  existingGroups: LinkingGroup[];
  source: LinkableIndex;
  target: LinkableIndex;
}

export interface LinkValidationResult {
  valid: boolean;
  reason: LinkValidationReason;
  normalizedGroups: LinkingGroup[];
  sourceGroup: LinkingGroup | null;
  targetGroup: LinkingGroup | null;
  nextGroups: LinkingGroup[];
}

export interface LinkGroupValidationResult {
  valid: boolean;
  reason: LinkValidationReason;
  normalizedGroups: LinkingGroup[];
  candidateChannels: LinkableIndex[];
  currentGroup: LinkingGroup | null;
  nextGroups: LinkingGroup[];
}

function isValidIndex(index: number, linkableCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < linkableCount;
}

function normalizeChannels(channels: number[], linkableCount: number): number[] {
  return Array.from(
    new Set(channels.filter((channel) => isValidIndex(channel, linkableCount)).map((channel) => Math.trunc(channel)))
  ).sort((left, right) => left - right);
}

function groupKey(channels: number[]): string {
  return channels.join("-");
}

function createAdjacency(linkableCount: number, groups: LinkingGroup[]): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();

  for (let index = 0; index < linkableCount; index += 1) {
    adjacency.set(index, new Set<number>());
  }

  for (const group of groups) {
    for (const left of group.channels) {
      const neighbors = adjacency.get(left);
      if (!neighbors) continue;

      for (const right of group.channels) {
        if (left === right) continue;
        neighbors.add(right);
      }
    }
  }

  return adjacency;
}

function collectConnectedGroup(start: number, adjacency: Map<number, Set<number>>, visited: Set<number>): number[] {
  const stack = [start];
  const collected: number[] = [];
  visited.add(start);

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;

    collected.push(current);
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      stack.push(neighbor);
    }
  }

  return collected.sort((left, right) => left - right);
}

export function normalizeLinkingGroups(linkableCount: number, existingGroups: LinkingGroup[]): LinkingGroup[] {
  if (!Number.isInteger(linkableCount) || linkableCount <= 0) {
    return [];
  }

  const sanitizedGroups = existingGroups
    .map((group) => ({ channels: normalizeChannels(group.channels, linkableCount) }))
    .filter((group) => group.channels.length >= 2);

  const adjacency = createAdjacency(linkableCount, sanitizedGroups);
  const visited = new Set<number>();
  const normalizedGroups: LinkingGroup[] = [];

  for (let index = 0; index < linkableCount; index += 1) {
    if (visited.has(index)) continue;
    const neighbors = adjacency.get(index);
    if (!neighbors || neighbors.size === 0) continue;

    const channels = collectConnectedGroup(index, adjacency, visited);
    if (channels.length >= 2) {
      normalizedGroups.push({ channels });
    }
  }

  return Array.from(new Map(normalizedGroups.map((group) => [groupKey(group.channels), group])).values()).sort(
    (left, right) => {
      return left.channels[0] - right.channels[0];
    }
  );
}

export function findLinkingGroup(groups: LinkingGroup[], channel: LinkableIndex): LinkingGroup | null {
  return groups.find((group) => group.channels.includes(channel)) ?? null;
}

export function validateLink(input: ValidateLinkInput): LinkValidationResult {
  const { linkableCount, existingGroups, source, target } = input;
  const normalizedGroups = normalizeLinkingGroups(linkableCount, existingGroups);

  const invalidBaseResult = {
    normalizedGroups,
    sourceGroup: null,
    targetGroup: null,
    nextGroups: normalizedGroups
  };

  if (!Number.isInteger(linkableCount) || linkableCount <= 0) {
    return {
      valid: false,
      reason: "invalid-linkable-count",
      ...invalidBaseResult
    };
  }

  if (!isValidIndex(source, linkableCount)) {
    return {
      valid: false,
      reason: "source-out-of-range",
      ...invalidBaseResult
    };
  }

  if (!isValidIndex(target, linkableCount)) {
    return {
      valid: false,
      reason: "target-out-of-range",
      ...invalidBaseResult
    };
  }

  if (source === target) {
    return {
      valid: false,
      reason: "same-channel",
      ...invalidBaseResult
    };
  }

  const sourceGroup = findLinkingGroup(normalizedGroups, source);
  const targetGroup = findLinkingGroup(normalizedGroups, target);

  if (sourceGroup && targetGroup && groupKey(sourceGroup.channels) === groupKey(targetGroup.channels)) {
    return {
      valid: false,
      reason: "already-linked",
      normalizedGroups,
      sourceGroup,
      targetGroup,
      nextGroups: normalizedGroups
    };
  }

  const nextGroups = normalizeLinkingGroups(linkableCount, [
    ...normalizedGroups,
    {
      channels: [source, target]
    }
  ]);

  return {
    valid: true,
    reason: "ok",
    normalizedGroups,
    sourceGroup,
    targetGroup,
    nextGroups
  };
}

export function validateLinkGroup(input: ValidateLinkGroupInput): LinkGroupValidationResult {
  const { linkableCount, existingGroups, channels } = input;
  const normalizedGroups = normalizeLinkingGroups(linkableCount, existingGroups);
  const invalidBaseResult = {
    normalizedGroups,
    candidateChannels: [] as LinkableIndex[],
    currentGroup: null,
    nextGroups: normalizedGroups
  };

  if (!Number.isInteger(linkableCount) || linkableCount <= 0) {
    return {
      valid: false,
      reason: "invalid-linkable-count",
      ...invalidBaseResult
    };
  }

  if (!Array.isArray(channels) || channels.some((channel) => !isValidIndex(channel, linkableCount))) {
    return {
      valid: false,
      reason: "channel-out-of-range",
      ...invalidBaseResult
    };
  }

  const candidateChannels = normalizeChannels(channels, linkableCount);
  if (candidateChannels.length < 2) {
    return {
      valid: false,
      reason: "too-few-channels",
      normalizedGroups,
      candidateChannels,
      currentGroup: null,
      nextGroups: normalizedGroups
    };
  }

  const firstGroup = findLinkingGroup(normalizedGroups, candidateChannels[0]);
  const currentGroup =
    firstGroup && candidateChannels.every((channel) => firstGroup.channels.includes(channel)) ? firstGroup : null;

  if (currentGroup) {
    return {
      valid: false,
      reason: "already-linked",
      normalizedGroups,
      candidateChannels,
      currentGroup,
      nextGroups: normalizedGroups
    };
  }

  const nextGroups = normalizeLinkingGroups(linkableCount, [
    ...normalizedGroups,
    {
      channels: candidateChannels
    }
  ]);

  return {
    valid: true,
    reason: "ok",
    normalizedGroups,
    candidateChannels,
    currentGroup: null,
    nextGroups
  };
}
