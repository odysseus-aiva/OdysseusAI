/**
 * The in-table status label.
 *
 * One box, five tones: a washed fill of the status hue under a deep ink of the
 * same hue. Four things this deliberately is not, all of them corrections to
 * the previous implementation:
 *
 *   - not a pill (6px radius; pills are reserved for chips and dots)
 *   - not bordered (fill and label are the whole component)
 *   - never dotted (the dot belongs to the header chip, a different object)
 *   - never a saturated fill (the measured washes are ~18% veils of the hue)
 *
 * A badge is a label, so it has no interactive states at all. The label text is
 * always the accessible name, so the fill is never the sole carrier of meaning
 * — which is what licenses colour here in the first place.
 */
type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'muted' | 'running';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

/* `accent`, `default` and `muted` all resolve to the neutral base: "highlighted"
   is not a status, and colour is never chrome. Neutral is the base rule rather
   than a modifier, so these three carry no class of their own. */
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: '',
  accent: '',
  muted: '',
  success: 'status-pill--success',
  warning: 'status-pill--warning',
  error: 'status-pill--error',
  running: 'status-pill--running',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`status-pill ${VARIANT_CLASS[variant]} ${className}`.trim()}>{children}</span>
  );
}
