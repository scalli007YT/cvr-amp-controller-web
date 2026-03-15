export type SourceKey = "analog" | "dante" | "aes3" | "backup";

export interface SourceCapabilities {
  /** Raw line-mode value derived from machine/version name when possible. */
  lineMode: number | null;
  /** BASIC_INFO analog input count. */
  analogInputCount: number;
  /** BASIC_INFO digital input count. */
  digitalInputCount: number;
  /** BASIC_INFO output count. */
  outputCount: number;
  hasDante: boolean;
  hasAes3: boolean;
  hasBackup: boolean;
  enabledSources: SourceKey[];
}

/**
 * Mirrors the original C# Device_Info line-mode extraction from machine/version name.
 * Example machine string format: "42404B06-006118-DSP-2004".
 */
export function parseLineModeFromMachineName(machineName?: string): number | null {
  if (!machineName) return null;
  const name = machineName.trim();
  if (name.length <= 16) return null;

  const flowNum = name.slice(5, 6);
  const lineModeChar = flowNum === "0" ? name.slice(4, 5) : name.slice(3, 4);
  if (!/^[0-9]$/.test(lineModeChar)) return null;

  const parsed = Number.parseInt(lineModeChar, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value as number));
}

/**
 * Original line-mode source capability map:
 * 0/3: Analog only
 * 1/4/6: Analog + AES3 (+ Backup)
 * 2: Analog + Dante (+ Backup)
 * 5: Analog + Dante + AES3 (+ Backup)
 */
export function deriveSourceCapabilities(params: {
  machineName?: string;
  analogInputCount?: number;
  digitalInputCount?: number;
  outputCount?: number;
}): SourceCapabilities {
  const analogInputCount = clampCount(params.analogInputCount);
  const digitalInputCount = clampCount(params.digitalInputCount);
  const outputCount = clampCount(params.outputCount);

  const lineMode = parseLineModeFromMachineName(params.machineName);

  let hasDante = false;
  let hasAes3 = false;

  switch (lineMode) {
    case 0:
    case 3:
      hasDante = false;
      hasAes3 = false;
      break;
    case 1:
    case 4:
    case 6:
      hasDante = false;
      hasAes3 = true;
      break;
    case 2:
      hasDante = true;
      hasAes3 = false;
      break;
    case 5:
      hasDante = true;
      hasAes3 = true;
      break;
    default:
      // Fallback when line-mode is unknown: infer digital presence from BASIC_INFO.
      hasDante = digitalInputCount > 0;
      hasAes3 = digitalInputCount > 0;
      break;
  }

  const hasBackup = hasDante || hasAes3;
  const enabledSources: SourceKey[] = ["analog"];
  if (hasDante) enabledSources.push("dante");
  if (hasAes3) enabledSources.push("aes3");
  if (hasBackup) enabledSources.push("backup");

  return {
    lineMode,
    analogInputCount,
    digitalInputCount,
    outputCount,
    hasDante,
    hasAes3,
    hasBackup,
    enabledSources
  };
}

export function isSourceEnabled(capabilities: SourceCapabilities | undefined, source: SourceKey): boolean {
  if (!capabilities) return true;
  return capabilities.enabledSources.includes(source);
}
