"use client";

import { useState } from "react";
import type { ChannelParam } from "@/stores/AmpStore";
import type { SourceCapabilities } from "@/lib/source-capabilities";
import { isSourceEnabled } from "@/lib/source-capabilities";
import { useAmpActions } from "@/hooks/useAmpActions";
import {
  SOURCE_DELAY_MAX_MS,
  SOURCE_DELAY_MIN_MS,
  SOURCE_TRIM_MAX_DB,
  SOURCE_TRIM_MIN_DB
} from "@/lib/validation/amp-actions";
import { Button } from "@/components/ui/button";
import { CustomAlert } from "@/components/custom/custom-alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

type SourceKey = "analog" | "dante" | "aes3" | "backup";

const SOURCE_ORDER: SourceKey[] = ["analog", "dante", "aes3", "backup"];

const SOURCE_LABEL: Record<SourceKey, string> = {
  analog: "Analog",
  dante: "Dante",
  aes3: "AES3",
  backup: "Backup"
};

function normalizeSources(ch: ChannelParam) {
  const mapped = new Map(ch.sourceInputs.map((item) => [item.key, item]));
  return SOURCE_ORDER.map((key) => {
    const source = mapped.get(key);
    if (source) return source;

    return {
      key,
      type: SOURCE_LABEL[key],
      delay: 0,
      trim: 0,
      selected: false
    };
  });
}

