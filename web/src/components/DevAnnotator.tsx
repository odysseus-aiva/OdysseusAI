'use client';

import dynamic from 'next/dynamic';

/**
 * Dev-only visual feedback toolbar (Agentation). Lets a non-developer click any
 * element on a running screen, add a note, and copy structured output
 * (selectors, CSS classes, positions, nearby text) to paste to the coding
 * agent — so "the blue button in the sidebar" becomes an exact selector.
 *
 * Client-only: it renders through a portal and reads `document`, so SSR is
 * disabled. Rendered only outside production, so it never ships to end users.
 */
const Agentation = dynamic(() => import('agentation').then((m) => m.Agentation), {
  ssr: false,
});

export function DevAnnotator() {
  if (process.env.NODE_ENV === 'production') return null;
  return <Agentation />;
}
