import type { VoiceState } from './types';

/**
 * Visual parameters the orb animates toward for a given voice state.
 *
 * Every field is a shader uniform target (except `ring`, a DOM layer). Adding a
 * new voice state means adding one entry to ORB_STATES — no shader or component
 * changes required.
 */
export interface OrbVisualState {
  /** Curl-noise displacement amplitude — surface turbulence. */
  noiseAmp: number;
  /** Y-axis rotation speed, radians/sec. */
  rotSpeed: number;
  /** Breathing scale amplitude. */
  breathAmp: number;
  /** Breathing frequency. */
  breathSpeed: number;
  /** How strongly noise amplitude pulses over time (0 = steady). */
  ampPulse: number;
  /** Radial contraction 0..1 — particles converge toward the shell. */
  converge: number;
  /** Ripple displacement gain along the surface normal, scaled by live audio. */
  ripple: number;
  /** How much live audio level feeds energy/scale. 0 = ignore audio entirely. */
  audioReactive: number;
  /** Ramp slot for the core particles. */
  colorBase: OrbRampKey;
  /** Ramp slot for the ~15% highlight particles. */
  colorAccent: OrbRampKey;
  /** Overall particle opacity. */
  opacity: number;
  /** Outer energy-ring intensity 0..1 — rendered as a DOM layer. */
  ring: number;
  /** Per-frame lerp rate toward this state. Higher = snappier arrival. */
  enterRate?: number;
}

/**
 * The orb's palette, expressed as slots on the product-accent ramp instead of
 * literal colours. Every entry is a CSS custom property derived from
 * `--product-accent`, so recolouring the app's one product visual is a single
 * edit and the light/dark flip is honoured for free. A hex literal here would
 * break both.
 *
 * States are told apart by their position on the ramp and by motion, never by a
 * second hue — a violet "thinking" orb and a green "speaking" orb are five
 * palettes pretending to be one. The two non-accent slots are deliberate:
 * `muted` because an inert orb carries no product colour, and `error` because a
 * failed session is a status, which is the other place hue is licensed.
 */
export const ORB_RAMP = {
  tint1: '--accent-tint-1',
  tint2: '--accent-tint-2',
  tint3: '--accent-tint-3',
  accent: '--product-accent',
  shade1: '--accent-shade-1',
  shade2: '--accent-shade-2',
  muted: '--fg-muted',
  error: '--status-error',
} as const;

export type OrbRampKey = keyof typeof ORB_RAMP;

/**
 * Parser guard, not a design decision — deliberately achromatic so it can never
 * be mistaken for the accent or drift out of sync with it. Reached only without
 * a document, or on a browser that cannot resolve `color-mix()`.
 */
const RAMP_GUARD = 'rgb(255, 255, 255)';

/**
 * Resolve the ramp to concrete `rgb()` strings.
 *
 * A custom property's computed value is an unresolved token stream, so reading
 * `--accent-tint-1` back gives the literal `color-mix(…)` text, which no colour
 * parser accepts. Assigning it to a real colour property and reading *that* back
 * hands over a value the browser has already resolved — which keeps the mix
 * ratios in globals.css as their single definition rather than duplicating them
 * in JS.
 *
 * Reads the live cascade, so the answer follows the active theme. Called once per
 * mount and once per theme flip; never from a render loop.
 */
export function resolveOrbRamp(): Record<OrbRampKey, string> {
  const keys = Object.keys(ORB_RAMP) as OrbRampKey[];
  const out = {} as Record<OrbRampKey, string>;

  if (typeof document === 'undefined') {
    for (const key of keys) out[key] = RAMP_GUARD;
    return out;
  }

  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'fixed';
  probe.style.width = '0';
  probe.style.height = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);

  for (const key of keys) {
    probe.style.color = `var(${ORB_RAMP[key]})`;
    out[key] = getComputedStyle(probe).color || RAMP_GUARD;
  }

  probe.remove();
  return out;
}

