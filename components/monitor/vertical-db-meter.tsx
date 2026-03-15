"use client";

import type { CSSProperties } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function VerticalDbMeter({
  value,
  dbTop,
  dbBottom,
  clip,
  width = 24,
  height = 220,
  fillDirection = "bottom-up",
  thresholdLines
}: {
  value: number | null;
  dbTop: number;
  dbBottom: number;
  clip?: boolean;
  width?: number;
  height?: number;
  fillDirection?: "bottom-up" | "top-down";
  thresholdLines?: { db: number; color: string; label?: string }[];
}) {
  const fill = value === null || value < dbBottom ? 0 : Math.min(1, (value - dbBottom) / (dbTop - dbBottom));

  const dbRange = dbTop - dbBottom;
  const fillAnchor = fillDirection === "top-down" ? "top-0" : "bottom-0";

  return (
    <div
      className="relative rounded-[min(var(--radius),8px)] overflow-hidden bg-muted/30 border border-border/60 flex-shrink-0"
      style={{ width, height }}
    >
      <div
        className={`absolute ${fillAnchor} left-0 right-0 ${clip ? "bg-destructive" : "bg-primary"}`}
        style={{ height: `${fill * 100}%` }}
      />

      {thresholdLines?.map(({ db, color, label }, idx) => {
        const pct = Math.min(1, Math.max(0, (db - dbBottom) / dbRange));
        if (db < dbBottom || db > dbTop) return null;

        const lineStyle: CSSProperties = {
          bottom: `calc(${pct * 100}% - 1px)`,
          height: 3,
          backgroundColor: color,
          opacity: 0.85
        };

        if (!label) {
          return <div key={idx} className="absolute left-0 right-0 pointer-events-none" style={lineStyle} />;
        }

        return (
          <Tooltip key={idx}>
            <TooltipTrigger asChild>
              <div
                className="absolute left-0 right-0 cursor-default"
                style={{
                  bottom: `calc(${pct * 100}% - 5px)`,
                  height: 10
                }}
              >
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: 3.5,
                    height: 3,
                    backgroundColor: color,
                    opacity: 0.85
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
