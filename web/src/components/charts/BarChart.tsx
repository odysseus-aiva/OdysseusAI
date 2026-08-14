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
        /* Axis ticks are data the reader compares against, so they take
           --fg-body: --fg-muted fails AA at this size. */
        <div
          className="num pointer-events-none absolute left-0 flex flex-col justify-between text-right"
          style={{
            top: padTop,
            bottom: padBottom,
            width: yAxisWidth - 4,
            fontSize: 'var(--text-overline)',
            color: 'var(--fg-body)',
          }}
          aria-hidden="true"
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
              className="chart__gridline"
              x1={0}
              y1={padTop + chartH * (1 - frac)}
              x2={vw}
              y2={padTop + chartH * (1 - frac)}
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
                      opacity={isHovered ? 1 : 0.78}
                      rx={2}
                      style={{ transition: 'opacity var(--duration-instant) ease' }}
                    />
                  );
                })}

                {i % labelEvery === 0 && (
                  <text
                    className="chart__tick"
                    x={x + barW / 2}
                    y={height - 3}
                    textAnchor="middle"
                  >
                    {label(point)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hovered !== null && totals[hovered] > 0 && (
          /* A tooltip genuinely floats, so it is one of the few things in this
             language that earns a shadow. The panel itself stays neutral —
             only the swatches carry series colour. */
          <div
            className="chart__tooltip"
            role="status"
            style={{
              left: tooltipX,
              top: -12 - series.length * 16,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="chart__tooltip-title">{label(points[hovered])}</span>
            {series.map((s) => {
              const value = points[hovered].values[s.key] ?? 0;
              if (value <= 0) return null;
              return (
                <span key={s.key} className="flex items-center gap-2">
                  <span className="chart__swatch" style={{ background: s.color }} />
                  <span style={{ color: 'var(--fg-body)' }}>{s.label}</span>
                  <span className="num ml-auto pl-3" style={{ color: 'var(--fg-ink)' }}>
                    {value}
                  </span>
                </span>
              );
            })}
            <span className="num" style={{ color: 'var(--fg-muted)' }}>
              {totals[hovered]} {unit} total
            </span>
          </div>
        )}

        {series.length > 1 && (
          <div className="chart__legend">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-2">
                <span className="chart__swatch" style={{ background: s.color }} />
                <span>{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
