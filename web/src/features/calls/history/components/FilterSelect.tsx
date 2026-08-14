'use client';

import type { SelectHTMLAttributes } from 'react';
import { Select } from '@/components/ui/Field';

/** Compact filter-bar select — wraps the design-system Select with filter-bar sizing. */
export function FilterSelect({
  className = '',
  style,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select
      className={className}
      // width: auto overrides the w-full baked into CONTROL_BASE so it stays inline in the flex filter row.
      style={{
        height: 'var(--input-height)',
        minWidth: 120,
        width: 'auto',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
      {...props}
    />
  );
}
