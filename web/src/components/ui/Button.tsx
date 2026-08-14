'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn--primary',
  secondary: 'btn--secondary',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
};

/* Height is the only thing size changes. `md` is the 36px reference button;
   `sm` drops to the 28px icon-button height for dense toolbars. */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn--sm',
  md: '',
  lg: '',
};

/**
 * Every pressable surface in this language is a neutral rounded rect, and the
 * only filled control is ink. That is why `primary` needs no light/dark
 * variant: it is `background: var(--fg-ink); color: var(--fg-on-ink)`, both of
 * which flip, so the white-fill/dark-label button falls out for free.
 *
 * No scale-on-hover, no brightness filter, no shadow. Colour transitions only
 * — elevation belongs to overlays, and a button that grows under the cursor
 * moves its neighbours.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`btn ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
        {...props}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="inline-block rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
            style={{ width: 12, height: 12 }}
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
