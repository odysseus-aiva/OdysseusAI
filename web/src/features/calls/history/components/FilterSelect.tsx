'use client';

import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';

/** Compact bordered select matching platform form controls. */
export function FilterSelect({
  className = '',
  style,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative inline-flex min-w-0 ${className}`} style={style}>
      <select
        {...props}
        className="appearance-none rounded-[9px] py-2 pl-3 pr-8 text-[13px] outline-none transition-colors duration-[140ms] disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          height: 36,
          minWidth: 120,
        }}
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
      <ChevronDown
        size={14}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--color-text-faint)' }}
      />
    </div>
  );
}
