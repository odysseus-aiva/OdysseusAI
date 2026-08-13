'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[--color-accent] text-[--color-void] font-[600] hover:brightness-110 border border-transparent',
  secondary:
    'bg-[--color-glass] text-[--color-text] border border-[--color-border] hover:bg-[--color-glass-hover] hover:border-[--color-border-strong]',
  ghost:
    'bg-transparent text-[--color-text-muted] border border-transparent hover:text-[--color-text] hover:bg-[--color-glass]',
  danger:
    'bg-transparent text-[--color-state-error] border border-[--color-state-error]/30 hover:bg-[--color-state-error]/10',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'text-[12px] px-3 py-1.5 rounded-[8px] gap-1.5',
  md: 'text-[13px] px-4 py-2 rounded-[10px] gap-2',
  lg: 'text-[14px] px-5 py-2.5 rounded-[10px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-[500] tracking-[-0.01em]
          transition-colors duration-[140ms] cursor-pointer select-none
          disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
          ${VARIANT_STYLES[variant]}
          ${SIZE_STYLES[size]}
          ${className}
        `}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {loading && (
          <span
            className="inline-block rounded-full border-[1.5px] border-current border-t-transparent animate-spin"
            style={{ width: 12, height: 12 }}
          />
        )}
        {children}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
