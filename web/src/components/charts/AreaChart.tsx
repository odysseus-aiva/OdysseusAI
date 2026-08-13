'use client';

import { useId, useRef, useState } from 'react';
import { EmptyChart } from './ChartCard';
import { formatShortDate } from './format';

export interface AreaSeries {
  key: string;
  label: string;
  color: string;
}

export interface AreaPoint {
  date: string;
  values: Record<string, number | null>;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const cpx = (p0.x + p1.x) / 2;
    d += ` C ${cpx} ${p0.y} ${cpx} ${p1.y} ${p1.x} ${p1.y}`;
  }
  return d;
}

export function AreaChart({
  points,
  series,
  height = 160,
  format = (v: number | null) => (v == null ? '—' : String(Math.round(v))),
}: {
  points: AreaPoint[];
  series: AreaSeries[];
  height?: number;
  format?: (v: number | null) => string;
}) {
  const uid = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltipX, setTooltipX] = useState(0);

  if (points.length === 0) return <EmptyChart height={height} />;

  const allValues = points.flatMap((p) =>
    series.map((s) => p.values[s.key]).filter((v): v is number => v != null),
  );
  if (allValues.length === 0) return <EmptyChart height={height} />;

  const vw = 800;
  const padTop = 12;
  const padBottom = 24;
  const chartH = height - padTop - padBottom;
  const max = Math.max(...allValues) * 1.15 || 1;

  const xFor = (i: number) =>
    points.length === 1 ? vw / 2 : (i / (points.length - 1)) * vw;
  const yFor = (v: number) => padTop + chartH - (v / max) * chartH;
  const labelEvery = points.length <= 7 ? 1 : Math.ceil(points.length / 6);
  const baseline = padTop + chartH;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${uid}-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={0} y1={padTop + chartH * (1 - frac)}
            x2={vw} y2={padTop + chartH * (1 - frac)}
            stroke="rgba(255,255,255,0.035)"
            strokeWidth={1}
          />
        ))}

        {hovered !== null && (
          <line
            x1={xFor(hovered)} y1={padTop}
            x2={xFor(hovered)} y2={baseline}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {series.map((s) => {
          const validPts = points
            .map((p, i) => {
              const v = p.values[s.key];
              return v != null ? { x: xFor(i), y: yFor(v), i } : null;
            })
            .filter((d): d is { x: number; y: number; i: number } => d != null);

          if (validPts.length === 0) return null;

          const linePath = smoothPath(validPts);
          const areaPath =
            validPts.length > 1
              ? `${linePath} L ${validPts[validPts.length - 1].x} ${baseline} L ${validPts[0].x} ${baseline} Z`
              : '';
          const hoveredPt = hovered != null ? validPts.find((p) => p.i === hovered) : null;

          return (
            <g key={s.key}>
              {areaPath && (
                <path d={areaPath} fill={`url(#${uid}-grad-${s.key})`} stroke="none" />
              )}
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={0.9}
              />
              {hoveredPt && (
                <circle
                  cx={hoveredPt.x}
                  cy={hoveredPt.y}
                  r={4}
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {points.map((point, i) => {
          const cellW = vw / Math.max(points.length, 1);
          return (
            <g key={`${point.date}-${i}`}>
              <rect
                x={xFor(i) - cellW / 2}
                y={padTop}
                width={cellW}
                height={chartH}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => {
                  const svg = svgRef.current;
                  if (svg) setTooltipX((xFor(i) / vw) * svg.getBoundingClientRect().width);
                  setHovered(i);
                }}
                onMouseLeave={() => setHovered(null)}
              />
              {i % labelEvery === 0 && (
                <text
                  x={xFor(i)} y={height - 5}
                  textAnchor="middle" fontSize={9}
                  fill="rgba(255,255,255,0.24)"
                  fontFamily="var(--font-mono-var, monospace)"
                >
                  {formatShortDate(point.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered !== null && (
        <div
          className="pointer-events-none absolute z-10 flex flex-col gap-1 whitespace-nowrap rounded-[8px] px-3 py-2 text-[11.5px]"
          style={{
            left: tooltipX,
            top: 0,
            transform: tooltipX > 200 ? 'translateX(-100%)' : 'translateX(4px)',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border-strong)',
            boxShadow: '0 4px 16px rgb(0 0 0 / 0.28)',
            color: 'var(--color-text)',
          }}
        >
          <span className="font-[600]" style={{ color: 'var(--color-text-muted)' }}>
            {formatShortDate(points[hovered].date)}
          </span>
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="flex-shrink-0 rounded-full" style={{ width: 6, height: 6, background: s.color }} />
              <span style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
              <span className="ml-auto pl-4 font-mono font-[600]">
                {format(points[hovered].values[s.key])}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: s.color }} />
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
