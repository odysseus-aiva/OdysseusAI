import type { HTMLAttributes } from 'react';

/**
 * Surface container.
 *
 * The name is a holdover: there is no glass in this language. Hairlines
 * separate, and elevation is rationed to things that genuinely float — so
 * only `elevated` casts a shadow, and it casts the softest one in the system.
 * A hairline *and* a shadow on the same element is a smell; `elevated` carries
 * both only because a floating panel needs to detach from what it covers.
 */
type GlassPanelVariant = 'default' | 'raised' | 'elevated' | 'inset';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassPanelVariant;
}

const VARIANT_STYLES: Record<GlassPanelVariant, React.CSSProperties> = {
  default: {
    background: 'var(--surface-card)',
    border: '1px solid var(--line-hairline)',
  },
  raised: {
    background: 'var(--surface-card)',
    border: '1px solid var(--line-hairline)',
  },
  elevated: {
    background: 'var(--surface-card)',
    border: '1px solid var(--line-hairline)',
    boxShadow: 'var(--shadow-soft)',
  },
  /* Recessed rather than tinted black: on light the fill has to go *down* a
     step, and a black alpha would grey the whole surface instead. */
  inset: {
    background: 'var(--surface-recessed)',
    border: '1px solid var(--line-hairline)',
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
      className={`rounded-[8px] ${className}`}
      style={{ ...VARIANT_STYLES[variant], ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
