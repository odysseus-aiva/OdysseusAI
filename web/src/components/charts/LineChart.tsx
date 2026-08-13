'use client';

import { useRef, useState } from 'react';
import { EmptyChart } from './ChartCard';
import { formatMs, formatShortDate } from './format';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

export interface LinePoint {
  date: string;
  values: Record<string, number | null>;
}

/**
 * Multi-series line chart with an optional threshold marker.
 *
 * Used for latency trends, where the budget line matters as much as the curve.
 */
export function LineChart({
  points,
  series,
  height = 150,
  threshold,
  format = formatMs,
}: {
  points: LinePoint[];
  series: LineSeries[];
  height?: number;
  threshold?: { value: number; label: string };
  format?: (value: number | null) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltipX, setTooltipX] = useState(0);

  if (points.length === 0) return <EmptyChart height={height} />;

  const allValues = points.flatMap((p) =>
    series.map((s) => p.values[s.key]).filter((v): v is number => v != null),
  );
  if (allValues.length === 0) return <EmptyChart height={height} label="No latency samples in this period" />;

  const max = Math.max(...allValues, threshold?.value ?? 0) * 1.12;
  const vw = 800;
  const padTop = 10;
  const padBottom = 20;
  const chartH = height - padTop - padBottom;

  // A single sample has no line to draw, so anchor it in the middle.
  const xFor = (i: number) => (points.length === 1 ? vw / 2 : (i / (points.length - 1)) * vw);
  const yFor = (v: number) => padTop + chartH - (v / max) * chartH;

  const labelEvery = points.length <= 8 ? 1 : Math.ceil(points.length / 6);

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={0}
            y1={padTop + chartH * (1 - frac)}
            x2={vw}
            y2={padTop + chartH * (1 - frac)}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        {threshold && threshold.value <= max && (
          <>
            <line
              x1={0}
              y1={yFor(threshold.value)}
              x2={vw}
              y2={yFor(threshold.value)}
              stroke="var(--color-state-speaking)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
            <text
              x={vw - 4}
              y={yFor(threshold.value) - 5}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-state-speaking)"
              opacity={0.75}
              fontFamily="var(--font-mono-var, monospace)"
            >
              {threshold.label}
            </text>
          </>
        )}

        {series.map((s) => {
          const segment = points
            .map((p, i) => ({ i, v: p.values[s.key] }))
            .filter((d): d is { i: number; v: number } => d.v != null);
          if (segment.length === 0) return null;

          return (
            <g key={s.key}>
              {segment.length > 1 && (
                <polyline
                  points={segment.map((d) => `${xFor(d.i)},${yFor(d.v)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
              )}
              {segment.map((d) => (
                <circle
                  key={d.i}
                  cx={xFor(d.i)}
                  cy={yFor(d.v)}
                  r={hovered === d.i ? 4 : 2.5}
                  fill={s.color}
                  style={{ transition: 'r 90ms' }}
                />
              ))}
            </g>
          );
        })}

        {points.map((point, i) => (
          <g key={`${point.date}-${i}`}>
            <rect
              x={xFor(i) - vw / points.length / 2}
              y={padTop}
              width={vw / points.length}
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
                x={xFor(i)}
                y={height - 3}
                textAnchor="middle"
                fontSize={9}
                fill="rgba(255,255,255,0.26)"
                fontFamily="var(--font-mono-var, monospace)"
              >
                {formatShortDate(point.date)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hovered !== null && (
        <div
          className="pointer-events-none absolute z-10 flex flex-col gap-1 whitespace-nowrap rounded-[6px] px-2.5 py-2 text-[11.5px]"
          style={{
            left: tooltipX,
            top: -12 - series.length * 16,
            transform: 'translateX(-50%)',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border-strong)',
            color: 'var(--color-text)',
          }}
        >
          <span className="font-[600]">{formatShortDate(points[hovered].date)}</span>
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 6, height: 6, background: s.color }} />
              <span style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
              <span className="ml-auto pl-3 font-mono font-[600]">{format(points[hovered].values[s.key])}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: 7, height: 7, background: s.color }} />
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
