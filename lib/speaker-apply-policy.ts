/**
 * Post-apply policy system for speaker config application.
 *
 * After the speaker payload is written to the amp, this system executes
 * follow-up actions in two phases:
 *   1. Channel actions — per-channel operations like unmute, disable gate, reset trim
 *   2. Topology actions — structural operations like enabling bridge mode
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Actions that operate on individual applied channels. */
export type PostApplyChannelAction = "unmuteOut" | "disableNoiseGateOut" | "resetTrimOut";

/** Actions that affect amp topology/routing around the applied channels. */
export type PostApplyTopologyAction = "adjustBridgeMode";

/** How to handle failures during post-apply execution. */
export type FailureMode = "abort-on-first-error" | "continue-and-report";

/** Policy configuration for post-apply behavior. */
export interface SpeakerApplyPolicy {
  enabled: boolean;

  channelActions: {
    enabled: boolean;
    actions: PostApplyChannelAction[];
  };

  topologyActions: {
    enabled: boolean;
    actions: PostApplyTopologyAction[];
  };

  behavior: {
    failureMode: FailureMode;
  };
}

/** Context passed to the post-apply plan builder. */
export interface PostApplyContext {
  mac: string;
  segmentType: "single" | "join" | "bridge";
  /** 1-based channel numbers from the segment definition. */
  segmentChannels1Based: number[];
  /** 0-based channel numbers that were actually targeted by the payload apply. */
  appliedTargets0Based: number[];
  /**
   * For bridge mode adjustment: total number of output channels (e.g. 4),
   * and which bridge pairs (pair indices, e.g. 0 for [1,2], 1 for [3,4]) should be bridged after apply.
   */
  totalOutputChannels?: number;
  bridgePairsToEnable?: number[]; // e.g. [0] to bridge pair 0 ([1,2]), [1] for pair 1 ([3,4])
}

/** A single planned action ready for execution. */
export interface PlannedAction {
  id: string;
  phase: "channel" | "topology";
  label: string;
  run: () => Promise<void>;
}

/** Result of a single post-apply action execution. */
export interface PostApplyActionResult {
  id: string;
  phase: "channel" | "topology";
  ok: boolean;
  error?: string;
}

/** Full result of the post-apply pipeline. */
export interface PostApplyPipelineResult {
  attempted: number;
  succeeded: number;
  failed: number;
  results: PostApplyActionResult[];
}

