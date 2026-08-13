/**
 * Canonical voice state that drives every animation and readout.
 * Transport-level states (LiveKit connection + agent attributes) are mapped
 * into this union so the UI never branches on WebRTC details.
 */
export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'disconnected'
  | 'error';

/** The lifecycle phase of the app's own connection flow (pre-LiveKit). */
export type ConnectionPhase =
  | 'idle'
  | 'requesting' // fetching token from BFF
  | 'connected'
  | 'error';

export interface VoiceStateMeta {
  label: string;
  /** CSS color token name for this state's accent. */
  colorVar: string;
}

export const VOICE_STATE_META: Record<VoiceState, VoiceStateMeta> = {
  idle: { label: 'Ready', colorVar: '--color-accent' },
  connecting: { label: 'Connecting', colorVar: '--color-accent' },
  listening: { label: 'Listening', colorVar: '--color-state-listening' },
  thinking: { label: 'Thinking', colorVar: '--color-state-thinking' },
  speaking: { label: 'Speaking', colorVar: '--color-state-speaking' },
  interrupted: { label: 'Interrupted', colorVar: '--color-state-warning' },
  disconnected: { label: 'Ended', colorVar: '--color-text-muted' },
  error: { label: 'Connection error', colorVar: '--color-state-error' },
};
