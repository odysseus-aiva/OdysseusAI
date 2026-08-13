'use client';

import { useRef, useState } from 'react';
import { EmptyChart } from './ChartCard';
import { formatShortDate } from './format';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarPoint {
  /** ISO date (`YYYY-MM-DD`) or any short category label. */
  date: string;
  values: Record<string, number>;
}

/**
 * Stacked column chart over time with a hover tooltip.
 *
 * Replaces the two near-identical hand-rolled SVG charts that previously lived
 * inside the dashboard and analytics pages.
 */
export function BarChart({
  points,
  series,
  height = 130,
  unit = 'calls',
  formatDate = true,
  showYAxis = false,
  format = (v: number) => String(Math.round(v)),
}: {
  points: BarPoint[];
  series: BarSeries[];
  height?: number;
  unit?: string;
  /** Set false when `date` is already a display label rather than an ISO date. */
  formatDate?: boolean;
  showYAxis?: boolean;
  format?: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltipX, setTooltipX] = useState(0);

  if (points.length === 0) return <EmptyChart height={height} />;

  const totals = points.map((p) => series.reduce((sum, s) => sum + (p.values[s.key] ?? 0), 0));
  const max = Math.max(...totals, 1);

  const yAxisWidth = showYAxis ? 34 : 0;
  const yMid = max / 2;

  const vw = 800;
  const padTop = 8;
  const padBottom = 20;
  const chartH = height - padTop - padBottom;
  const labelEvery =
    points.length <= 8 ? 1 : points.length <= 16 ? 2 : points.length <= 31 ? 7 : Math.ceil(points.length / 8);

  const label = (p: BarPoint) => (formatDate ? formatShortDate(p.date) : p.date);

  return (
    <div className="relative select-none">
      {showYAxis && (
        <div
          className="pointer-events-none absolute left-0 flex flex-col justify-between text-right"
          style={{
            top: padTop,
            bottom: padBottom,
            width: yAxisWidth - 4,
            fontFamily: 'var(--font-mono-var, monospace)',
            fontSize: 9,
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <span>{format(max)}</span>
          <span>{format(yMid)}</span>
          <span>0</span>
        </div>
      )}
      <div style={{ marginLeft: yAxisWidth }}>
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

          {points.map((point, i) => {
            const colW = vw / points.length;
            const barW = Math.max(Math.floor(colW * 0.68), 2);
            const x = i * colW + Math.floor((colW - barW) / 2);
            const isHovered = hovered === i;

            let cursorY = padTop + chartH;

            return (
              <g key={`${point.date}-${i}`}>
                <rect
                  x={i * colW}
                  y={padTop}
                  width={colW}
                  height={chartH}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={() => {
                    const svg = svgRef.current;
                    if (svg) {
                      setTooltipX(((x + barW / 2) / vw) * svg.getBoundingClientRect().width);
                    }
                    setHovered(i);
                  }}
                  onMouseLeave={() => setHovered(null)}
                />

                {series.map((s) => {
                  const value = point.values[s.key] ?? 0;
                  if (value <= 0) return null;
                  const segH = (value / max) * chartH;
                  cursorY -= segH;
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={cursorY}
                      width={barW}
                      height={Math.max(segH, 1.5)}
                      fill={s.color}
                      opacity={isHovered ? 1 : 0.62}
                      rx={1.5}
                      style={{ transition: 'opacity 90ms' }}
                    />
                  );
                })}

                {i % labelEvery === 0 && (
                  <text
                    x={x + barW / 2}
                    y={height - 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(255,255,255,0.26)"
                    fontFamily="var(--font-mono-var, monospace)"
                  >
                    {label(point)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hovered !== null && totals[hovered] > 0 && (
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
            <span className="font-[600]">{label(points[hovered])}</span>
            {series.map((s) => {
              const value = points[hovered].values[s.key] ?? 0;
              if (value <= 0) return null;
              return (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="rounded-full" style={{ width: 6, height: 6, background: s.color }} />
                  <span style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
                  <span className="ml-auto pl-3 font-mono font-[600]">{value}</span>
                </span>
              );
            })}
            <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
              {totals[hovered]} {unit} total
            </span>
          </div>
        )}

        {series.length > 1 && (
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
        )}
      </div>
    </div>
  );
}
