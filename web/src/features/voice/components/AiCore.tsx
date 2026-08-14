'use client';

import { motion } from 'motion/react';
import type { VoiceState } from '../types';

/**
 * A CSS-gradient orb: the same product visual as ParticleOrb, built out of
 * layered gradients rather than a point cloud. Pure/presentational — takes
 * VoiceState and level.
 *
 * Architecture: stacked layers inside an overflow:hidden sphere container. Each
 * layer runs at a different frequency so their emergent interference reads as
 * organic motion rather than a programmed loop. A specular highlight translates
 * between state-specific positions, implying the sphere is a 3D object whose
 * orientation (or the light source) is shifting.
 *
 * live `level` is applied only via CSS transform on the outer sphere div so it
 * never restarts any Framer Motion loop — the loops run forever, undisturbed.
 *
 * Every colour here comes off the `--product-accent` ramp, so this recolours with
 * the rest of the product visual and flips with the theme. States are told apart
 * by rhythm and by depth on the ramp, never by a second hue.
 *
 * Not currently mounted. If it is ever put on screen, note that its rotating
 * layers are composited: Chrome will not repaint them when only a custom
 * property feeding their gradients changes, so a runtime accent swap needs the
 * animation restarted the way ParticleOrb does it.
 */

interface AiCoreProps {
  state: VoiceState;
  level?: number;
}

const coreAnimation: Record<VoiceState, { scale: number[]; duration: number }> = {
  idle: { scale: [1, 1.03, 1], duration: 6 },
  connecting: { scale: [1, 1.1, 1], duration: 1.4 },
  listening: { scale: [1, 1.04, 1], duration: 3.5 },
  thinking: { scale: [1, 1.07, 0.97, 1.04, 1], duration: 2.2 },
  speaking: { scale: [1, 1.07, 1.02, 1.06, 1], duration: 1.2 },
  interrupted: { scale: [1, 1.08, 1], duration: 0.9 },
  disconnected: { scale: [1, 1, 1], duration: 8 },
  error: { scale: [1, 1.02, 1], duration: 4 },
};

// Seconds per full nebula rotation — slow = contemplative, fast = active
const NEBULA_SPEED: Record<VoiceState, number> = {
  idle: 24,
  connecting: 6,
  listening: 16,
  thinking: 4,
  speaking: 8,
  interrupted: 10,
  disconnected: 48,
  error: 10,
};

// Specular highlight position (translate from its default top-left anchor).
// When this shifts between states, the sphere reads as a 3D object turning
// or the light source moving — this is the single biggest "alive" signal.
const SPECULAR: Record<VoiceState, { x: number; y: number; scale: number; opacity: number }> = {
  idle: { x: 0, y: 0, scale: 1, opacity: 0.72 },
  connecting: { x: 8, y: -6, scale: 1.12, opacity: 0.88 },
  listening: { x: -8, y: 12, scale: 0.88, opacity: 0.6 },
  thinking: { x: 38, y: 58, scale: 1.35, opacity: 0.42 }, // drifts inward — "looking in"
  speaking: { x: -8, y: -12, scale: 1.18, opacity: 1 },
  interrupted: { x: -6, y: 10, scale: 0.92, opacity: 0.7 },
  disconnected: { x: 0, y: 22, scale: 0.75, opacity: 0.22 },
  error: { x: 22, y: 22, scale: 0.85, opacity: 0.48 },
};

const loop = (duration: number) => ({
  duration,
  repeat: Infinity,
  ease: 'easeInOut' as const,
});

