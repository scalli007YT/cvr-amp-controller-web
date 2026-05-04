"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toSlug } from "@/lib/constants";
import { useI18n } from "@/components/layout/i18n-provider";

type SpeakerWayDraft = {
  id?: string;
  label: string;
  role?: string;
};

export interface SpeakerProfileDraft {
  id?: string;
  brand: string;
  family: string;
  model: string;
  application: string;
  notes: string;
  ways: SpeakerWayDraft[];
}

interface SpeakerConfigEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft: SpeakerProfileDraft;
  onChange: (draft: SpeakerProfileDraft) => void;
  /** Called when the user clicks "Save to Library". Receives the current draft. */
  onSave?: (draft: SpeakerProfileDraft) => void;
  /** When provided, the dialog is in "update" mode and shows "Update in Library" label. */
  existingId?: string;
  saving?: boolean;
}

function inferRole(index: number, total: number): string {
  if (total === 1) return "full";
  if (total === 2) return index === 0 ? "high" : "mid";
  if (total === 3) return ["high", "mid", "low"][index] ?? "custom";
  return "custom";
}

export function SpeakerConfigEditorDialog({
  open,
  onOpenChange,
  initialDraft,
  onChange,
  onSave,
  existingId,
  saving = false
}: SpeakerConfigEditorDialogProps) {
  const dict = useI18n().dialogs.speakerConfig.editor;
  const [fixedId, setFixedId] = useState("");
  const [brand, setBrand] = useState("");
  const [family, setFamily] = useState("");
  const [model, setModel] = useState("");
  const [application, setApplication] = useState("");
  const [notes, setNotes] = useState("");
  const [ways, setWays] = useState<string[]>(["Way 1"]);

  // Always-current ref so the open effect can read initialDraft without depending on it.
  const initialDraftRef = useRef(initialDraft);
  initialDraftRef.current = initialDraft;

  // Only re-initialize when the dialog transitions to open, not on every initialDraft change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const draft = initialDraftRef.current;
    setFixedId(draft.id ?? "");
    setBrand(draft.brand ?? "");
    setFamily(draft.family ?? "");
    setModel(draft.model ?? "");
    setApplication(draft.application ?? "");
    setNotes(draft.notes ?? "");
    const nextWays = draft.ways.map((way, index) => way.label?.trim() || `Way ${index + 1}`);
    setWays(nextWays.length > 0 ? nextWays : ["Way 1"]);
  }, [open]);

  const autoId = useMemo(() => {
    const parts = [brand, family, model].map(toSlug).filter(Boolean);
    return parts.length > 0 ? parts.join("-") : "speaker-profile";
  }, [brand, family, model]);

  // Use the fixed ID when it exists, otherwise fall back to the auto-derived slug.
  const effectiveId = fixedId || autoId;

  const notify = (partial: {
    brand?: string;
    family?: string;
    model?: string;
    application?: string;
    notes?: string;
    ways?: string[];
  }) => {
    const b = partial.brand ?? brand;
    const f = partial.family ?? family;
    const m = partial.model ?? model;
    const a = partial.application ?? application;
    const n = partial.notes ?? notes;
    const w = partial.ways ?? ways;

    const resolvedId = fixedId || [b, f, m].map(toSlug).filter(Boolean).join("-") || "speaker-profile";
    const resolvedWays = w.map((label, index) => {
      const trimmed = label.trim() || `Way ${index + 1}`;
      return { id: toSlug(trimmed) || `way-${index + 1}`, label: trimmed, role: inferRole(index, w.length) };
    });

    onChange({ id: resolvedId, brand: b, family: f, model: m, application: a, notes: n, ways: resolvedWays });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{dict.title}</DialogTitle>
          <DialogDescription>{dict.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1 md:grid-cols-[1.25fr_1fr]">
          <section className="rounded-md border border-border/50 bg-muted/10 p-4">
            <div className="grid gap-3">
              <div className="grid grid-cols-[132px_1fr] items-center gap-3">
                <Label htmlFor="speaker-brand">{dict.brandLabel}</Label>
                <Input
                  id="speaker-brand"
                  value={brand}
                  onChange={(event) => {
                    setBrand(event.target.value);
                    notify({ brand: event.target.value });
                  }}
                />
              </div>

              <div className="grid grid-cols-[132px_1fr] items-center gap-3">
                <Label htmlFor="speaker-family">{dict.familyLabel}</Label>
                <Input
                  id="speaker-family"
                  value={family}
                  onChange={(event) => {
                    setFamily(event.target.value);
                    notify({ family: event.target.value });
                  }}
                />
              </div>

              <div className="grid grid-cols-[132px_1fr] items-center gap-3">
                <Label htmlFor="speaker-model">{dict.modelLabel}</Label>
                <Input
                  id="speaker-model"
                  value={model}
                  onChange={(event) => {
                    setModel(event.target.value);
                    notify({ model: event.target.value });
                  }}
                />
              </div>

              <div className="grid grid-cols-[132px_1fr] items-center gap-3">
                <Label htmlFor="speaker-application">{dict.applicationLabel}</Label>
                <Input
                  id="speaker-application"
                  value={application}
                  onChange={(event) => {
                    setApplication(event.target.value);
                    notify({ application: event.target.value });
                  }}
                />
              </div>

              <div className="grid grid-cols-[132px_1fr] items-start gap-3">
                <Label htmlFor="speaker-notes" className="pt-2">
                  {dict.notesLabel}
                </Label>
                <textarea
                  id="speaker-notes"
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    notify({ notes: event.target.value });
                  }}
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-border/50 bg-muted/10 p-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="speaker-profile-id">{dict.profileIdLabel}</Label>
                <Input id="speaker-profile-id" value={effectiveId} readOnly className="text-muted-foreground" />
              </div>

              <div className="grid gap-2 pt-1">
                <Label>{dict.wayNameLabel}</Label>
                <div className="grid gap-2">
                  {ways.map((label, index) => (
                    <div key={`way-label-${index}`} className="grid grid-cols-[64px_1fr] items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {dict.wayIndex.replace("{index}", String(index + 1))}
                      </span>
                      <Input
                        value={label}
                        onChange={(event) => {
                          const value = event.target.value;
                          const next = ways.map((entry, idx) => (idx === index ? value : entry));
                          setWays(next);
                          notify({ ways: next });
                        }}
                        placeholder={dict.wayIndex.replace("{index}", String(index + 1))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          {onSave && (
            <Button
              variant="default"
              className="gap-2"
              disabled={saving}
              onClick={() => {
                const resolvedId =
                  fixedId || [brand, family, model].map(toSlug).filter(Boolean).join("-") || "speaker-profile";
                const resolvedWays = ways.map((label, index) => {
                  const trimmed = label.trim() || `Way ${index + 1}`;
                  return {
                    id: toSlug(trimmed) || `way-${index + 1}`,
                    label: trimmed,
                    role: inferRole(index, ways.length)
                  };
                });
                onSave({ id: resolvedId, brand, family, model, application, notes, ways: resolvedWays });
              }}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? dict.saving : existingId ? dict.updateInLibrary : dict.saveToLibrary}
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline">{dict.close}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
