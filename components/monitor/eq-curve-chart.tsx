"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { EqBand } from "@/stores/AmpStore";
import { bandGainAt, computeEqCurve, EQ_BAND_SHORT_LABELS, EQ_FREQ_TICKS, formatFreq } from "@/lib/eq";
import { getEqFilterTypeCapabilities } from "@/lib/parse-channel-data";
import {
  CROSSOVER_FREQ_MAX_HZ,
  CROSSOVER_FREQ_MIN_HZ,
  EQ_BAND_GAIN_MAX_DB,
  EQ_BAND_GAIN_MIN_DB,
  EQ_BAND_Q_MAX,
  EQ_BAND_Q_MIN
} from "@/lib/constants";

type DragMode = "xy" | "x" | "y" | "qLeft" | "qRight";

type DragState = {
  pointerId: number;
  bandIdx: number;
  mode: DragMode;
  startClientX: number;
  startViewX: number;
  startViewY: number;
  startFreq: number;
  startGain: number;
  startQ: number;
};

interface EqCurveChartProps {
  bands: EqBand[];
  interactive?: boolean;
  onBandPreviewChange?: (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => void;
  onBandCommit?: (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * SVG-based parametric EQ frequency response chart.
 * Renders a filled curve with interactive band handles.
 * Uses CSS variables for theming — no hardcoded colors.
 */
export function EqCurveChart({
  bands,
  interactive = false,
  onBandPreviewChange,
  onBandCommit,
  onDragStart,
  onDragEnd
}: EqCurveChartProps) {
  const curveData = computeEqCurve(bands, 256);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const [hoverBand, setHoverBand] = useState<number | null>(null);
  const [lingerBand, setLingerBand] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const yMin = -20;
  const yMax = 20;
  const yStep = 4;

  // Use viewBox for responsiveness — the SVG scales to fill its container
  const W = 800;
  const H = 360;
  const pad = { top: 24, right: 20, bottom: 32, left: 48 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  const logMin = Math.log10(20);
  const logMax = Math.log10(20000);

  const xScale = (freq: number) => pad.left + ((Math.log10(Math.max(freq, 20)) - logMin) / (logMax - logMin)) * cw;
  const yScale = (db: number) => pad.top + ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * ch;
  const xToFreq = (x: number) => {
    const ratio = Math.max(0, Math.min(1, (x - pad.left) / cw));
    return 10 ** (logMin + ratio * (logMax - logMin));
  };
  const yToDb = (y: number) => {
    const ratio = Math.max(0, Math.min(1, (y - pad.top) / ch));
    return yMax - ratio * (yMax - yMin);
  };

  const toViewBoxPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H
    };
  };

  const toSvgRoot = (target: SVGElement): SVGSVGElement | null => {
    if (target instanceof SVGSVGElement) return target;
    return target.ownerSVGElement;
  };

  const clampFreq = (freq: number) => Math.max(CROSSOVER_FREQ_MIN_HZ, Math.min(CROSSOVER_FREQ_MAX_HZ, freq));
  const clampGain = (gain: number) => Math.max(EQ_BAND_GAIN_MIN_DB, Math.min(EQ_BAND_GAIN_MAX_DB, gain));
  const clampQ = (q: number) => Math.max(EQ_BAND_Q_MIN, Math.min(EQ_BAND_Q_MAX, q));

  const toRoundedFreq = (freq: number) => Math.round(clampFreq(freq));
  const toRoundedGain = (gain: number) => Math.round(clampGain(gain) * 10) / 10;
  const toRoundedQ = (q: number) => Math.round(clampQ(q) * 100) / 100;

  const emitPreview = (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => {
    if (!onBandPreviewChange) return;
    onBandPreviewChange(bandIdx, next);
  };

  const emitCommit = (bandIdx: number, next: Partial<Pick<EqBand, "freq" | "gain" | "q">>) => {
    if (!onBandCommit) return;
    onBandCommit(bandIdx, next);
  };

  const clearLingerTimer = () => {
    if (lingerTimerRef.current) {
      clearTimeout(lingerTimerRef.current);
      lingerTimerRef.current = null;
    }
  };

  const scheduleLingerFade = (bandIdx: number) => {
    clearLingerTimer();
    lingerTimerRef.current = setTimeout(() => {
      setLingerBand((prev) => (prev === bandIdx ? null : prev));
    }, 2000);
  };

  useEffect(() => {
    return () => {
      clearLingerTimer();
    };
  }, []);

  // Curve paths — use raw (unclamped) yScale for clipping to work correctly
  const yScaleRaw = (db: number) => pad.top + ((yMax - db) / (yMax - yMin)) * ch;

  const pathPoints = curveData.map((p) => `${xScale(p.freq)},${yScaleRaw(p.gain)}`);
  const linePath = `M${pathPoints.join("L")}`;
  const fillPath = `${linePath}L${xScale(20000)},${yScaleRaw(0)}L${xScale(20)},${yScaleRaw(0)}Z`;

  const focusBandIdx = activeBand ?? hoverBand ?? lingerBand;
  const localCurveData =
    focusBandIdx !== null
      ? curveData.map((p) => ({
          freq: p.freq,
          gain: bandGainAt(bands[focusBandIdx], p.freq, focusBandIdx)
        }))
      : null;
  const localPath = localCurveData
    ? `M${localCurveData.map((p) => `${xScale(p.freq)},${yScaleRaw(p.gain)}`).join("L")}`
    : null;

  const clipId = useId();
  // Band markers — positioned at each band's individual gain, not the summed curve
  const markers = bands.map((band, i) => {
    const baseCapabilities = getEqFilterTypeCapabilities(band.type);
    const isCrossoverBand = i === 0 || i === bands.length - 1;
    return {
      idx: i,
      x: xScale(band.freq),
      y: yScale(band.gain),
      freq: band.freq,
      q: band.q,
      label: EQ_BAND_SHORT_LABELS[i],
      capabilities: {
        ...baseCapabilities,
        supportsGain: isCrossoverBand ? false : baseCapabilities.supportsGain,
        supportsQ: isCrossoverBand ? false : baseCapabilities.supportsQ
      },
      bypass: band.bypass
    };
  });

  const beginDrag = (event: React.PointerEvent<SVGElement>, bandIdx: number, mode: DragMode) => {
    if (!interactive) return;
    const band = bands[bandIdx];
    if (!band || band.bypass) return;

    const capabilities = getEqFilterTypeCapabilities(band.type);
    if (mode === "y" && !capabilities.supportsGain) return;
    if ((mode === "qLeft" || mode === "qRight") && !capabilities.supportsQ) return;

    event.preventDefault();
    event.stopPropagation();

    const svg = toSvgRoot(event.currentTarget);
    if (!svg) return;
    const { x: startViewX, y: startViewY } = toViewBoxPoint(svg, event.clientX, event.clientY);

    clearLingerTimer();
    setLingerBand(bandIdx);
    setActiveBand(bandIdx);
    setHoverBand(bandIdx);
    onDragStart?.();
    dragRef.current = {
      pointerId: event.pointerId,
      bandIdx,
      mode,
      startClientX: event.clientX,
      startViewX,
      startViewY,
      startFreq: band.freq,
      startGain: band.gain,
      startQ: band.q
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const band = bands[drag.bandIdx];
    if (!band) return;
    const capabilities = getEqFilterTypeCapabilities(band.type);
    const { x, y } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);

    if (drag.mode === "xy") {
      const next: Partial<Pick<EqBand, "freq" | "gain" | "q">> = { freq: toRoundedFreq(xToFreq(x)) };
      if (capabilities.supportsGain) {
        next.gain = toRoundedGain(yToDb(y));
      }
      emitPreview(drag.bandIdx, next);
      return;
    }

    if (drag.mode === "x") {
      const deltaViewX = x - drag.startViewX;
      const freqRatio = 10 ** ((deltaViewX / cw) * (logMax - logMin));
      emitPreview(drag.bandIdx, { freq: toRoundedFreq(drag.startFreq * freqRatio) });
      return;
    }

    if (drag.mode === "y") {
      if (capabilities.supportsGain) {
        const deltaViewY = y - drag.startViewY;
        const gainDelta = (-deltaViewY * (yMax - yMin)) / ch;
        emitPreview(drag.bandIdx, { gain: toRoundedGain(drag.startGain + gainDelta) });
      }
      return;
    }

    const deltaX = event.clientX - drag.startClientX;
    const qDirection = drag.mode === "qLeft" ? 1 : -1;
    emitPreview(drag.bandIdx, { q: toRoundedQ(drag.startQ + qDirection * deltaX * 0.02) });
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const band = bands[drag.bandIdx];
    if (band) {
      const capabilities = getEqFilterTypeCapabilities(band.type);
      if (drag.mode === "xy") {
        const { x, y } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);
        const next: Partial<Pick<EqBand, "freq" | "gain" | "q">> = { freq: toRoundedFreq(xToFreq(x)) };
        if (capabilities.supportsGain) {
          next.gain = toRoundedGain(yToDb(y));
        }
        emitCommit(drag.bandIdx, next);
      } else if (drag.mode === "x") {
        const { x } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);
        const deltaViewX = x - drag.startViewX;
        const freqRatio = 10 ** ((deltaViewX / cw) * (logMax - logMin));
        emitCommit(drag.bandIdx, { freq: toRoundedFreq(drag.startFreq * freqRatio) });
      } else if (drag.mode === "y" && capabilities.supportsGain) {
        const { y } = toViewBoxPoint(event.currentTarget, event.clientX, event.clientY);
        const deltaViewY = y - drag.startViewY;
        const gainDelta = (-deltaViewY * (yMax - yMin)) / ch;
        emitCommit(drag.bandIdx, { gain: toRoundedGain(drag.startGain + gainDelta) });
      } else if ((drag.mode === "qLeft" || drag.mode === "qRight") && capabilities.supportsQ) {
        const deltaX = event.clientX - drag.startClientX;
        const qDirection = drag.mode === "qLeft" ? 1 : -1;
        emitCommit(drag.bandIdx, { q: toRoundedQ(drag.startQ + qDirection * deltaX * 0.02) });
      }
    }
    dragRef.current = null;
    clearLingerTimer();
    setLingerBand(drag.bandIdx);
    scheduleLingerFade(drag.bandIdx);
    setActiveBand(null);
    onDragEnd?.();
  };

  // Y ticks
  const yTicks: number[] = [];
  for (let db = yMin; db <= yMax; db += yStep) yTicks.push(db);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto rounded-md border border-border/40 bg-muted/30"
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!dragRef.current) {
          if (hoverBand !== null) {
            scheduleLingerFade(hoverBand);
          }
          setHoverBand(null);
        }
      }}
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
            className={db === 0 ? "stroke-border" : "stroke-border/80"}
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
            className="stroke-border/60"
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
      <text x={8} y={pad.top - 8} className="fill-muted-foreground" fontSize={10}>
        dB
      </text>
      <text x={W - pad.right} y={H - 4} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
        Hz
      </text>

      {/* Filled area under/above 0 dB */}
      <path d={fillPath} className="fill-primary/12" clipPath={`url(#${clipId})`} />
      {/* Curve line */}
      <path
        d={linePath}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        clipPath={`url(#${clipId})`}
      />
      {localPath ? (
        <path
          d={localPath}
          fill="none"
          className="stroke-amber-400/95"
          strokeWidth={1.5}
          strokeLinejoin="round"
          clipPath={`url(#${clipId})`}
        />
      ) : null}

      {/* Band markers — rounded shadcn-style operator with separate drag handles */}
      {markers.map((m, i) => {
        if (m.bypass) return null;
        const cx = Math.max(pad.left + 8, Math.min(W - pad.right - 8, m.x));
        const cy = Math.max(pad.top + 8, Math.min(H - pad.bottom - 8, m.y));
        const selected = activeBand === m.idx;
        const visible = selected || hoverBand === m.idx || lingerBand === m.idx;
        const qCanAdjust = m.capabilities.supportsQ;
        const gainCanAdjust = m.capabilities.supportsGain;
        const axisOffset = 14;
        const qFreqLeft = clampFreq(m.freq / Math.pow(2, 1 / Math.max(m.q, 0.1)));
        const qFreqRight = clampFreq(m.freq * Math.pow(2, 1 / Math.max(m.q, 0.1)));
        const qLeftX = xScale(qFreqLeft);
        const qRightX = xScale(qFreqRight);
        const qLeftY = yScale(bandGainAt(bands[m.idx], qFreqLeft, m.idx));
        const qRightY = yScale(bandGainAt(bands[m.idx], qFreqRight, m.idx));
        const handleBandMouseEnter = () => {
          clearLingerTimer();
          setLingerBand(m.idx);
          setHoverBand(m.idx);
        };

        if (!interactive) {
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={6} className="fill-background stroke-border" strokeWidth={1.25} />
              <circle cx={cx} cy={cy} r={2.5} className="fill-primary/80" />
            </g>
          );
        }

        return (
          <g
            key={i}
            className="select-none"
            onMouseEnter={handleBandMouseEnter}
            onMouseLeave={() => {
              if (!dragRef.current && activeBand !== m.idx && hoverBand === m.idx) {
                scheduleLingerFade(m.idx);
                setHoverBand(null);
              }
            }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={16}
              fill="transparent"
              pointerEvents="all"
              className="transition-opacity duration-200 ease-out"
              onMouseEnter={handleBandMouseEnter}
              onPointerDown={(e) => beginDrag(e, m.idx, "xy")}
              opacity={visible ? 1 : 0.35}
              style={{ outline: "none", cursor: gainCanAdjust ? "move" : "ew-resize" }}
            />
            <circle
              cx={cx}
              cy={cy}
              r={8}
              className="fill-background/90 stroke-border transition-colors duration-200 ease-out"
              strokeWidth={1.25}
              onPointerDown={(e) => beginDrag(e, m.idx, "xy")}
              onMouseEnter={handleBandMouseEnter}
              style={{ cursor: gainCanAdjust ? "move" : "ew-resize" }}
            />
            <circle
              cx={cx}
              cy={cy}
              r={3.5}
              className="fill-primary/85"
              onPointerDown={(e) => beginDrag(e, m.idx, "xy")}
              onMouseEnter={handleBandMouseEnter}
              opacity={visible ? 1 : 0.82}
              style={{ cursor: gainCanAdjust ? "move" : "ew-resize" }}
            />
            <g
              className="transition-opacity duration-200 ease-out"
              opacity={visible ? 1 : 0}
              style={{ pointerEvents: visible ? "auto" : "none" }}
            >
              <circle
                cx={cx - axisOffset}
                cy={cy}
                r={8}
                fill="transparent"
                pointerEvents="all"
                onPointerDown={(e) => beginDrag(e, m.idx, "x")}
                style={{ cursor: "ew-resize" }}
              />
              <circle
                cx={cx + axisOffset}
                cy={cy}
                r={8}
                fill="transparent"
                pointerEvents="all"
                onPointerDown={(e) => beginDrag(e, m.idx, "x")}
                style={{ cursor: "ew-resize" }}
              />
              <circle
                cx={cx - axisOffset}
                cy={cy}
                r={3}
                className="fill-background stroke-primary/80"
                strokeWidth={1}
                onPointerDown={(e) => beginDrag(e, m.idx, "x")}
                style={{ cursor: "ew-resize" }}
              />
              <circle
                cx={cx + axisOffset}
                cy={cy}
                r={3}
                className="fill-background stroke-primary/80"
                strokeWidth={1}
                onPointerDown={(e) => beginDrag(e, m.idx, "x")}
                style={{ cursor: "ew-resize" }}
              />
              <circle
                cx={cx}
                cy={cy - axisOffset}
                r={8}
                fill="transparent"
                pointerEvents="all"
                onPointerDown={(e) => beginDrag(e, m.idx, "y")}
                style={{ cursor: gainCanAdjust ? "ns-resize" : "not-allowed" }}
              />
              <circle
                cx={cx}
                cy={cy + axisOffset}
                r={8}
                fill="transparent"
                pointerEvents="all"
                onPointerDown={(e) => beginDrag(e, m.idx, "y")}
                style={{ cursor: gainCanAdjust ? "ns-resize" : "not-allowed" }}
              />
              <circle
                cx={cx}
                cy={cy - axisOffset}
                r={3}
                className={
                  gainCanAdjust ? "fill-background stroke-primary/80" : "fill-muted stroke-muted-foreground/50"
                }
                strokeWidth={1}
                onPointerDown={(e) => beginDrag(e, m.idx, "y")}
                style={{ cursor: gainCanAdjust ? "ns-resize" : "not-allowed" }}
              />
              <circle
                cx={cx}
                cy={cy + axisOffset}
                r={3}
                className={
                  gainCanAdjust ? "fill-background stroke-primary/80" : "fill-muted stroke-muted-foreground/50"
                }
                strokeWidth={1}
                onPointerDown={(e) => beginDrag(e, m.idx, "y")}
                style={{ cursor: gainCanAdjust ? "ns-resize" : "not-allowed" }}
              />
              {qCanAdjust && focusBandIdx === m.idx ? (
                <>
                  <line
                    x1={qLeftX}
                    y1={qLeftY}
                    x2={qRightX}
                    y2={qRightY}
                    className="stroke-amber-400/50"
                    strokeWidth={1}
                  />
                  <circle
                    cx={qLeftX}
                    cy={qLeftY}
                    r={8}
                    fill="transparent"
                    pointerEvents="all"
                    onMouseEnter={handleBandMouseEnter}
                    onPointerDown={(e) => beginDrag(e, m.idx, "qLeft")}
                    style={{ cursor: "ew-resize" }}
                  />
                  <circle
                    cx={qRightX}
                    cy={qRightY}
                    r={8}
                    fill="transparent"
                    pointerEvents="all"
                    onMouseEnter={handleBandMouseEnter}
                    onPointerDown={(e) => beginDrag(e, m.idx, "qRight")}
                    style={{ cursor: "ew-resize" }}
                  />
                  <circle
                    cx={qLeftX}
                    cy={qLeftY}
                    r={2.6}
                    className="fill-amber-400/95"
                    onMouseEnter={handleBandMouseEnter}
                    onPointerDown={(e) => beginDrag(e, m.idx, "qLeft")}
                    style={{ cursor: "ew-resize" }}
                  />
                  <circle
                    cx={qRightX}
                    cy={qRightY}
                    r={2.6}
                    className="fill-amber-400/95"
                    onMouseEnter={handleBandMouseEnter}
                    onPointerDown={(e) => beginDrag(e, m.idx, "qRight")}
                    style={{ cursor: "ew-resize" }}
                  />
                </>
              ) : null}
            </g>
            <text
              x={cx}
              y={cy + 22}
              textAnchor="middle"
              className="fill-muted-foreground transition-opacity duration-200 ease-out"
              opacity={visible ? 0 : 1}
              pointerEvents="none"
              fontSize={9}
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
