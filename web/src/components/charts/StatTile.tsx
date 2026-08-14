'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { StatDelta } from '@/lib/api/calls';

/**
 * KPI tile with an optional period-over-period delta.
 *
 * `lowerIsBetter` decouples direction from sentiment: a rising error rate and a
 * rising engagement rate both go up, but only one of them is good news.
 */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  delta,
  lowerIsBetter = false,
  formatDelta,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  delta?: StatDelta | null;
  lowerIsBetter?: boolean;
  formatDelta?: (absolute: number) => string;
}) {
  return (
    /* Never tint the fill or the border by status: colour in a stat tile is
       confined to the delta arrow. `iconColor` is accepted for call-site
       compatibility and deliberately ignored — a coloured glyph in the corner
       of a metric is decoration, and the label already names the metric. */
    <div className="stat flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {/* Sentence case, not uppercase and tracked out: the tracked-out
            all-caps label belongs to the marketing system. */}
        <span className="stat__label">{label}</span>
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
      </div>

      <div>
        <div className="stat__value mt-0">{value}</div>
        <div className="stat__foot flex-wrap gap-x-2 gap-y-1">
          {sub && <span>{sub}</span>}
          {delta && <DeltaChip delta={delta} lowerIsBetter={lowerIsBetter} format={formatDelta} />}
        </div>
      </div>
    </div>
  );
}

function DeltaChip({
  delta,
  lowerIsBetter,
  format,
}: {
  delta: StatDelta;
  lowerIsBetter: boolean;
  format?: (absolute: number) => string;
}) {
  const { absolute } = delta;
  const flat = Math.abs(absolute) < 1e-9;
  const improved = lowerIsBetter ? absolute < 0 : absolute > 0;

  const Icon = flat ? Minus : absolute > 0 ? ArrowUpRight : ArrowDownRight;
  const text = format
    ? format(absolute)
    : delta.pct != null
      ? `${absolute > 0 ? '+' : ''}${delta.pct}%`
      : `${absolute > 0 ? '+' : ''}${Math.round(absolute * 100) / 100}`;

  /* Colour lives only in the glyph — never a tinted pill fill or border. The
     direction is also carried by the arrow shape and the signed text, so it is
     never conveyed by colour alone. */
  return (
    <span
      className="inline-flex items-center gap-1 text-[13px]"
      title="Change vs. the previous period of equal length"
    >
      <Icon
        size={12}
        strokeWidth={2.2}
        aria-hidden="true"
        className="stat__delta"
        data-direction={flat ? undefined : improved ? 'up' : 'down'}
      />
      {flat ? 'flat' : text}
    </span>
  );
}
