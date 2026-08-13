'use client';

import { EmptyChart } from './ChartCard';

export interface HBarRow {
  label: string;
  value: number;
  /** Right-aligned display value. Defaults to the raw number. */
  display?: string;
  /** Small dimmed note after the display value (e.g. a success rate). */
  note?: string;
  color?: string;
}

/**
 * Horizontal bars normalised to the largest row. Used for latency stages,
 * tool usage, turn-count histograms and latency distributions.
 */
export function HBarList({
  rows,
  labelWidth = 150,
  emptyLabel,
  barColor = 'rgba(56,232,255,0.55)',
}: {
  rows: HBarRow[];
  labelWidth?: number;
  emptyLabel?: string;
  barColor?: string;
}) {
  if (rows.length === 0) return <EmptyChart height={80} label={emptyLabel} />;

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span
            className="flex-shrink-0 truncate font-mono text-[12px]"
            style={{ color: 'var(--color-text-muted)', width: labelWidth }}
            title={row.label}
          >
            {row.label}
          </span>

          <div
            className="h-[6px] flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--color-border)' }}
          >
            <div
              className="h-full w-full origin-left rounded-full"
              style={{
                transform: `scaleX(${row.value / max})`,
                background: row.color ?? barColor,
                transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>

          <span
            className="flex-shrink-0 text-right font-mono text-[12px] font-[600]"
            style={{ color: row.color ?? 'var(--color-text)', minWidth: 56 }}
          >
            {row.display ?? row.value}
          </span>

          {row.note && (
            <span
              className="flex-shrink-0 text-right font-mono text-[10.5px]"
              style={{ color: 'var(--color-text-faint)', minWidth: 52 }}
            >
              {row.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export interface CompositionSegment {
  label: string;
  value: number;
  color: string;
  display?: string;
}

/**
 * Single stacked bar showing how a total decomposes, with a legend beneath.
 * Used for cost composition and the latency waterfall.
 */
export function CompositionBar({ segments }: { segments: CompositionSegment[] }) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  if (total <= 0) return <EmptyChart height={60} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[10px] overflow-hidden rounded-full" style={{ background: 'var(--color-border)' }}>
        {segments.map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.label}
              style={{
                width: `${(seg.value / total) * 100}%`,
                background: seg.color,
              }}
              title={`${seg.label}: ${seg.display ?? seg.value}`}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-col gap-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="flex-shrink-0 rounded-full" style={{ width: 7, height: 7, background: seg.color }} />
            <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {seg.label}
            </span>
            <span className="ml-auto flex items-baseline gap-2 pl-3">
              <span className="font-mono text-[12px] font-[600]" style={{ color: 'var(--color-text)' }}>
                {seg.display ?? seg.value}
              </span>
              <span
                className="font-mono text-[10.5px]"
                style={{ color: 'var(--color-text-faint)', minWidth: 34, textAlign: 'right' }}
              >
                {Math.round((seg.value / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
