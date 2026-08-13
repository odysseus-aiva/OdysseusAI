'use client';

import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Shared form primitives for configuration surfaces.
 *
 * Every control is uncontrolled-agnostic and forwards refs so it can be driven
 * by any state layer. Focus styling lives in CSS (`:focus` via the `peer`
 * pattern is avoided in favor of a data attribute) so there are no inline
 * onFocus/onBlur handlers duplicated at each call site.
 */

const CONTROL_BASE =
  'w-full text-[13px] leading-[1.5] rounded-[8px] outline-none transition-[border-color,background,box-shadow] duration-[140ms]';

const CONTROL_STYLE: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
};

/** Label + optional hint/error wrapper. Associates ids for screen readers. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  action,
  className = '',
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  /** Right-aligned control in the label row — e.g. a "Reset" or char count. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {(label || action) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-[12px] font-[500] tracking-[-0.005em]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {label}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <span className="text-[11px] leading-[1.5]" style={{ color: 'var(--color-state-error)' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11px] leading-[1.5]" style={{ color: 'var(--color-text-faint)' }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', style, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={`${CONTROL_BASE} px-3 py-2 ${className}`}
        style={{ ...CONTROL_STYLE, ...style }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-focus)';
          e.currentTarget.style.background = 'var(--color-surface-raised)';
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.background = 'var(--color-surface)';
          props.onBlur?.(e);
        }}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }
>(function Textarea({ className = '', style, mono = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`${CONTROL_BASE} resize-none px-3 py-2.5 leading-[1.65] ${
        mono ? 'font-mono text-[12.5px]' : ''
      } ${className}`}
      style={{ ...CONTROL_STYLE, ...style }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-focus)';
        e.currentTarget.style.background = 'var(--color-surface-raised)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
        e.currentTarget.style.background = 'var(--color-surface)';
        props.onBlur?.(e);
      }}
    />
  );
});

/** Option data parsed from <option> children. */
interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Custom select — styled to the design system, with a portal-based dropdown
 * that escapes overflow:hidden containers.
 *
 * API is a drop-in replacement for the native <select>: pass <option> children
 * and `value`/`onChange` exactly as before. onChange receives a synthetic event
 * with `e.target.value` so existing handlers work without changes.
 */
