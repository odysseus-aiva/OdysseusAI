'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

/**
 * Layout primitives for configuration surfaces.
 *
 * A `Section` groups related settings under a heading; `Panel` is the surface it
 * sits on. Keeping them separate means a tab can render several panels in one
 * section, or a bare section with no surface at all.
 */

/** Titled group of settings. Rules are drawn between groups, never per row. */
export function Section({
  title,
  description,
  action,
  className = '',
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-3.5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2
            className="text-[13px] font-[600] tracking-[-0.015em]"
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </h2>
          {description && (
            <p
              className="max-w-[64ch] text-[12px] leading-[1.55]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Bordered surface. `flush` removes padding for lists that own their rows. */
export function Panel({
  flush = false,
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      className={`rounded-[11px] ${flush ? '' : 'p-4'} ${className}`}
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Collapsed-by-default disclosure. Advanced and destructive settings live here
 * so the common path stays short.
 */
export function Collapsible({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className="rounded-[11px] overflow-hidden"
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left transition-colors duration-[140ms]"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface-elevated)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-shrink-0 items-center"
        >
          <ChevronRight size={13} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
        </motion.span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className="text-[12.5px] font-[500] tracking-[-0.01em]"
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </span>
          {description && (
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              {description}
            </span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-4 pb-4 pt-1"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <div className="pt-3.5">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Empty / reserved state. Used both for genuinely empty lists and for tabs
 * whose backend does not exist yet, so unbuilt areas read as intentional
 * rather than broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  /** Bullet list of what will land here. Renders only when provided. */
  planned,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  planned?: string[];
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-[12px] px-6 py-14 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <div
        className="flex items-center justify-center rounded-[12px]"
        style={{
          width: 42,
          height: 42,
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
        }}
      >
        <Icon size={17} strokeWidth={1.7} style={{ color: 'var(--color-text-faint)' }} />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[13.5px] font-[550]" style={{ color: 'var(--color-text)' }}>
          {title}
        </p>
        <p
          className="max-w-[46ch] text-[12.5px] leading-[1.6]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {description}
        </p>
      </div>

      {planned && planned.length > 0 && (
        <ul className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
          {planned.map((item) => (
            <li
              key={item}
              className="rounded-[6px] px-2 py-1 text-[11px] font-[450]"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-faint)',
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}

      {action}
    </div>
  );
}

/** Label/value row for read-only metadata (IDs, timestamps). */
export function DataRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="flex-shrink-0 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[12px] ${mono ? 'font-mono' : ''}`}
        style={{ color: 'var(--color-text)' }}
      >
        {children}
      </span>
    </div>
  );
}
