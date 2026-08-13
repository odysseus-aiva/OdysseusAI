'use client';

import type { ReactNode } from 'react';

/**
 * Titled surface for a single chart. Every analytics widget is wrapped in one
 * so titles, captions and sample-size notes stay visually consistent.
 */
export function ChartCard({
  title,
  sub,
  trailing,
  footnote,
  children,
}: {
  title: string;
  sub?: string;
  trailing?: ReactNode;
  /** Axis units, source, or sample size — keeps each chart self-describing. */
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col rounded-[12px] p-5"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[13.5px] font-[500] tracking-[-0.01em]"
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </p>
          {sub && (
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {sub}
            </p>
          )}
        </div>
        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>

      <div className="flex-1">{children}</div>

      {footnote && (
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-faint)' }}>
          {footnote}
        </p>
      )}
    </div>
  );
}

/**
 * Warning chip for statistics whose sample is too small to be meaningful.
 * Shown instead of silently presenting a single observation as a distribution.
 */
export function SampleBadge({ n, reliable, unit = 'turns' }: { n: number; reliable: boolean; unit?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[10.5px] font-[500] font-mono whitespace-nowrap"
      style={{
        background: reliable ? 'var(--color-glass)' : 'rgba(251,191,36,0.1)',
        border: `1px solid ${reliable ? 'var(--color-border)' : 'rgba(251,191,36,0.25)'}`,
        color: reliable ? 'var(--color-text-faint)' : 'var(--color-state-warning)',
      }}
    >
      n = {n} {unit}
      {!reliable && ' · low confidence'}
    </span>
  );
}

export function EmptyChart({ height = 80, label = 'No data for this period' }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
    </div>
  );
}
