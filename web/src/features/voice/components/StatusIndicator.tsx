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
  /** Renders the value in the state accent color instead of muted ink. */
  emphasis?: boolean;
}

interface StatusIndicatorProps {
  state: VoiceState;
  /** Optional override for the state's default label. */
  label?: string;
  /** Developer-mode diagnostics rail. Hidden entirely when empty. */
  details?: StatusDetail[];
  /** `inline` for the hero; `panel` for in-call, which adds a glass surface. */
  variant?: 'inline' | 'panel';
  className?: string;
}

/**
 * Minimal, extensible readout of system readiness. Communicates state through
 * text + a motion signature (never color alone), and carries an optional
 * diagnostics rail for developer mode.
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
      className={`flex flex-col items-center gap-2.5 ${
        variant === 'panel' ? 'rounded-[12px] px-4 py-3' : ''
      } ${className}`}
      style={
        variant === 'panel'
          ? {
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
              backdropFilter: 'blur(12px)',
            }
          : undefined
      }
      role="status"
      aria-live="polite"
    >
      {/* Primary line — dot + label */}
      <div className="flex items-center gap-2">
        <StateDot state={state} color={color} />
        <AnimatePresence mode="wait">
          <motion.span
            key={text}
            initial={{ opacity: 0, y: 3, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -3, filter: 'blur(3px)' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="text-[12px] font-[500] tracking-[0.02em] tabular-nums"
            style={{ color }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Developer diagnostics rail */}
      {hasDetails && (
        <motion.div
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
          {details!.map((detail, i) => (
            <span key={detail.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <span
                  aria-hidden
                  className="inline-block rounded-full"
                  style={{ width: 2, height: 2, background: 'var(--color-text-faint)' }}
                />
              )}
              <span
                className="text-[10px] font-[500] uppercase tracking-[0.11em]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                {detail.label}
              </span>
              <span
                className="text-[10.5px] font-mono tabular-nums"
                style={{ color: detail.emphasis ? color : 'var(--color-text-muted)' }}
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
 * legible without relying on hue — required for colorblind readers.
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

function StateDot({ state, color }: { state: VoiceState; color: string }) {
  const motionSpec = MOTION[state] ?? MOTION.idle!;

  return (
    <span className="relative flex items-center justify-center" style={{ width: 7, height: 7 }}>
      {/* Expanding halo — only for states with outward energy */}
      {(state === 'speaking' || state === 'connecting') && (
        <motion.span
          aria-hidden
          className="absolute rounded-full"
          style={{ width: 7, height: 7, border: `1px solid ${color}` }}
          animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
          transition={{ duration: motionSpec.duration * 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <motion.span
        className="rounded-full"
        style={{ width: 6, height: 6, background: color, boxShadow: `0 0 8px ${color}` }}
        animate={motionSpec.animate}
        transition={{ duration: motionSpec.duration, repeat: Infinity, ease: 'easeInOut' }}
      />
    </span>
  );
}
