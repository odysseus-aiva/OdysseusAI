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
  /** Core particle hue. */
  colorBase: string;
  /** Tint hue applied to the ~15% accent particles. */
  colorAccent: string;
  /** Overall particle opacity. */
  opacity: number;
  /** Outer energy-ring intensity 0..1 — rendered as a DOM layer. */
  ring: number;
  /** Per-frame lerp rate toward this state. Higher = snappier arrival. */
  enterRate?: number;
}

/** Cyan → violet is the platform's resting identity (dark theme). */
const CYAN = '#00c8e8';
const VIOLET = '#7b2fff';
const GREEN = '#34d97e';
const ROSE = '#fb7185';
const AMBER = '#fbbf24';

/** Light theme: near-black shell so the orb reads on a white field. */
const INK = '#000000';
const INK_SOFT = '#1a1a1a';
const INK_MID = '#0d0d0d';
const INK_GREEN = '#0a140c';

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
    colorBase: CYAN,
    colorAccent: VIOLET,
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
    colorBase: CYAN,
    colorAccent: CYAN,
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
    colorBase: CYAN,
    colorAccent: VIOLET,
    opacity: 0.94,
    ring: 0.32,
  },

  /** Internal turbulence — energetic but controlled, never chaotic. */
  thinking: {
    noiseAmp: 0.205,
    rotSpeed: 0.058,
    breathAmp: 0.055,
    breathSpeed: 2.1,
    ampPulse: 0.60,
    converge: 0,
    ripple: 0,
    audioReactive: 0,
    colorBase: VIOLET,
    colorAccent: CYAN,
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
    colorBase: GREEN,
    colorAccent: CYAN,
    opacity: 0.97,
    ring: 0.75,
  },

  /** Dimmed and slowed — present but inert. */
  disconnected: {
    noiseAmp: 0.06,
    rotSpeed: 0.008,
    breathAmp: 0.04,
    breathSpeed: 0.5,
    ampPulse: 0,
    converge: 0.10,
    ripple: 0,
    audioReactive: 0,
    colorBase: '#4a5568',
    colorAccent: '#4a5568',
    opacity: 0.40,
    ring: 0.05,
  },

  /** Unmistakably different: rose, expanded, agitated, barely rotating. */
  error: {
    noiseAmp: 0.235,
    rotSpeed: 0.006,
    breathAmp: 0.035,
    breathSpeed: 0.45,
    ampPulse: 0.85,
    converge: -0.08,
    ripple: 0,
    audioReactive: 0,
    colorBase: ROSE,
    colorAccent: AMBER,
    opacity: 0.90,
    ring: 0.60,
    enterRate: 0.16,
  },
};

/** Light-theme color overrides — black/charcoal on white (error stays rose). */
const LIGHT_COLORS: Partial<
  Record<VoiceState, Pick<OrbVisualState, 'colorBase' | 'colorAccent' | 'opacity'>>
> = {
  idle:         { colorBase: INK, colorAccent: INK_SOFT, opacity: 0.88 },
  connecting:   { colorBase: INK_MID, colorAccent: INK_MID, opacity: 0.92 },
  listening:    { colorBase: INK, colorAccent: INK_SOFT, opacity: 0.90 },
  thinking:     { colorBase: INK_MID, colorAccent: INK_SOFT, opacity: 0.92 },
  speaking:     { colorBase: INK_GREEN, colorAccent: INK, opacity: 0.94 },
  disconnected: { colorBase: '#6b7280', colorAccent: '#6b7280', opacity: 0.45 },
  error:        { colorBase: ROSE, colorAccent: AMBER, opacity: 0.90 },
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
