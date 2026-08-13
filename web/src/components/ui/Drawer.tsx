'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line under the title — usually an identifier or category. */
  subtitle?: React.ReactNode;
  /** Right side of the header, before the close button (e.g. an enable switch). */
  headerAction?: React.ReactNode;
  /** Pinned action bar at the bottom. Scrolls independently of the body. */
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}

/**
 * Right-side configuration drawer.
 *
 * Configuration lives here rather than expanding a page vertically, so a list of
 * 100+ items stays scannable. Handles focus trapping, Escape, scroll locking,
 * and focus restoration so it is safe to use for any future panel (tool config,
 * prompt versions, MCP servers, webhooks).
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerAction,
  footer,
  width = 460,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Remember what was focused before opening, and restore it on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    } else {
      restoreFocusRef.current?.focus?.();
    }
  }, [open]);

  // Escape to close + focus trap within the panel.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // Move focus into the panel once it has mounted.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      panel
        .querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
        )
        ?.focus();
    }, 220);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
          {/* Scrim */}
          <motion.button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 cursor-default"
            style={{ background: 'rgb(3 4 8 / 0.62)', backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            className="relative flex h-full flex-col"
            style={{
              width: `min(${width}px, 100vw)`,
              background: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border-strong)',
              boxShadow: '-24px 0 60px rgb(0 0 0 / 0.45)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <header
              className="flex flex-shrink-0 items-start gap-3 px-5 py-4"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2
                  className="truncate text-[14px] font-[600] tracking-[-0.02em]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {title}
                </h2>
                {subtitle && (
                  <div className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
                    {subtitle}
                  </div>
                )}
              </div>

              {headerAction}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="flex flex-shrink-0 cursor-pointer items-center justify-center rounded-[7px] transition-colors duration-[140ms]"
                style={{ width: 26, height: 26, color: 'var(--color-text-faint)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-surface-elevated)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-faint)';
                }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </header>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

            {/* Footer */}
            {footer && (
              <footer
                className="flex flex-shrink-0 flex-wrap items-center gap-2 px-5 py-3.5"
                style={{
                  borderTop: '1px solid var(--color-border)',
                  background: 'var(--color-surface-raised)',
                }}
              >
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
