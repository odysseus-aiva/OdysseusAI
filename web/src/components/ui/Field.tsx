'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

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

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = '', style, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        {...props}
        className={`${CONTROL_BASE} cursor-pointer appearance-none py-2 pl-3 pr-8 ${className}`}
        style={{ ...CONTROL_STYLE, ...style }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-focus)';
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          props.onBlur?.(e);
        }}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        style={{ width: 10, height: 10, color: 'var(--color-text-faint)' }}
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
    </div>
  );
});

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
  // Explicit geometry: `inset` is the gap between knob and track edge, and
  // `travel` is the distance the knob slides. Both are derived from the border
  // box so the knob is optically centered at rest and flush when on.
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
 * Cheaper to scan than a select when the option set is tiny and stable.
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
