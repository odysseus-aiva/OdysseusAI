/** Formatting and colour helpers shared by every analytics surface. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatUsd(usd: number | null): string {
  if (usd == null) return '—';
  if (!usd) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}

export function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}

export function formatPct(fraction: number | null, digits = 0): string {
  if (fraction == null) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

export function formatCount(n: number | null): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

/**
 * Conversational-latency colour scale. A voice turn feels immediate under
 * ~800ms and clearly laggy past ~1.5s, so the thresholds are tighter than a
 * generic API latency scale would be.
 */
export function latencyColor(ms: number | null): string {
  if (ms == null) return 'var(--color-text-faint)';
  if (ms < 800) return 'var(--color-state-speaking)';
  if (ms < 1500) return 'var(--color-state-warning)';
  return 'var(--color-state-error)';
}

/** Semantic colour per conversation outcome, reused across every chart. */
export const OUTCOME_COLORS: Record<string, string> = {
  engaged: 'var(--color-state-speaking)',
  no_interaction: 'var(--color-state-warning)',
  failed: 'var(--color-state-error)',
  in_progress: 'var(--color-accent)',
};

export const OUTCOME_LABELS: Record<string, string> = {
  engaged: 'Engaged',
  no_interaction: 'No interaction',
  failed: 'Failed',
  in_progress: 'In progress',
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'var(--color-state-speaking)',
  neutral: 'var(--color-text-muted)',
  negative: 'var(--color-state-error)',
};

export const STAGE_COLORS: Record<string, string> = {
  stt: 'var(--color-accent)',
  llm: 'var(--color-accent-2)',
  tts: 'var(--color-state-speaking)',
  unaccounted: 'var(--color-state-warning)',
};
