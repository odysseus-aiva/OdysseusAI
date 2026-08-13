type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'muted';

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    background: 'var(--color-surface-elevated)',
    color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)',
  },
  accent: {
    background: 'var(--color-accent-subtle)',
    color: 'var(--color-accent)',
    border: '1px solid rgb(56 232 255 / 0.18)',
  },
  success: {
    background: 'rgb(74 222 128 / 0.07)',
    color: 'var(--color-state-speaking)',
    border: '1px solid rgb(74 222 128 / 0.18)',
  },
  warning: {
    background: 'rgb(251 191 36 / 0.07)',
    color: 'var(--color-state-warning)',
    border: '1px solid rgb(251 191 36 / 0.18)',
  },
  error: {
    background: 'rgb(251 113 133 / 0.07)',
    color: 'var(--color-state-error)',
    border: '1px solid rgb(251 113 133 / 0.18)',
  },
  muted: {
    background: 'transparent',
    color: 'var(--color-text-faint)',
    border: 'none',
  },
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default: 'var(--color-text-faint)',
  accent: 'var(--color-accent)',
  success: 'var(--color-state-speaking)',
  warning: 'var(--color-state-warning)',
  error: 'var(--color-state-error)',
  muted: 'var(--color-text-faint)',
};

export function Badge({ variant = 'default', dot, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[11px] font-[500] tracking-[0.01em] ${className}`}
      style={VARIANT_STYLES[variant]}
    >
      {dot && (
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: 5, height: 5, background: DOT_COLORS[variant] }}
        />
      )}
      {children}
    </span>
  );
}
