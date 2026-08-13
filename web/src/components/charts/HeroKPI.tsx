'use client';

import type { StatDelta } from '@/lib/api/calls';

export function HeroKPI({
  label,
  value,
  valueColor,
  icon: Icon,
  iconColor,
  delta,
  lowerIsBetter = false,
  formatDeltaFn,
  sub,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  icon: React.ElementType;
  iconColor: string;
  delta?: StatDelta | null;
  lowerIsBetter?: boolean;
  formatDeltaFn?: (absolute: number) => string;
  sub?: string;
}) {
  const showDelta = delta != null && Math.abs(delta.absolute) > 1e-9;
  const improved = lowerIsBetter
    ? delta != null && delta.absolute < 0
    : delta != null && delta.absolute > 0;
  const deltaColor = showDelta
    ? improved
      ? 'var(--color-state-speaking)'
      : 'var(--color-state-error)'
    : 'var(--color-text-faint)';

  const deltaText =
    showDelta && delta
      ? formatDeltaFn
        ? formatDeltaFn(delta.absolute)
        : delta.pct != null
          ? `${delta.absolute > 0 ? '+' : ''}${delta.pct}%`
          : `${delta.absolute > 0 ? '+' : ''}${Math.round(delta.absolute * 100) / 100}`
      : null;

  return (
    <div
      className="flex flex-col gap-3 rounded-[12px] p-5"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-[500] uppercase tracking-[0.07em]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {label}
        </span>
        <Icon size={14} strokeWidth={1.75} style={{ color: iconColor }} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span
          className="text-[36px] font-[600] leading-none tracking-[-0.04em]"
          style={{ color: valueColor ?? 'var(--color-text)' }}
        >
          {value}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showDelta && deltaText && (
            <span
              className="inline-flex items-center gap-0.5 font-mono text-[11px] font-[600]"
              style={{ color: deltaColor }}
            >
              {delta!.absolute > 0 ? '↑' : '↓'} {deltaText}
            </span>
          )}
          {sub && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {sub}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
