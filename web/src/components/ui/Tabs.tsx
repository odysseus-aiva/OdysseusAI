'use client';

import { useRef } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: React.ElementType;
  /** Right-hand count/state pill — e.g. enabled tool count. */
  badge?: string | number;
  /** Renders muted with a "Soon" marker and is not selectable. */
  comingSoon?: boolean;
}

/**
 * Underlined tab bar.
 *
 * The indicator is 2px of ink sitting on the strip's own hairline, and the
 * active label goes *darker*, never bolder — switching weight on activation
 * reflows the row, and an accent underline is the most tempting
 * colour-as-chrome violation in this language.
 *
 * Roving tabindex + arrow keys per the WAI-ARIA tabs pattern.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const selectable = tabs.filter((t) => !t.comingSoon);

  /* Selection follows focus: swapping a panel here is instant, so Enter and
     Space are no-ops by design. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = selectable.findIndex((t) => t.id === value);
    let next: TabDef<T> | undefined;

    switch (e.key) {
      case 'ArrowRight':
        next = selectable[(idx + 1) % selectable.length];
        break;
      case 'ArrowLeft':
        next = selectable[(idx - 1 + selectable.length) % selectable.length];
        break;
      case 'Home':
        next = selectable[0];
        break;
      case 'End':
        next = selectable.at(-1);
        break;
      default:
        return;
    }

    e.preventDefault();
    if (next) {
      onChange(next.id);
      listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
    }
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} className="tabs">
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        const disabled = Boolean(tab.comingSoon);

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            data-tab-id={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            data-active={active || undefined}
            onClick={() => !disabled && onChange(tab.id)}
            onKeyDown={onKeyDown}
            /* The 12px inset is the measured distance the indicator extends
               past the label ink on each side. */
            className="tab focus-inset px-3 disabled:opacity-40"
          >
            {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
            {tab.label}
            {tab.badge != null && <span className="badge tabular-nums">{tab.badge}</span>}
            {tab.comingSoon && <span className="badge">Soon</span>}
          </button>
        );
      })}
    </div>
  );
}
