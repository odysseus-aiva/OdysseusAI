import type { HTMLAttributes } from 'react';

type GlassPanelVariant = 'default' | 'raised' | 'elevated' | 'inset';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassPanelVariant;
}

const VARIANT_STYLES: Record<GlassPanelVariant, React.CSSProperties> = {
  default: {
    background: 'var(--color-glass)',
    border: '1px solid var(--color-glass-border)',
    boxShadow: '0 4px 24px rgb(0 0 0 / 0.35)',
  },
  raised: {
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    boxShadow: '0 8px 40px rgb(0 0 0 / 0.4)',
  },
  elevated: {
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border-strong)',
    boxShadow: '0 12px 48px rgb(0 0 0 / 0.5)',
  },
  inset: {
    background: 'rgb(0 0 0 / 0.15)',
    border: '1px solid var(--color-border)',
    boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.04)',
  },
};

export function GlassPanel({
  className = '',
  variant = 'default',
  style,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={`rounded-2xl backdrop-blur-xl ${className}`}
      style={{ ...VARIANT_STYLES[variant], ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