/** Amp action functions needed by the post-apply executor. */
export interface PostApplyActionDeps {
  muteOut: (mac: string, channel: number, muted: boolean) => Promise<void>;
  noiseGateOut: (mac: string, channel: number, enabled: boolean) => Promise<void>;
  setTrimOut: (mac: string, channel: number, db: number) => Promise<void>;
  setBridgePair: (mac: string, pair: number, bridged: boolean) => Promise<void>;
  setAllBridgePairs: (mac: string, pairs: Array<{ pair: number; bridged: boolean }>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default post-apply policy — channel actions off by default, continue on failure. */
export const DEFAULT_SPEAKER_APPLY_POLICY: SpeakerApplyPolicy = {
  enabled: true,
  channelActions: {
    enabled: false,
    actions: []
  },
  topologyActions: {
    enabled: true,
    actions: ["adjustBridgeMode"]
  },
  behavior: {
    failureMode: "continue-and-report"
  }
};

/** Deterministic execution order for channel actions. */
const CHANNEL_ACTION_ORDER: PostApplyChannelAction[] = ["unmuteOut", "disableNoiseGateOut", "resetTrimOut"];

/** Default number of output channels if not provided. */
const DEFAULT_OUTPUT_CHANNELS = 4;

// ---------------------------------------------------------------------------
// Plan Builder
// ---------------------------------------------------------------------------

/**
 * Build a list of planned actions from the policy and context.
 * Actions are ordered: channel actions first (in deterministic order), then topology.
 */
export function buildPostApplyPlan(
  policy: SpeakerApplyPolicy,
  context: PostApplyContext,
  deps: PostApplyActionDeps
): PlannedAction[] {
  if (!policy.enabled) return [];

  const actions: PlannedAction[] = [];

  // Phase 1: Channel actions
  if (policy.channelActions.enabled && policy.channelActions.actions.length > 0) {
    // Sort requested actions by deterministic order
    const orderedChannelActions = CHANNEL_ACTION_ORDER.filter((a) => policy.channelActions.actions.includes(a));

    for (const action of orderedChannelActions) {
      for (const ch0 of context.appliedTargets0Based) {
        const ch1 = ch0 + 1;
        const id = `${action}-ch${ch1}`;

        switch (action) {
          case "unmuteOut":
            actions.push({
              id,
              phase: "channel",
              label: `Unmute CH ${ch1}`,
              run: () => deps.muteOut(context.mac, ch0, false)
            });
            break;

          case "disableNoiseGateOut":
            actions.push({
              id,
              phase: "channel",
              label: `Disable gate CH ${ch1}`,
              run: () => deps.noiseGateOut(context.mac, ch0, false)
            });
            break;

          case "resetTrimOut":
            actions.push({
              id,
              phase: "channel",
              label: `Reset trim CH ${ch1}`,
              run: () => deps.setTrimOut(context.mac, ch0, 0)
            });
            break;
        }
      }
    }
  }

  // Phase 2: Topology actions
  if (policy.topologyActions.enabled && policy.topologyActions.actions.length > 0) {
    for (const action of policy.topologyActions.actions) {
      switch (action) {
        case "adjustBridgeMode": {
          // Send all bridge pair reconciliations as a single multi-step packet
          const total = context.totalOutputChannels ?? DEFAULT_OUTPUT_CHANNELS;
          const pairs = Math.floor(total / 2);
          const toEnable = new Set(context.bridgePairsToEnable ?? []);
          const allPairs = Array.from({ length: pairs }, (_, pair) => ({
            pair,
            bridged: toEnable.has(pair)
          }));
          actions.push({
            id: `bridge-pairs-reconcile`,
            phase: "topology",
            label: `Reconcile bridge pairs (${pairs} pair${pairs !== 1 ? "s" : ""})`,
            run: () => deps.setAllBridgePairs(context.mac, allPairs)
          });
          break;
        }
      }
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute a list of planned actions sequentially.
 * Respects the failure mode from the policy.
 */
export async function executePostApplyPlan(
  plan: PlannedAction[],
  policy: SpeakerApplyPolicy
): Promise<PostApplyPipelineResult> {
  const results: PostApplyActionResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const action of plan) {
    try {
      await action.run();
      results.push({ id: action.id, phase: action.phase, ok: true });
      succeeded++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ id: action.id, phase: action.phase, ok: false, error });
      failed++;

      if (policy.behavior.failureMode === "abort-on-first-error") {
        break;
      }
    }
  }

  return {
    attempted: results.length,
    succeeded,
    failed,
    results
  };
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/**
 * Build and execute post-apply actions in one call.
 * Returns null if policy is disabled or no actions are planned.
 */
export async function runPostApplyActions(
  policy: SpeakerApplyPolicy,
  context: PostApplyContext,
  deps: PostApplyActionDeps
): Promise<PostApplyPipelineResult | null> {
  const plan = buildPostApplyPlan(policy, context, deps);
  if (plan.length === 0) return null;

  return executePostApplyPlan(plan, policy);
}

/** Human-readable labels for post-apply actions. */
const ACTION_LABELS: Record<string, string> = {
  unmuteOut: "Unmuted",
  disableNoiseGateOut: "Gate off",
  resetTrimOut: "Trim reset",
  "bridge-pair-on": "Bridge enabled",
  "bridge-pair-off": "Bridge disabled"
};

/**
 * Extract the action type from an action ID.
 * e.g. "unmuteOut-ch1" → "unmuteOut", "bridge-pair-0-on" → "bridge-pair-on"
 */
function extractActionType(id: string): string {
  if (id.startsWith("bridge-pair") && id.includes("-on")) return "bridge-pair-on";
  if (id.startsWith("bridge-pair") && id.includes("-off")) return "bridge-pair-off";
  const match = id.match(/^([a-zA-Z]+)-ch\d+$/);
  return match?.[1] ?? id;
}

/**
 * Format a human-readable summary of post-apply results for toast display.
 * Shows which specific actions were performed.
 */
export function formatPostApplyResultSummary(result: PostApplyPipelineResult): string {
  if (result.attempted === 0) {
    return "No post-apply actions";
  }

  // Group successful actions by type
  const successfulTypes = new Set<string>();
  const failedTypes = new Set<string>();

  for (const r of result.results) {
    const actionType = extractActionType(r.id);
    if (r.ok) {
      successfulTypes.add(actionType);
    } else {
      failedTypes.add(actionType);
    }
  }

  // Build friendly descriptions
  const successLabels = [...successfulTypes].map((type) => ACTION_LABELS[type] ?? type).join(", ");

  if (result.failed === 0) {
    return successLabels || `${result.succeeded} action${result.succeeded === 1 ? "" : "s"} completed`;
  }

  const failedLabels = [...failedTypes].map((type) => ACTION_LABELS[type] ?? type).join(", ");

  if (result.succeeded === 0) {
    return `Failed: ${failedLabels}`;
  }

  return `${successLabels} | Failed: ${failedLabels}`;
}
