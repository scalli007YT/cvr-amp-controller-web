"use client";

import type { EqBand } from "@/stores/AmpStore";
import {
  computeEqCurve,
  curveGainAtBand,
  EQ_BAND_SHORT_LABELS,
  EQ_FREQ_TICKS,
  formatFreq,
} from "@/lib/eq";

/**
 * SVG-based parametric EQ frequency response chart.
 * Renders a filled curve with numbered band markers.
 * Uses CSS variables for theming — no hardcoded colors.
 */
export function EqCurveChart({ bands }: { bands: EqBand[] }) {
  const curveData = computeEqCurve(bands, 256);

  const yMin = -24;
  const yMax = 24;
  const yStep = 6;

  // Use viewBox for responsiveness — the SVG scales to fill its container
  const W = 800;
  const H = 360;
  const pad = { top: 24, right: 20, bottom: 32, left: 48 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const logMin = Math.log10(20);
  const logMax = Math.log10(20000);

  const xScale = (freq: number) =>
    pad.left +
    ((Math.log10(Math.max(freq, 20)) - logMin) / (logMax - logMin)) * cw;
  const yScale = (db: number) =>
    pad.top +
    ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * ch;

  // Curve paths — use raw (unclamped) yScale for clipping to work correctly
  const yScaleRaw = (db: number) =>
    pad.top + ((yMax - db) / (yMax - yMin)) * ch;

  const pathPoints = curveData.map(
    (p) => `${xScale(p.freq)},${yScaleRaw(p.gain)}`
  );
  const linePath = `M${pathPoints.join("L")}`;
  const fillPath = `${linePath}L${xScale(20000)},${yScaleRaw(0)}L${xScale(20)},${yScaleRaw(0)}Z`;

  const clipId = "eq-plot-clip";
  // Band markers
  const markers = bands.map((band, i) => ({
    x: xScale(band.freq),
    y: yScale(curveGainAtBand(bands, i)),
    label: EQ_BAND_SHORT_LABELS[i],
    bypass: band.bypass,
  }));

  // Y ticks
  const yTicks: number[] = [];
  for (let db = yMin; db <= yMax; db += yStep) yTicks.push(db);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto rounded-md border border-border/40 bg-muted/30"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={pad.left} y={pad.top} width={cw} height={ch} />
        </clipPath>
      </defs>
      {/* Horizontal grid lines */}
      {yTicks.map((db) => (
        <g key={`y${db}`}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={yScale(db)}
            y2={yScale(db)}
            className={db === 0 ? "stroke-border" : "stroke-border/30"}
            strokeWidth={db === 0 ? 1.5 : 0.5}
          />
          <text
            x={pad.left - 8}
            y={yScale(db)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {db}
          </text>
        </g>
      ))}
      {/* Vertical grid lines */}
      {EQ_FREQ_TICKS.map((f) => (
        <g key={`x${f}`}>
          <line
            x1={xScale(f)}
            x2={xScale(f)}
            y1={pad.top}
            y2={H - pad.bottom}
            className="stroke-border/30"
            strokeWidth={0.5}
          />
          <text
            x={xScale(f)}
            y={H - pad.bottom + 16}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {formatFreq(f)}
          </text>
        </g>
      ))}
      {/* Axis labels */}
      <text
        x={8}
        y={pad.top - 8}
        className="fill-muted-foreground"
        fontSize={10}
      >
        dB
      </text>
      <text
        x={W - pad.right}
        y={H - 4}
        textAnchor="end"
        className="fill-muted-foreground"
        fontSize={10}
      >
        Hz
      </text>

      {/* Filled area under/above 0 dB */}
      <path d={fillPath} className="fill-foreground/5" clipPath={`url(#${clipId})`} />
      {/* Curve line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-foreground/70"
        strokeWidth={2}
        strokeLinejoin="round"
        clipPath={`url(#${clipId})`}
      />

      {/* Band markers */}
      {markers.map((m, i) => {
        if (m.bypass) return null;
        const cx = Math.max(pad.left, Math.min(W - pad.right, m.x));
        const cy = Math.max(
          pad.top + 7,
          Math.min(H - pad.bottom - 7, m.y - 12)
        );
        return (
          <g key={i}>
            {/* Connector line */}
            <line
              x1={cx}
              x2={Math.max(pad.left, Math.min(W - pad.right, m.x))}
              y1={cy + 6}
              y2={Math.max(pad.top, Math.min(H - pad.bottom, m.y))}
              className="stroke-muted-foreground/30"
              strokeWidth={0.5}
            />
            {/* Circle */}
            <circle
              cx={cx}
              cy={cy}
              r={6}
              className="fill-background stroke-foreground/50"
              strokeWidth={1}
            />
            {/* Label */}
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground"
              fontSize={5}
              fontWeight="bold"
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