export function SourceConfigDialog({
  channels,
  mac,
  capabilities
}: {
  channels: ChannelParam[];
  mac: string;
  capabilities?: SourceCapabilities;
}) {
  const { setSourceType, setSourceDelay, setSourceTrim, setAnalogType } = useAmpActions();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const sourceCodeByKey: Partial<Record<SourceKey, 0 | 1 | 2>> = {
    analog: 0,
    dante: 1,
    // Original source_type enum is 0=Analog, 1=Digital, 2=AES3.
    // On AES-only models, "Digital" maps to AES input path.
    aes3: capabilities?.hasDante ? 2 : 1
  };

  const sourceFamilyByKey: Partial<Record<SourceKey, 0 | 1 | 2>> = {
    analog: 0,
    dante: 1,
    aes3: 2
  };

  const isEditableSource = (key: SourceKey) => key !== "backup";

  const runWithPending = async (key: string, action: () => Promise<void>): Promise<boolean> => {
    setPendingKey(key);
    try {
      await action();
      return true;
    } catch {
      return false;
    } finally {
      setPendingKey((current) => (current === key ? null : current));
    }
  };

  const analogOptionCount = Math.max(1, Math.min(4, capabilities?.analogInputCount ?? 4));

  const getAnalogSelection = (sourceTypeLabel: string): string => {
    const match = /-(\d+)$/.exec(sourceTypeLabel);
    if (!match) return "1";
    const idx = Number.parseInt(match[1], 10);
    if (Number.isNaN(idx)) return "1";
    return String(Math.max(1, Math.min(analogOptionCount, idx)));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          Source
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Source</DialogTitle>
          <DialogDescription>Per channel source selection with delay and trim values.</DialogDescription>
        </DialogHeader>

        <CustomAlert
          tone="amber"
          title="Not Included In Device Presets"
          description="Source selection, delay, and trim shown here are not covered by the device preset store/recall flow in this app."
        />

        <div className="max-h-[70vh] overflow-auto p-3">
          <div className="mx-auto w-fit min-w-[860px] space-y-2">
            {channels.map((channel) => {
              const sources = normalizeSources(channel);

              return (
                <div key={channel.channel} className="grid grid-cols-[64px_repeat(4,190px)] gap-2">
                  <div className="flex items-center justify-center rounded-md border border-border/60 bg-muted/20 text-sm font-semibold text-muted-foreground">
                    CH{channel.channel + 1}
                  </div>

                  {sources.map((source) => {
                    const enabled = isSourceEnabled(capabilities, source.key);
                    const editable = enabled && isEditableSource(source.key);
                    const isBackup = source.key === "backup";
                    const isAnalog = source.key === "analog";
                    const modePending = pendingKey === `mode-${channel.channel}-${source.key}`;
                    const sourceCode = sourceCodeByKey[source.key];
                    const canActivateByCard = enabled && sourceCode !== undefined && !modePending;
                    const delayPending = pendingKey === `delay-${channel.channel}-${source.key}`;
                    const trimPending = pendingKey === `trim-${channel.channel}-${source.key}`;
                    const analogPending = pendingKey === `analog-${channel.channel}`;

                    return (
                      <div
                        key={`${channel.channel}-${source.key}`}
                        className={`rounded-md border p-2 transition-opacity ${
                          source.selected ? "border-primary/70 bg-primary/10" : "border-border/60 bg-background"
                        } ${enabled ? "opacity-100" : "opacity-45"} ${
                          canActivateByCard ? "cursor-pointer" : "cursor-default"
                        }`}
                        aria-disabled={!enabled}
                        role={canActivateByCard ? "button" : undefined}
                        tabIndex={canActivateByCard ? 0 : -1}
                        onClick={(e) => {
                          if (!canActivateByCard || source.selected) return;
                          if (sourceCode === undefined) return;
                          const target = e.target as HTMLElement;
                          if (target.closest("button,input,[role='option'],[role='listbox']")) return;
                          void runWithPending(`mode-${channel.channel}-${source.key}`, async () => {
                            await setSourceType(mac, channel.channel as 0 | 1 | 2 | 3, sourceCode);
                          });
                        }}
                        onKeyDown={(e) => {
                          if (!canActivateByCard || source.selected) return;
                          if (sourceCode === undefined) return;
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          void runWithPending(`mode-${channel.channel}-${source.key}`, async () => {
                            await setSourceType(mac, channel.channel as 0 | 1 | 2 | 3, sourceCode);
                          });
                        }}
                      >
                        {isAnalog ? (
                          <div className="mb-2 h-7">
                            <Select
                              value={getAnalogSelection(source.type)}
                              onValueChange={(next) => {
                                const parsed = Number.parseInt(next, 10);
                                if (Number.isNaN(parsed)) return;
                                void runWithPending(`analog-${channel.channel}`, async () => {
                                  await setAnalogType(mac, channel.channel as 0 | 1 | 2 | 3, Math.max(0, parsed - 1));
                                });
                              }}
                              disabled={!enabled || analogPending}
                            >
                              <SelectTrigger className="h-7 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: analogOptionCount }).map((_, idx) => (
                                  <SelectItem key={idx} value={String(idx + 1)}>
                                    Analog-{idx + 1}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="mb-2 h-7 flex items-center gap-2">
                            <span
                              className={`h-3 w-3 rounded-full border ${
                                source.selected
                                  ? enabled
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground bg-muted-foreground"
                                  : "border-muted-foreground/50"
                              }`}
                            />
                            <span className="text-xs font-semibold">{source.type}</span>
                            {!enabled && (
                              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                                Off
                              </span>
                            )}
                          </div>
                        )}

                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                            <span>Delay</span>
                            {isBackup ? (
                              <span className="font-medium text-muted-foreground">N/A</span>
                            ) : (
                              <Input
                                key={`delay-${channel.channel}-${source.key}-${source.delay}`}
                                type="number"
                                step="0.01"
                                disabled={!editable || delayPending}
                                defaultValue={String(source.delay)}
                                className="h-6 w-24 text-right text-[11px]"
                                onBlur={(e) => {
                                  const parsed = Number.parseFloat(e.target.value);
                                  if (Number.isNaN(parsed)) {
                                    e.target.value = String(source.delay);
                                    return;
                                  }
                                  const clamped = Math.max(SOURCE_DELAY_MIN_MS, Math.min(SOURCE_DELAY_MAX_MS, parsed));
                                  e.target.value = String(clamped);
                                  const sourceFamily = sourceFamilyByKey[source.key];
                                  if (sourceFamily === undefined) return;
                                  void (async () => {
                                    const ok = await runWithPending(
                                      `delay-${channel.channel}-${source.key}`,
                                      async () => {
                                        await setSourceDelay(
                                          mac,
                                          channel.channel as 0 | 1 | 2 | 3,
                                          sourceFamily,
                                          clamped,
                                          source.trim
                                        );
                                      }
                                    );
                                    if (!ok) {
                                      e.target.value = String(source.delay);
                                    }
                                  })();
                                }}
                              />
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1">
                            <span>Trim</span>
                            {isBackup ? (
                              <span className="font-medium text-muted-foreground">N/A</span>
                            ) : (
                              <Input
                                key={`trim-${channel.channel}-${source.key}-${source.trim}`}
                                type="number"
                                step="0.1"
                                disabled={!editable || trimPending}
                                defaultValue={String(source.trim)}
                                className="h-6 w-24 text-right text-[11px]"
                                onBlur={(e) => {
                                  const parsed = Number.parseFloat(e.target.value);
                                  if (Number.isNaN(parsed)) {
                                    e.target.value = String(source.trim);
                                    return;
                                  }
                                  const clamped = Math.max(SOURCE_TRIM_MIN_DB, Math.min(SOURCE_TRIM_MAX_DB, parsed));
                                  e.target.value = String(clamped);
                                  const sourceFamily = sourceFamilyByKey[source.key];
                                  if (sourceFamily === undefined) return;
                                  void (async () => {
                                    const ok = await runWithPending(
                                      `trim-${channel.channel}-${source.key}`,
                                      async () => {
                                        await setSourceTrim(
                                          mac,
                                          channel.channel as 0 | 1 | 2 | 3,
                                          sourceFamily,
                                          clamped,
                                          source.delay
                                        );
                                      }
                                    );
                                    if (!ok) {
                                      e.target.value = String(source.trim);
                                    }
                                  })();
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
