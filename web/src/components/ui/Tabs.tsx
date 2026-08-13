'use client';

import { useRef } from 'react';
import { motion } from 'motion/react';

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
 * Underlined tab bar with a shared-layout indicator.
 *
 * Roving tabindex + arrow-key navigation per the WAI-ARIA tabs pattern, so a
 * growing tab set stays keyboard-navigable.
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    const idx = selectable.findIndex((t) => t.id === value);
    const next = selectable[(idx + dir + selectable.length) % selectable.length];
    if (next) {
      onChange(next.id);
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)
        ?.focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        const disabled = Boolean(tab.comingSoon);

        return (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => !disabled && onChange(tab.id)}
            className="group relative flex flex-shrink-0 items-center gap-2 px-3 pb-2.5 pt-1 text-[13px] font-[450] tracking-[-0.01em] transition-colors duration-[140ms]"
            style={{
              color: active
                ? 'var(--color-text)'
                : disabled
                  ? 'var(--color-text-faint)'
                  : 'var(--color-text-muted)',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
              if (!active && !disabled) e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              if (!active && !disabled) e.currentTarget.style.color = 'var(--color-text-muted)';
            }}
          >
            {Icon && (
              <Icon
                size={13.5}
                strokeWidth={active ? 2.1 : 1.8}
                style={{ color: active ? 'var(--color-accent)' : 'currentColor' }}
              />
            )}
            {tab.label}

            {tab.badge != null && (
              <span
                className="rounded-[5px] px-1.5 py-px text-[10.5px] font-[600] tabular-nums"
                style={{
                  background: active ? 'var(--color-accent-subtle)' : 'var(--color-surface-elevated)',
                  color: active ? 'var(--color-accent)' : 'var(--color-text-faint)',
                }}
              >
                {tab.badge}
              </span>
            )}

            {tab.comingSoon && (
              <span
                className="text-[9.5px] font-[600] uppercase tracking-[0.1em]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                Soon
              </span>
            )}

            {/* Active underline — shared layout so it slides between tabs */}
            {active && (
              <motion.span
                layoutId="agent-tab-underline"
                className="absolute bottom-0 left-2 right-2 rounded-full"
                style={{ height: 1.5, background: 'var(--color-accent)' }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
