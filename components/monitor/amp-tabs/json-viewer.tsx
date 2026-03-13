"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

function JsonNode({ value, depth = 0 }: { value: JsonValue; depth?: number }) {
  const [open, setOpen] = useState(false);

  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-green-500" : "text-destructive"}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === "number") return <span className="text-foreground">{value}</span>;
  if (typeof value === "string") {
    return <span className="text-foreground">&quot;{value}&quot;</span>;
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as JsonValue[]).map((v, i) => [String(i), v] as [string, JsonValue])
    : Object.entries(value as { [k: string]: JsonValue });

  const preview = isArray ? `[${entries.length}]` : `{${entries.length}}`;
  const indent = depth * 12;

  return (
    <span>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
      >
        <span className="text-[10px] w-3 text-center">{open ? "▾" : "▸"}</span>
        <span className="text-foreground/60">{preview}</span>
      </button>
      {open && (
        <span className="block" style={{ paddingLeft: indent + 12 }}>
          {entries.map(([k, v]) => (
            <span key={k} className="block leading-5">
              {!isArray && <span className="text-foreground/70">&quot;{k}&quot;</span>}
              {!isArray && <span className="text-foreground/50">: </span>}
              <JsonNode value={v} depth={depth + 1} />
              <span className="text-foreground/30">,</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export function JsonTree({ label, value }: { label: string; value: JsonValue }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-border/60 bg-muted/40 text-[11px] font-mono">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors cursor-pointer"
      >
        <span className="text-muted-foreground text-[10px]">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-foreground/80">{label}</span>
        {!open && (
          <span className="text-muted-foreground ml-1">
            {Array.isArray(value) ? `[${(value as JsonValue[]).length}]` : "{…}"}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 overflow-x-auto">
          <JsonNode value={value} depth={0} />
        </div>
      )}
    </div>
  );
}

export function CopyJsonButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-7 gap-1.5 text-xs font-medium"
    >
      {copied ? (
        <>
          <span className="text-green-400">✓</span>
          Copied
        </>
      ) : (
        <>
          <span>⎘</span>
          Copy JSON
        </>
      )}
    </Button>
  );
}
