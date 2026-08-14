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

export function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60_000) return formatMs(ms);
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
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

/* ── Chart palette ────────────────────────────────────────────────────────────
 * The data mark is a product visual; everything that frames it is chrome. So
 * colour is legal on a plotted series and illegal on the card border, the
 * gridlines, the ticks, the legend chip and the tooltip panel.
 *
 * Two constraints follow, and both are load-bearing:
 *
 *   One accent series per chart, hard limit. --product-accent is the only
 *   source of blue in the app (the orb's whole ramp derives from it), so a
 *   second and third hue would be an independent colour system with nothing
 *   tying it to the accent — instantly the loudest thing on screen.
 *
 *   A single-series bar field is NEUTRAL, not accent. Bars cover far more area
 *   than a line: at fourteen columns an accent bar field takes over the page.
 *   The reference's only bar chart measures at zero chroma.
 * ────────────────────────────────────────────────────────────────────────── */

/** Bars, single series. Neutral ink — see above. */
export const BAR_FILL = 'var(--fg-ink)';

/** A single time-series line, and its area fill. The one licensed accent. */
export const LINE_STROKE = 'var(--product-accent)';
export const LINE_FILL = 'var(--accent-wash)';

/** A comparison / previous-period series: a neutral ghost, no fill. */
export const LINE_COMPARE = 'var(--fg-muted)';

/** Track behind a proportional bar. */
export const TRACK_FILL = 'var(--surface-hover)';

/**
 * Conversational-latency colour scale. A voice turn feels immediate under
 * ~800ms and clearly laggy past ~1.5s, so the thresholds are tighter than a
 * generic API latency scale would be.
 *
 * This is a genuine status: a number the user is expected to act on. Never
 * reach for these tokens just to get a second series colour — it destroys the
 * signal.
 */
export function latencyColor(ms: number | null): string {
  if (ms == null) return 'var(--fg-muted)';
  if (ms < 800) return 'var(--status-success)';
  if (ms < 1500) return 'var(--status-warning)';
  return 'var(--status-error)';
}

/**
 * Colour per conversation outcome.
 *
 * `in_progress` is neutral, not warning: in-flight is not a problem, and
 * warning is reserved for a state the user must do something about.
 */
export const OUTCOME_COLORS: Record<string, string> = {
  engaged: 'var(--status-success)',
  no_interaction: 'var(--status-warning)',
  failed: 'var(--status-error)',
  in_progress: 'var(--fg-muted)',
};

export const OUTCOME_LABELS: Record<string, string> = {
  engaged: 'Engaged',
  no_interaction: 'No interaction',
  failed: 'Failed',
  in_progress: 'In progress',
};

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'var(--status-success)',
  neutral: 'var(--fg-body)',
  negative: 'var(--status-error)',
};

/**
 * Latency stages in a composition bar. Four categories differentiated by
 * lightness rather than hue: a four-way categorical ramp is exactly the second
 * colour system the accent rule exists to prevent, and none of these stages is
 * a status. The ink ladder gives four clearly separable steps in both themes.
 */
export const STAGE_COLORS: Record<string, string> = {
  stt: 'var(--fg-ink)',
  llm: 'var(--fg-body)',
  tts: 'var(--fg-muted)',
  unaccounted: 'var(--line-strong)',
};
