export type LinkChannel = 0 | 1 | 2 | 3;

export type LinkScope =
  | "muteIn"
  | "muteOut"
  | "volumeIn"
  | "noiseGateOut"
  | "polarityOut"
  | "trimOut"
  | "delayOut"
  | "inputEq"
  | "outputEq"
  | "limiters";

export interface LinkGroup {
  id: string;
  name: string;
  channels: LinkChannel[];
}

export interface LinkScopeConfig {
  enabled: boolean;
  groups: LinkGroup[];
}

export interface AmpLinkConfig {
  enabled: boolean;
  scopes: Record<LinkScope, LinkScopeConfig>;
}

export const LINK_SCOPES: LinkScope[] = [
  "muteIn",
  "muteOut",
  "volumeIn",
  "noiseGateOut",
  "polarityOut",
  "trimOut",
  "delayOut",
  "inputEq",
  "outputEq",
  "limiters"
];
export const PERSISTED_LINK_SCOPES: LinkScope[] = [
  "muteIn",
  "muteOut",
  "volumeIn",
  "noiseGateOut",
  "polarityOut",
  "trimOut",
  "delayOut",
  "inputEq",
  "outputEq"
];

function createDefaultScopeConfig(): LinkScopeConfig {
  return {
    enabled: false,
    groups: []
  };
}

export function createDefaultAmpLinkConfig(): AmpLinkConfig {
  return {
    enabled: false,
    scopes: {
      muteIn: createDefaultScopeConfig(),
      muteOut: createDefaultScopeConfig(),
      volumeIn: createDefaultScopeConfig(),
      noiseGateOut: createDefaultScopeConfig(),
      polarityOut: createDefaultScopeConfig(),
      trimOut: createDefaultScopeConfig(),
      delayOut: createDefaultScopeConfig(),
      inputEq: createDefaultScopeConfig(),
      outputEq: createDefaultScopeConfig(),
      limiters: createDefaultScopeConfig()
    }
  };
}

export const DEFAULT_AMP_LINK_CONFIG = createDefaultAmpLinkConfig();

function isLinkChannel(value: unknown): value is LinkChannel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function normalizeChannels(raw: unknown): LinkChannel[] {
  if (!Array.isArray(raw)) return [];

  return Array.from(new Set(raw.filter(isLinkChannel))).sort((left, right) => left - right) as LinkChannel[];
}

function normalizeGroup(raw: unknown, index: number): LinkGroup | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<LinkGroup>;
  const channels = normalizeChannels(candidate.channels);
  if (channels.length < 2) return null;

  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `group-${index + 1}`;
  const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : id;

  return {
    id,
    name,
    channels
  };
}

function normalizeScopeConfig(raw: unknown): LinkScopeConfig {
  if (!raw || typeof raw !== "object") {
    return createDefaultScopeConfig();
  }

  const candidate = raw as Partial<LinkScopeConfig>;
  const groups = Array.isArray(candidate.groups)
    ? candidate.groups
        .map((group, index) => normalizeGroup(group, index))
        .filter((group): group is LinkGroup => group !== null)
    : [];

  return {
    enabled: candidate.enabled === true || groups.length > 0,
    groups
  };
}

export function normalizeAmpLinkConfig(raw: unknown): AmpLinkConfig {
  const defaults = createDefaultAmpLinkConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const candidate = raw as Partial<AmpLinkConfig> &
    Partial<Record<LinkScope, unknown>> & {
      scopes?: Partial<Record<LinkScope, unknown>>;
    };
  const scopeSource = candidate.scopes && typeof candidate.scopes === "object" ? candidate.scopes : candidate;

  const scopes: Record<LinkScope, LinkScopeConfig> = {
    muteIn: normalizeScopeConfig(scopeSource.muteIn),
    muteOut: normalizeScopeConfig(scopeSource.muteOut),
    volumeIn: normalizeScopeConfig(scopeSource.volumeIn),
    noiseGateOut: normalizeScopeConfig(scopeSource.noiseGateOut),
    polarityOut: normalizeScopeConfig(scopeSource.polarityOut),
    trimOut: normalizeScopeConfig(scopeSource.trimOut),
    delayOut: normalizeScopeConfig(scopeSource.delayOut),
    inputEq: normalizeScopeConfig(scopeSource.inputEq),
    outputEq: normalizeScopeConfig(scopeSource.outputEq),
    limiters: normalizeScopeConfig(scopeSource.limiters)
  };

  return {
    enabled: LINK_SCOPES.some((scope) => scopes[scope].enabled),
    scopes
  };
}

export function serializeAmpLinkConfig(config: AmpLinkConfig): Record<string, unknown> {
  const normalized = normalizeAmpLinkConfig(config);
  const persistedScopes = Object.fromEntries(
    PERSISTED_LINK_SCOPES.flatMap((scope) => {
      const scopeConfig = normalized.scopes[scope];
      if (!scopeConfig.enabled || scopeConfig.groups.length === 0) {
        return [];
      }

      return [
        [
          scope,
          {
            groups: scopeConfig.groups.map((group) => ({
              channels: group.channels
            }))
          }
        ]
      ];
    })
  );

  return persistedScopes;
}

export function getLinkedChannels(config: AmpLinkConfig, scope: LinkScope, channel: LinkChannel): LinkChannel[] {
  if (!config.enabled) {
    return [channel];
  }

  const scopeConfig = config.scopes[scope];
  if (!scopeConfig?.enabled) {
    return [channel];
  }

  const matchingGroups = scopeConfig.groups.filter((group) => group.channels.includes(channel));
  if (matchingGroups.length === 0) {
    return [channel];
  }

  return Array.from(new Set(matchingGroups.flatMap((group) => group.channels))).sort(
    (left, right) => left - right
  ) as LinkChannel[];
}
