'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { VoiceState } from '../types';
import { VOICE_STATE_META } from '../types';

/**
 * One diagnostic field in the developer rail (LLM, STT, TTS, transport, latency).
 * Kept as data so callers can add fields without touching this component.
 */
export interface StatusDetail {
  label: string;
  value: string;
  /** Renders the value in ink instead of body grey. */
  emphasis?: boolean;
}

interface StatusIndicatorProps {
  state: VoiceState;
  /** Optional override for the state's default label. */
  label?: string;
  /** Developer-mode diagnostics rail. Hidden entirely when empty. */
  details?: StatusDetail[];
  /** `inline` for the hero; `panel` for in-call, which adds a surface. */
  variant?: 'inline' | 'panel';
  className?: string;
}

/**
 * Minimal, extensible readout of system readiness. Communicates state through
 * text + a motion signature (never color alone), and carries an optional
 * diagnostics rail for developer mode.
 *
 * Built on `.chip`, the same object as the app's `● Active calls: 0` pill, which
 * is one of the three shapes allowed to be a full pill. Most of the lifecycle
 * reads neutral: hue arrives only when the state is genuinely a status, so
 * "listening" is grey and "connection error" is not.
 *
 * Adding a state requires only a VOICE_STATE_META entry; the dot motion falls
 * back to a steady pulse for anything not in MOTION.
 */
export function StatusIndicator({
  state,
  label,
  details,
  variant = 'inline',
  className = '',
}: StatusIndicatorProps) {
  const meta = VOICE_STATE_META[state];
  const color = `var(${meta.colorVar})`;
  const text = label ?? meta.label;
  const hasDetails = Boolean(details?.length);

  return (
    <div
      className={`flex flex-col items-center gap-2 ${className}`}
      style={
        variant === 'panel'
          ? {
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--line-hairline)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-card)',
            }
          : undefined
      }
      role="status"
      aria-live="polite"
    >
      {/* Primary line — dot + label */}
      <span className="chip">
        <StateDot state={state} />
        <AnimatePresence mode="wait">
          <motion.span
            key={text}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ color }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>

      {/* Developer diagnostics rail */}
      {hasDetails && (
        <motion.div
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          {details!.map((detail, i) => (
            <span key={detail.label} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden style={{ color: 'var(--fg-muted)' }}>
                  ·
                </span>
              )}
              <span
                style={{
                  fontSize: 'var(--text-overline)',
                  fontWeight: 'var(--weight-medium)',
                  letterSpacing: 'var(--tracking-overline)',
                  color: 'var(--fg-muted)',
                }}
              >
                {detail.label}
              </span>
              <span
                className="num"
                style={{
                  fontSize: 'var(--text-micro)',
                  color: detail.emphasis ? 'var(--fg-ink)' : 'var(--fg-body)',
                }}
              >
                {detail.value}
              </span>
            </span>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Per-state dot motion. Each state gets a distinct rhythm so the indicator is
 * legible without relying on hue — required for colorblind readers, and load
 * bearing now that most of the states resolve to the same grey.
 */
const MOTION: Partial<
  Record<VoiceState, { animate: Record<string, number[]>; duration: number }>
> = {
  idle:         { animate: { opacity: [1, 0.4, 1], scale: [1, 0.88, 1] },   duration: 2.6 },
  connecting:   { animate: { opacity: [0.4, 1, 0.4], scale: [0.8, 1.3, 0.8] }, duration: 0.85 },
  listening:    { animate: { opacity: [1, 0.55, 1], scale: [1, 1.18, 1] },  duration: 1.5 },
  thinking:     { animate: { opacity: [0.5, 1, 0.5], scale: [0.9, 1.12, 0.9] }, duration: 0.7 },
  speaking:     { animate: { opacity: [1, 0.6, 1], scale: [1, 1.32, 1] },   duration: 0.5 },
  interrupted:  { animate: { opacity: [1, 0.4, 1], scale: [1, 1.4, 1] },    duration: 0.42 },
  error:        { animate: { opacity: [1, 0.25, 1], scale: [1, 1.1, 1] },   duration: 1.1 },
  disconnected: { animate: { opacity: [0.45, 0.45, 0.45], scale: [1, 1, 1] }, duration: 4 },
};

function StateDot({ state }: { state: VoiceState }) {
  const motionSpec = MOTION[state] ?? MOTION.idle!;

  return (
    <motion.span
      aria-hidden
      className={`chip__dot chip__dot--${VOICE_STATE_META[state].dotTone}`}
      animate={motionSpec.animate}
      transition={{ duration: motionSpec.duration, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
