'use client';

import { EmptyChart } from './ChartCard';

export interface DonutSegment {
  label: string;
  count: number;
  color: string;
}

/** Donut with an inline legend. Used for outcome, sentiment and disconnect mixes. */
export function Donut({
  segments,
  centerLabel,
  size = 120,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  size?: number;
}) {
  const visible = segments.filter((s) => s.count > 0);
  const total = visible.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) return <EmptyChart height={size} />;

  const c = size / 2;
  const r = c - 16;
  const strokeW = 10;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = visible.map((seg) => {
    const dash = (seg.count / total) * circumference;
    const arc = { ...seg, dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeW} />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeW}
            strokeDasharray={`${Math.max(arc.dash - 1, 0)} ${circumference - arc.dash + 1}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${c} ${c})`}
            style={{ opacity: 0.88 }}
          />
        ))}
        <text
          x={c}
          y={c - 4}
          textAnchor="middle"
          fontSize={18}
          fontWeight={600}
          fill="var(--color-text)"
          fontFamily="var(--font-display, sans-serif)"
        >
          {total}
        </text>
        <text
          x={c}
          y={c + 13}
          textAnchor="middle"
          fontSize={8.5}
          fill="rgba(255,255,255,0.35)"
          fontFamily="var(--font-mono-var, monospace)"
          letterSpacing="0.08em"
        >
          {centerLabel.toUpperCase()}
        </text>
      </svg>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {visible.map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: color }} />
            <span className="truncate text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {label}
            </span>
            <span className="ml-auto flex items-baseline gap-1.5 pl-3">
              <span className="font-mono text-[12.5px] font-[600]" style={{ color: 'var(--color-text)' }}>
                {count}
              </span>
              <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
                {Math.round((count / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
