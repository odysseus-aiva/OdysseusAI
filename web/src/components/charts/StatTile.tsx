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
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-[500] uppercase tracking-[0.07em]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {label}
        </span>
        <Icon size={13} strokeWidth={1.75} style={{ color: iconColor }} />
      </div>

      <div>
        <span
          className="text-[24px] font-[600] leading-none tracking-[-0.04em]"
          style={{ color: 'var(--color-text)' }}
        >
          {value}
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {sub && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
              {sub}
            </span>
          )}
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

  const color = flat
    ? 'var(--color-text-faint)'
    : improved
      ? 'var(--color-state-speaking)'
      : 'var(--color-state-error)';

  const Icon = flat ? Minus : absolute > 0 ? ArrowUpRight : ArrowDownRight;
  const text = format
    ? format(absolute)
    : delta.pct != null
      ? `${absolute > 0 ? '+' : ''}${delta.pct}%`
      : `${absolute > 0 ? '+' : ''}${Math.round(absolute * 100) / 100}`;

  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-[10.5px] font-[600]"
      style={{ color }}
      title="Change vs. the previous period of equal length"
    >
      <Icon size={11} strokeWidth={2.25} />
      {flat ? 'flat' : text}
    </span>
  );
}
