'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

/**
 * Character-scramble reveal. Each glyph cycles through decode noise before
 * locking in left→right, evoking an AI "decoding" its identity.
 *
 * SSR-safe: the server and first client render both emit the final `text`
 * (good for no-JS + screen readers), then a layout effect swaps to the first
 * scrambled frame *before paint* so there is no flash of the finished word.
 * Honors prefers-reduced-motion by skipping the animation entirely.
 */

const GLYPHS = '01<>[]{}/\\=+*·:—';

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ScrambleTextProps {
  text: string;
  /** Delay before the reveal starts, ms. */
  delay?: number;
  /** Total reveal duration, ms. */
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

function scramble(text: string, revealCount: number): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') out += ' ';
    else if (i < revealCount) out += ch;
    else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }
  return out;
}

export function ScrambleText({
  text,
  delay = 0,
  duration = 900,
  className = '',
  style,
}: ScrambleTextProps) {
  const [display, setDisplay] = useState(text);
  const rafRef = useRef(0);

  useIsomorphicLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(text);
      return;
    }

    // Paint fully scrambled immediately so the finished word never flashes.
    setDisplay(scramble(text, 0));

    let startTs = 0;
    const step = (now: number) => {
      if (!startTs) startTs = now;
      const elapsed = now - startTs - delay;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      const revealCount = Math.floor(progress * text.length);
      setDisplay(progress >= 1 ? text : scramble(text, revealCount));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, delay, duration]);

  return (
    <span className={className} style={style}>
      {/* aria-label on a generic span is unreliably exposed, so the settled text
          is real content and only the decoding frames are hidden. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {display}
      </span>
    </span>
  );
}
