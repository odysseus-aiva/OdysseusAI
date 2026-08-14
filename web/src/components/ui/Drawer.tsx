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
          {/* On light the scrim bleaches rather than dims — a translucent
              neutral, not black at 50%. The --scrim token carries that. */}
          <motion.button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 cursor-default"
            style={{ background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
          />

          {/* A sheet genuinely floats, so it is one of the few things licensed
              to carry both a hairline and a shadow. */}
          <motion.div
            ref={panelRef}
            className="relative flex h-full flex-col"
            style={{
              width: `min(${width}px, 100vw)`,
              background: 'var(--surface-card)',
              borderLeft: '1px solid var(--line-hairline)',
              boxShadow: 'var(--shadow-modal)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          >
            <header
              className="flex flex-shrink-0 items-start gap-3 px-5 py-4"
              style={{ borderBottom: '1px solid var(--line-hairline)' }}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="section__title truncate">{title}</h2>
                {subtitle && <div className="section__desc">{subtitle}</div>}
              </div>

              {headerAction}

              <button type="button" onClick={onClose} aria-label="Close panel" className="icon-btn">
                <X size={16} strokeWidth={2} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

            {/* Secondary first, primary last: a disabled primary leaves the tab
                order, so trailing it can't strand focus. */}
            {footer && (
              <footer
                className="flex flex-shrink-0 flex-wrap items-center gap-2 px-5 py-4"
                style={{
                  borderTop: '1px solid var(--line-hairline)',
                  background: 'var(--surface-recessed)',
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