export const ORB_STATES: Record<VoiceState, OrbVisualState> = {
  /** Slow breathing, subtle drift, ambient glow. The resting signature. */
  idle: {
    noiseAmp: 0.10,
    rotSpeed: 0.020,
    breathAmp: 0.105,
    breathSpeed: 0.85,
    ampPulse: 0,
    converge: 0,
    ripple: 0,
    audioReactive: 0,
    colorBase: 'accent',
    colorAccent: 'tint2',
    opacity: 0.92,
    ring: 0.18,
  },

  /** Particles pull inward and accelerate — a connection drawing together. */
  connecting: {
    noiseAmp: 0.042,
    rotSpeed: 0.085,
    breathAmp: 0.05,
    breathSpeed: 2.7,
    ampPulse: 0.40,
    converge: 0.20,
    ripple: 0,
    audioReactive: 0,
    colorBase: 'accent',
    colorAccent: 'tint1',
    opacity: 0.96,
    ring: 0.55,
    enterRate: 0.11,
  },

  /** Calm shell that ripples outward in response to microphone input. */
  listening: {
    noiseAmp: 0.082,
    rotSpeed: 0.026,
    breathAmp: 0.085,
    breathSpeed: 1.25,
    ampPulse: 0.10,
    converge: 0,
    ripple: 0.20,
    audioReactive: 1.0,
    colorBase: 'accent',
    colorAccent: 'tint2',
    opacity: 0.94,
    ring: 0.32,
  },

  /**
   * Internal turbulence — energetic but controlled, never chaotic. A deeper core
   * under hot flecks: the work reads as happening inside the shell.
   */
  thinking: {
    noiseAmp: 0.205,
    rotSpeed: 0.058,
    breathAmp: 0.055,
    breathSpeed: 2.1,
    ampPulse: 0.60,
    converge: 0,
    ripple: 0,
    audioReactive: 0,
    colorBase: 'shade1',
    colorAccent: 'tint1',
    opacity: 0.95,
    ring: 0.42,
  },

  /** Pulse synchronized to TTS playback, with a responsive outer ring. */
  speaking: {
    noiseAmp: 0.145,
    rotSpeed: 0.042,
    breathAmp: 0.145,
    breathSpeed: 2.9,
    ampPulse: 1.0,
    converge: 0,
    ripple: 0.13,
    audioReactive: 1.0,
    colorBase: 'accent',
    colorAccent: 'tint1',
    opacity: 0.97,
    ring: 0.75,
  },

  /**
   * Brief acknowledgement that the caller cut in: a quick ripple that settles
   * straight back toward listening. Shape and size are held and the hue does not
   * move — the whole shell lifts a few rungs up the ramp instead, so it reads as
   * a flash of brightness rather than a transformation into something else.
   */
  interrupted: {
    noiseAmp: 0.092,
    rotSpeed: 0.03,
    breathAmp: 0.09,
    breathSpeed: 1.6,
    ampPulse: 0.35,
    converge: 0,
    ripple: 0.16,
    audioReactive: 0.7,
    colorBase: 'tint3',
    colorAccent: 'tint1',
    opacity: 0.95,
    ring: 0.5,
    enterRate: 0.2,
  },

  /** Dimmed and slowed — present but inert, so it carries no product colour. */
  disconnected: {
    noiseAmp: 0.06,
    rotSpeed: 0.008,
    breathAmp: 0.04,
    breathSpeed: 0.5,
    ampPulse: 0,
    converge: 0.10,
    ripple: 0,
    audioReactive: 0,
    colorBase: 'muted',
    colorAccent: 'muted',
    opacity: 0.40,
    ring: 0.05,
  },

  /**
   * Unmistakably different: expanded, agitated, barely rotating. The one state
   * that leaves the accent ramp, because a failed session is a status and should
   * stay red whatever the product accent is set to.
   */
  error: {
    noiseAmp: 0.235,
    rotSpeed: 0.006,
    breathAmp: 0.035,
    breathSpeed: 0.45,
    ampPulse: 0.85,
    converge: -0.08,
    ripple: 0,
    audioReactive: 0,
    colorBase: 'error',
    colorAccent: 'error',
    opacity: 0.90,
    ring: 0.60,
    enterRate: 0.16,
  },
};

/**
 * Light theme walks *down* the same ramp rather than switching palette. Dark
 * composites the particles additively, so a mid-ramp shell glows; light uses
 * normal blending on a white canvas, where the same value would wash out. Both
 * themes are the one accent — this only picks the rung that survives the
 * background.
 */
const LIGHT_COLORS: Partial<
  Record<VoiceState, Pick<OrbVisualState, 'colorBase' | 'colorAccent' | 'opacity'>>
> = {
  idle:         { colorBase: 'shade1', colorAccent: 'accent', opacity: 0.88 },
  connecting:   { colorBase: 'shade1', colorAccent: 'accent', opacity: 0.92 },
  listening:    { colorBase: 'shade1', colorAccent: 'accent', opacity: 0.90 },
  thinking:     { colorBase: 'shade2', colorAccent: 'accent', opacity: 0.92 },
  speaking:     { colorBase: 'shade1', colorAccent: 'accent', opacity: 0.94 },
  interrupted:  { colorBase: 'accent', colorAccent: 'shade1', opacity: 0.93 },
  disconnected: { colorBase: 'muted',  colorAccent: 'muted',  opacity: 0.45 },
  error:        { colorBase: 'error',  colorAccent: 'error',  opacity: 0.90 },
};

/** Resolve orb visuals for the active color theme. */
export function resolveOrbState(
  state: VoiceState,
  theme: 'dark' | 'light' = 'dark',
): OrbVisualState {
  const base = ORB_STATES[state] ?? ORB_STATES.idle;
  if (theme !== 'light') return base;
  const light = LIGHT_COLORS[state];
  return light ? { ...base, ...light } : base;
}

/** Numeric fields the render loop lerps generically. */
export const ORB_NUMERIC_KEYS = [
  'noiseAmp',
  'rotSpeed',
  'breathAmp',
  'breathSpeed',
  'ampPulse',
  'converge',
  'ripple',
  'audioReactive',
  'opacity',
  'ring',
] as const satisfies readonly (keyof OrbVisualState)[];

export type OrbNumericKey = (typeof ORB_NUMERIC_KEYS)[number];

export const DEFAULT_ENTER_RATE = 0.07;
