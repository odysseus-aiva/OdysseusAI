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
 * Every control forwards refs so it can be driven by any state layer, and every
 * visual state lives in CSS (`.input`, `.textarea`, `.select` in globals.css)
 * rather than in inline focus/blur handlers that mutate style. That matters
 * beyond tidiness: the previous version reset `borderColor` to a literal on
 * blur, which silently broke the light theme.
 */

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
    /* Deliberately not `.field`: that class only carries an adjacent-sibling
       margin, and call sites already own their spacing through flex gaps. */
    <div className={className}>
      {(label || action) && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={htmlFor} className="field__label mb-0">
              {label}
            </label>
          )}
          {action}
        </div>
      )}
      {children}
      {error ? (
        <span className="field__error">{error}</span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} {...props} className={`input ${className}`} />;
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }
>(function Textarea({ className = '', mono = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`textarea ${mono ? 'font-mono text-[13px]' : ''} ${className}`}
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
 * Custom select — a portal-based dropdown that escapes overflow:hidden
 * containers.
 *
 * API is a drop-in replacement for the native <select>: pass <option> children
 * and `value`/`onChange` exactly as before. onChange receives a synthetic event
 * with `e.target.value` so existing handlers work without changes.
 *
 * The list genuinely floats, so it is one of the few things in this language
 * that earns a shadow. The selected row is a flat grey fill plus an ink check —
 * not a tinted fill, and not a glowing dot.
 */
export function Select({
  className = '',
  style,
  children,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const dropHeight = Math.min(options.length * 32 + 8, 216);
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
      )
        setOpen(false);
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
        if (!options[i].disabled) {
          pick(options[i].value);
          break;
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      for (let i = idx - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          pick(options[i].value);
          break;
        }
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
        className={`select relative pr-8 text-left ${className}`}
        style={style}
      >
        <span
          className="block truncate"
          style={{ color: selectedLabel ? 'var(--fg-ink)' : 'var(--fg-muted)' }}
        >
          {selectedLabel || ''}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-3 top-1/2 transition-transform duration-[120ms]"
          style={{
            width: 12,
            height: 12,
            color: 'var(--fg-muted)',
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
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'fixed',
                  top: dropPos.top,
                  left: dropPos.left,
                  width: dropPos.width,
                  zIndex: 1000,
                  maxHeight: 216,
                  overflowY: 'auto',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--line-hairline)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-1)',
                  boxShadow: 'var(--shadow-modal)',
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
                      className="select-option"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!opt.disabled) pick(opt.value);
                      }}
                    >
                      {/* The slot is reserved whether or not the row is
                          selected, so the labels stay on one left edge. */}
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                        {active && (
                          <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden>
                            <path
                              d="M2.5 6.5 5 9l4.5-5.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

/**
 * Accessible switch. Used for tool enable/disable and boolean config, so the
 * affordance is identical everywhere a boolean is edited.
 *
 * ON is an ink track with an inverted knob — the same inversion the primary
 * button uses, which is why it flips correctly between themes. Never an accent
 * track: a coloured toggle is chrome wearing colour.
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
  /* Track, knob and travel all live in the `.switch` rule, derived from the
     --switch-* tokens, so the two sizes are three numbers rather than two sets
     of geometry that can drift apart. `aria-checked` drives the visual state
     directly, which makes it impossible to render an ON switch that doesn't
     announce as one. */
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`switch ${size === 'sm' ? 'switch--sm' : ''}`.trim()}
    />
  );
}

/**
 * Segmented control for small mutually-exclusive choices (2–4 options).
 *
 * The active thumb is one of the five places in the system licensed to cast a
 * shadow: it has to read as sitting on top of the recessed track.
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
    <div role="radiogroup" aria-label={label} className="segmented">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            id={`${groupId}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active || undefined}
            onClick={() => onChange(opt.value)}
            className="segmented__item"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
