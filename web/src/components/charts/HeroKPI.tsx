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
  bare = false,
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
  /** Render without card chrome — for use inside a horizontal KPI strip. */
  bare?: boolean;
}) {
  const showDelta = delta != null && Math.abs(delta.absolute) > 1e-9;
  const improved = lowerIsBetter
    ? delta != null && delta.absolute < 0
    : delta != null && delta.absolute > 0;

  const deltaText =
    showDelta && delta
      ? formatDeltaFn
        ? formatDeltaFn(delta.absolute)
        : delta.pct != null
          ? `${delta.absolute > 0 ? '+' : ''}${delta.pct}%`
          : `${delta.absolute > 0 ? '+' : ''}${Math.round(delta.absolute * 100) / 100}`
      : null;

  /* `valueColor` and `iconColor` are accepted for call-site compatibility and
     deliberately ignored: a metric value is not a status, and a coloured
     numeral is the loudest possible colour-as-chrome violation. Direction is
     carried by the delta arrow, which is the one thing here allowed a hue. */
  const foot = (
    <div className="stat__foot flex-wrap gap-x-2 gap-y-1">
      {showDelta && deltaText && (
        <span
          className="stat__delta inline-flex items-center gap-1"
          data-direction={improved ? 'up' : 'down'}
        >
          <span aria-hidden="true">{delta!.absolute > 0 ? '↑' : '↓'}</span> {deltaText}
        </span>
      )}
      {sub && <span>{sub}</span>}
    </div>
  );

  const head = (
    <div className="flex items-center justify-between">
      <span className="stat__label">{label}</span>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--fg-muted)' }} />
    </div>
  );

  if (bare) {
    return (
      <div
        className="flex flex-1 flex-col gap-2 px-6 py-4"
        style={{ borderRight: '1px solid var(--line-hairline)' }}
      >
        {head}
        <div>
          <div className="stat__value mt-0">{value}</div>
          {foot}
        </div>
      </div>
    );
  }

  return (
    <div className="stat flex flex-col gap-3">
      {head}
      <div>
        <div className="stat__value mt-0">{value}</div>
        {foot}
      </div>
    </div>
  );
}
