'use client';

import { EmptyChart } from './ChartCard';
import { BAR_FILL, TRACK_FILL } from './format';

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
  /* Neutral ink, not accent: a stack of bars covers far more area than a line,
     and at this count an accent bar field would take over the page. Callers
     pass `row.color` only where the value is a genuine status. */
  barColor = BAR_FILL,
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
          {/* A category name is prose, not a numeral — mono is for figures. */}
          <span
            className="flex-shrink-0 truncate text-[13px]"
            style={{ color: 'var(--fg-body)', width: labelWidth }}
            title={row.label}
          >
            {row.label}
          </span>

          <div
            className="h-[6px] flex-1 overflow-hidden rounded-[2px]"
            style={{ background: TRACK_FILL }}
          >
            <div
              className="h-full w-full origin-left rounded-[2px]"
              style={{
                transform: `scaleX(${row.value / max})`,
                background: row.color ?? barColor,
                transition: 'transform var(--duration-slow) var(--ease-out)',
              }}
            />
          </div>

          {/* Tabular figures so the column edge stays straight; the value is
              ink, never tinted to match its bar. */}
          <span
            className="num flex-shrink-0 text-right text-[13px]"
            style={{ color: 'var(--fg-ink)', minWidth: 56 }}
          >
            {row.display ?? row.value}
          </span>

          {row.note && (
            <span
              className="num flex-shrink-0 text-right text-[12px]"
              style={{ color: 'var(--fg-muted)', minWidth: 52 }}
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
      <div className="flex h-[10px] overflow-hidden rounded-[3px]" style={{ background: TRACK_FILL }}>
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

      {/* The swatch is the legend's whole job — it is the one place a series
          colour is allowed to appear outside the plot. Everything else in the
          row is ink. Segments come from the ink ladder in `format.ts`, so a
          hairline keeps the lightest step visible against the card. */}
      <div className="flex flex-col gap-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span
              className="flex-shrink-0 rounded-[2px]"
              style={{
                width: 8,
                height: 8,
                background: seg.color,
                boxShadow: '0 0 0 1px var(--line-hairline)',
              }}
            />
            <span className="text-[13px]" style={{ color: 'var(--fg-body)' }}>
              {seg.label}
            </span>
            <span className="ml-auto flex items-baseline gap-2 pl-3">
              <span className="num text-[13px]" style={{ color: 'var(--fg-ink)' }}>
                {seg.display ?? seg.value}
              </span>
              <span
                className="num text-[12px]"
                style={{ color: 'var(--fg-muted)', minWidth: 34, textAlign: 'right' }}
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
