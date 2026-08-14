'use client';

import { EmptyChart } from './ChartCard';

export interface DonutSegment {
  label: string;
  count: number;
  color: string;
}

export function Donut({
  segments,
  centerLabel,
  centerValue,
  size = 120,
  stacked = false,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue?: string;
  size?: number;
  stacked?: boolean;
}) {
  const visible = segments.filter((s) => s.count > 0);
  const total = visible.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) return <EmptyChart height={stacked ? 180 : size} />;

  const c = size / 2;
  const r = c - 14;
  const strokeW = stacked ? 11 : 10;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = visible.map((seg) => {
    const dash = (seg.count / total) * circumference;
    const arc = { ...seg, dash, offset };
    offset += dash;
    return arc;
  });

  const svgEl = (
    /* The ring is the data mark, so it keeps its colour. The centre readout is
       chrome sitting inside the plot: ink and grey, Inter throughout. The
       display face is licensed for the 48px voice headline alone, and a
       tracked-out uppercase caption is the marketing system. */
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={`${centerLabel}: ${centerValue ?? total}`}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={strokeW} />
      {arcs.map((arc) => (
        <circle
          key={arc.label}
          cx={c} cy={c} r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeW}
          strokeDasharray={`${Math.max(arc.dash - 1, 0)} ${circumference - arc.dash + 1}`}
          strokeDashoffset={-arc.offset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${c} ${c})`}
        />
      ))}
      <text
        x={c} y={c - 2}
        textAnchor="middle"
        fontSize={centerValue ? (centerValue.length > 4 ? 13 : 18) : stacked ? 20 : 22}
        fontWeight={500}
        letterSpacing="-0.01em"
        fill="var(--fg-ink)"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {centerValue ?? total}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">
        {centerLabel}
      </text>
    </svg>
  );

  const legend = (
    <>
      {visible.map(({ label, count, color }) => (
        <div key={label} className="flex min-w-0 items-center gap-2">
          <span className="chart__swatch" style={{ background: color }} />
          <span className="truncate text-[13px]" style={{ color: 'var(--fg-body)' }}>
            {label}
          </span>
          <span className="ml-auto flex flex-shrink-0 items-baseline gap-2 pl-3">
            <span className="num text-[13px]" style={{ color: 'var(--fg-ink)' }}>
              {count}
            </span>
            <span
              className="num text-[12px]"
              style={{ color: 'var(--fg-muted)', minWidth: 34, textAlign: 'right' }}
            >
              {Math.round((count / total) * 100)}%
            </span>
          </span>
        </div>
      ))}
    </>
  );

  if (stacked) {
    return (
      <div className="flex flex-col items-center gap-4">
        {svgEl}
        <div className="flex w-full flex-col gap-2">{legend}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      {svgEl}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">{legend}</div>
    </div>
  );
}
