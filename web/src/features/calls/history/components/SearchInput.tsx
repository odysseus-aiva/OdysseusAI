'use client';

import { Search, X } from 'lucide-react';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search calls…',
  'aria-label': ariaLabel = 'Search calls',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      className="relative flex items-center"
      style={{ minWidth: 200, flex: '1 1 220px', maxWidth: 320 }}
    >
      <Search
        size={13}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--color-text-faint)' }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-[9px] py-2 pl-9 pr-8 text-[13px] outline-none transition-colors duration-[140ms]"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          height: 36,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-focus)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[5px]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          <X size={13} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
