'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';

/**
 * Ambient floating particle field for the background. Purely decorative;
 * deterministic layout (index-seeded) so it renders identically on server and
 * client. Respects prefers-reduced-motion via the global CSS override.
 */
export function Particles({ count = 28 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Deterministic pseudo-random from index — avoids hydration mismatch.
        const seed = (i * 9301 + 49297) % 233280;
        const rnd = seed / 233280;
        const rnd2 = ((i * 4099 + 7919) % 233280) / 233280;
        return {
          left: `${rnd * 100}%`,
          top: `${rnd2 * 100}%`,
          size: 1 + rnd * 2.5,
          duration: 8 + rnd2 * 12,
          delay: rnd * 6,
        };
      }),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-[var(--color-accent)]"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            opacity: 0.25,
          }}
          animate={{ y: [0, -24, 0], opacity: [0.1, 0.4, 0.1] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