export function AiCore({ state, level = 0 }: AiCoreProps) {
  const anim = coreAnimation[state];
  const isActive = state !== 'idle' && state !== 'disconnected';
  const isSpeaking = state === 'speaking';
  const isThinking = state === 'thinking';
  const nebulaSpeed = NEBULA_SPEED[state];
  const specular = SPECULAR[state];

  // Thinking sits one rung deeper on the ramp so the turbulence reads as
  // internal — the same trick the particle orb uses, and not a second hue.
  const core = isThinking ? 'var(--accent-shade-1)' : 'var(--product-accent)';
  const coreDeep = isThinking ? 'var(--accent-shade-2)' : 'var(--accent-shade-1)';

  // Live audio level applied via CSS only — never restarts loop
  const levelScale = isSpeaking ? 1 + Math.min(level, 0.85) * 0.12 : 1;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 360, height: 360 }}>

      {/* ── Far bloom — illuminates the scene around the orb ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 520,
          height: 520,
          background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 58%)',
          filter: 'blur(40px)',
        }}
        animate={{
          opacity: isActive ? [0.55, 0.82, 0.55] : [0.38, 0.58, 0.38],
          scale: anim.scale,
        }}
        transition={loop(anim.duration)}
      />

      {/* ── Offset secondary bloom — breaks radial symmetry ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 300,
          height: 300,
          top: 70,
          left: 20,
          background: 'radial-gradient(circle, var(--accent-veil) 0%, transparent 65%)',
          filter: 'blur(28px)',
        }}
        animate={{ opacity: isActive ? [0.35, 0.58, 0.35] : [0.22, 0.38, 0.22] }}
        transition={loop(anim.duration * 1.4)}
      />

      {/* ── Outer atmosphere ring ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 318,
          height: 318,
          boxShadow: '0 0 0 1px var(--accent-veil), 0 0 28px var(--accent-wash)',
        }}
        animate={{
          opacity: isSpeaking ? [0.38, 0.82, 0.38] : isActive ? [0.18, 0.48, 0.18] : 0.1,
          scale: anim.scale,
        }}
        transition={loop(anim.duration)}
      />

      {/* ── Inner corona ring ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 258,
          height: 258,
          boxShadow: '0 0 0 1px var(--accent-veil)',
        }}
        animate={{
          opacity: isActive ? [0.22, 0.58, 0.22] : 0.1,
          scale: anim.scale,
        }}
        transition={loop(anim.duration * 0.88)}
      />

      {/* ── Rotating aura band — the orbital field ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 290,
          height: 290,
          background:
            'conic-gradient(from 0deg, transparent 0%, var(--accent-veil) 22%, var(--accent-wash) 42%, transparent 55%)',
          maskImage: 'radial-gradient(circle, transparent 54%, black 58%, black 68%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 54%, black 58%, black 68%, transparent 72%)',
        }}
        animate={{
          rotate: 360,
          opacity: isActive ? [0.28, 0.55, 0.28] : 0.1,
        }}
        transition={{
          rotate: { duration: isThinking ? 2.8 : 20, repeat: Infinity, ease: 'linear' },
          opacity: loop(anim.duration),
        }}
      />

      {/* ── Listening ripples — expands outward from sphere ── */}
      {state === 'listening' &&
        [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 218,
              height: 218,
              border: '1px solid var(--accent-veil)',
            }}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{
              duration: 2.8,
              delay: i * 0.93,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        ))}

      {/* ── Core sphere system ── */}
      <motion.div
        className="relative flex items-center justify-center"
        animate={{ scale: anim.scale }}
        transition={loop(anim.duration)}
      >
        {/*
         * Two-div structure:
         *   Outer: holds the orb's shadow (bloom + shadowed hemisphere) and the
         *          level-scale transform
         *   Inner: overflow:hidden clips all rotating gradient layers
         */}
        <div
          className="relative rounded-full"
          style={{
            width: 212,
            height: 212,
            transform: `scale(${levelScale})`,
            transformOrigin: 'center',
            willChange: 'transform',
            boxShadow: 'var(--shadow-orb)',
          }}
        >
          {/* Inner clipping sphere — no blend modes, direct layered gradients */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            {/* Layer 1: Base — bottoms out in the canvas rather than pure black,
                which would dissolve the sphere into the page on dark */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 48% 52%, ${coreDeep} 0%, var(--accent-shade-2) 55%, var(--bg-app) 100%)`,
              }}
            />

            {/* Layer 2: Core color bloom */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 60%, var(--accent-tint-3) 0%, ${core} 28%, transparent 55%)`,
              }}
              animate={{ opacity: isActive ? [0.75, 1, 0.75] : [0.68, 0.92, 0.68] }}
              transition={loop(anim.duration)}
            />

            {/* Layer 3: Rotating nebula A */}
            <motion.div
              className="absolute"
              style={{ inset: '-14px' }}
              animate={{ rotate: 360 }}
              transition={{ duration: nebulaSpeed, repeat: Infinity, ease: 'linear' }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 0deg at 44% 40%, transparent 0%, var(--accent-veil) 18%, transparent 38%, var(--accent-wash) 58%, transparent 75%)',
                }}
              />
            </motion.div>

            {/* Layer 4: Counter-rotating nebula B */}
            <motion.div
              className="absolute"
              style={{ inset: '-10px' }}
              animate={{ rotate: -360 }}
              transition={{ duration: nebulaSpeed * 1.65, repeat: Infinity, ease: 'linear' }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'conic-gradient(from 90deg at 56% 58%, transparent 0%, var(--accent-wash) 25%, transparent 48%)',
                }}
              />
            </motion.div>

            {/* Layer 5: Rim scatter */}
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 90% 50% at 50% 100%, var(--accent-glow), transparent 62%)',
              }}
              animate={{ opacity: isActive ? [0.4, 0.72, 0.4] : [0.32, 0.55, 0.32] }}
              transition={loop(anim.duration * 0.72)}
            />

            {/* Layer 6: Top-left specular highlight — the 3D implication */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 104,
                height: 104,
                background:
                  'radial-gradient(circle, var(--orb-ring) 0%, var(--accent-tint-1) 40%, transparent 70%)',
                top: -22,
                left: -16,
                filter: 'blur(2px)',
                willChange: 'transform, opacity',
              }}
              animate={{
                x: specular.x,
                y: specular.y,
                scale: specular.scale,
                opacity: specular.opacity,
              }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Layer 7: Secondary fill light — fills the shadowed hemisphere */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 70% 72%, var(--accent-veil), transparent 52%)',
              }}
            />

            {/* Thinking shimmer */}
            {isThinking && [0, 1].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 12,
                  height: 12,
                  background: 'var(--orb-ring)',
                  top: 48 + i * 72,
                  left: 32 + i * 98,
                  filter: 'blur(5px)',
                }}
                animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1.3, 0.5] }}
                transition={{
                  duration: 1.1 + i * 0.4,
                  delay: i * 0.7,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