export function Select({
  className = '',
  style,
  children,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Parse <option> children into a flat list.
  const options = useMemo<OptionItem[]>(() => {
    const result: OptionItem[] = [];
    Children.forEach(children, (child) => {
      if (!isValidElement(child) || child.type !== 'option') return;
      const p = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      result.push({
        value: String(p.value ?? ''),
        label: String(p.children ?? ''),
        disabled: p.disabled,
      });
    });
    return result;
  }, [children]);

  const selectedLabel = options.find((o) => o.value === String(value ?? ''))?.label ?? '';

  const openList = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const dropHeight = Math.min(options.length * 34 + 10, 216);
    // Ensure dropdown is at least 160px wide, then clamp so it never overflows
    // the right edge of the viewport (8px margin).
    const dropWidth = Math.max(rect.width, 160);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropWidth - 8));
    setDropPos({
      top: spaceBelow >= dropHeight ? rect.bottom + 4 : rect.top - dropHeight - 4,
      left,
      width: dropWidth,
    });
    setOpen(true);
  };

  const pick = (val: string) => {
    onChange?.({ target: { value: val } } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Close on click-outside and scroll.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [open]);

  // Keyboard navigation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = options.findIndex((o) => o.value === String(value ?? ''));
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      for (let i = idx + 1; i < options.length; i++) {
        if (!options[i].disabled) { pick(options[i].value); break; }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      for (let i = idx - 1; i >= 0; i--) {
        if (!options[i].disabled) { pick(options[i].value); break; }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const currentValue = String(value ?? '');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        onClick={() => (open ? setOpen(false) : openList())}
        className={`${CONTROL_BASE} cursor-pointer py-2 pl-3 pr-8 text-left relative ${className}`}
        style={{ ...CONTROL_STYLE, ...style }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-focus)'; }}
        onBlur={(e) => {
          // Don't reset if focus is moving to the dropdown list.
          if (!listRef.current?.contains(e.relatedTarget as Node)) {
            e.currentTarget.style.borderColor = 'var(--color-border)';
          }
        }}
      >
        <span className="block truncate" style={{ color: selectedLabel ? 'var(--color-text)' : 'var(--color-text-faint)' }}>
          {selectedLabel || ''}
        </span>
        {/* Chevron — rotates when open */}
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-[140ms]"
          style={{
            width: 10,
            height: 10,
            color: 'var(--color-text-faint)',
            transform: `translateY(-50%) rotate(${open ? '180deg' : '0deg'})`,
          }}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Portal dropdown — rendered at document.body to escape overflow:hidden. */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && dropPos && (
              <motion.div
                ref={listRef}
                role="listbox"
                aria-label={ariaLabel}
                initial={{ opacity: 0, scale: 0.97, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -4 }}
                transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'fixed',
                  top: dropPos.top,
                  left: dropPos.left,
                  width: dropPos.width,
                  zIndex: 1000,
                  maxHeight: 216,
                  overflowY: 'auto',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 10,
                  padding: 4,
                  // Layered shadows: ambient + focused lift
                  boxShadow:
                    '0 4px 6px rgb(0 0 0 / 0.06), 0 10px 32px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.04)',
                }}
              >
                {options.map((opt) => {
                  const active = opt.value === currentValue;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={active}
                      aria-disabled={opt.disabled}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!opt.disabled) pick(opt.value);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px 7px 8px',
                        borderRadius: 7,
                        fontSize: 13,
                        lineHeight: 1.4,
                        cursor: opt.disabled ? 'not-allowed' : 'pointer',
                        background: active ? 'var(--color-accent-subtle)' : 'transparent',
                        color: opt.disabled
                          ? 'var(--color-text-faint)'
                          : active
                          ? 'var(--color-text)'
                          : 'var(--color-text-muted)',
                        transition: 'background 80ms',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!opt.disabled && !active)
                          (e.currentTarget as HTMLDivElement).style.background =
                            'var(--color-surface-raised)';
                      }}
                      onMouseLeave={(e) => {
                        if (!opt.disabled && !active)
                          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                      }}
                    >
                      {/* Active indicator dot */}
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active && (
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'var(--color-accent)',
                              boxShadow: '0 0 4px var(--color-accent-ring)',
                            }}
                          />
                        )}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/**
 * Accessible switch. Used for tool enable/disable and boolean config, so the
 * affordance is identical everywhere a boolean is edited.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Required — a bare switch is unlabeled to screen readers. */
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? { w: 28, h: 17, knob: 11 } : { w: 34, h: 20, knob: 14 };
  const inset = (track.h - 2 - track.knob) / 2;
  const travel = track.w - 2 - track.knob - inset * 2;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 rounded-full transition-colors duration-[180ms] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        width: track.w,
        height: track.h,
        background: checked ? 'var(--color-accent)' : 'var(--color-surface-elevated)',
        border: '1px solid',
        borderColor: checked ? 'transparent' : 'var(--color-border-strong)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="absolute rounded-full transition-transform duration-[180ms]"
        style={{
          top: inset,
          left: inset,
          width: track.knob,
          height: track.knob,
          background: checked ? 'var(--color-void)' : 'var(--color-text-faint)',
          transform: checked ? `translateX(${travel}px)` : 'translateX(0)',
        }}
      />
    </button>
  );
}

/**
 * Segmented control for small mutually-exclusive choices (2–4 options).
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  const groupId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-[9px] p-0.5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            id={`${groupId}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="cursor-pointer rounded-[7px] px-2.5 py-1 text-[12px] font-[500] transition-all duration-[140ms]"
            style={{
              background: active ? 'var(--color-surface-elevated)' : 'transparent',
              color: active ? 'var(--color-text)' : 'var(--color-text-faint)',
              border: `1px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
