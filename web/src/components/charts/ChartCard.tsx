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
    /* No shadow. The reference's apparent card glow decays within four image
       pixels and is absent from cleaner encodes of the same screen — it is WebP
       ringing, not elevation. A chart card separates with a hairline. */
    <div className="card flex flex-col">
      {/* Controls live top-right, which keeps the bottom edge clean and reuses
          this row instead of adding a footer strip. */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section__title">{title}</p>
          {sub && <p className="section__desc">{sub}</p>}
        </div>
        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>

      <div className="flex-1">{children}</div>

      {footnote && <p className="field__hint">{footnote}</p>}
    </div>
  );
}

/**
 * Sample-size note for statistics whose sample is too small to be meaningful.
 * Shown instead of silently presenting a single observation as a distribution.
 *
 * A reliable sample is a plain neutral badge; only the unreliable case is a
 * status, because only that one asks the reader to discount the number.
 */
export function SampleBadge({ n, reliable, unit = 'turns' }: { n: number; reliable: boolean; unit?: string }) {
  return (
    <span className={`status-pill num ${reliable ? 'status-pill--neutral' : 'status-pill--warning'}`}>
      n = {n} {unit}
      {!reliable && ' · low confidence'}
    </span>
  );
}

/**
 * Chart empty state. The plot height stays reserved so the card does not
 * collapse, and no axes or gridlines are drawn — furniture around no data reads
 * as a broken chart rather than an empty one.
 */
export function EmptyChart({ height = 80, label = 'No data for this period' }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <span className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </span>
    </div>
  );
}
