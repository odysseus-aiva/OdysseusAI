'use client';

import { useId, useState } from 'react';
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
    <section className={`section ${className}`}>
      <div className="section__head">
        <div>
          <h2 className="section__title">{title}</h2>
          {description && <p className="section__desc max-w-[64ch]">{description}</p>}
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
    <div className={`card ${flush ? 'p-0' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/**
 * Collapsed-by-default disclosure. Advanced and destructive settings live here
 * so the common path stays short.
 *
 * The disclosure does not animate its height. Nothing in this language animates
 * layout — only background, colour and transform get transitions — and a
 * height tween on a panel full of form controls reflows everything below it.
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
    <div className="card overflow-hidden p-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]"
      >
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="flex-shrink-0 transition-transform duration-[120ms]"
          style={{
            color: 'var(--fg-muted)',
            transform: open ? 'rotate(90deg)' : undefined,
          }}
        />
        <span className="flex min-w-0 flex-col">
          <span className="section__title">{title}</span>
          {description && <span className="section__desc">{description}</span>}
        </span>
      </button>

      {open && (
        <div id={panelId} className="px-4 pb-4" style={{ borderTop: '1px solid var(--line-hairline)' }}>
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Empty / reserved state. Used both for genuinely empty lists and for tabs
 * whose backend does not exist yet, so unbuilt areas read as intentional
 * rather than broken.
 *
 * There is no display type in an empty state here: title and body are both
 * 15px and hierarchy comes from weight and colour alone. The border is solid
 * and hairline-weight — a dashed strong border reads as a drop target.
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
    <div className="empty-state">
      <span className="empty-state__tile" aria-hidden="true">
        <Icon size={20} strokeWidth={1.7} />
      </span>

      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__body">{description}</p>

      {planned && planned.length > 0 && (
        <ul className="mb-4 flex flex-wrap items-center justify-center gap-2">
          {planned.map((item) => (
            <li key={item} className="badge">
              {item}
            </li>
          ))}
        </ul>
      )}

      {action && <div className="empty-state__actions">{action}</div>}
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
      <span className="flex-shrink-0 text-[13px]" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[13px] ${mono ? 'font-mono' : ''}`}
        style={{ color: 'var(--fg-ink)' }}
      >
        {children}
      </span>
    </div>
  );
}
