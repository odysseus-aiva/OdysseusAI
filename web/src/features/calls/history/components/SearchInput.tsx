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
        size={16}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute left-3"
        style={{ color: 'var(--fg-muted)' }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="input pl-9 pr-9"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="icon-btn focus-inset absolute right-1"
        >
          <X size={14} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
