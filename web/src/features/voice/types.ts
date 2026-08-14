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
  /**
   * Colour token for the status readout. Status is one of only two places hue
   * is licensed, so this is either a `--status-*` token or neutral ink — never
   * the product accent, which belongs to the orb alone. Most of the lifecycle
   * is a neutral label: "listening" and "thinking" are not statuses, they are
   * the app working, and colouring them is chrome wearing colour.
   */
  colorVar: string;
  /** `.chip__dot--*` modifier for the status dot. */
  dotTone: 'success' | 'warning' | 'error' | 'neutral';
}

export const VOICE_STATE_META: Record<VoiceState, VoiceStateMeta> = {
  idle: { label: 'Ready', colorVar: '--fg-body', dotTone: 'neutral' },
  connecting: { label: 'Connecting', colorVar: '--fg-body', dotTone: 'neutral' },
  listening: { label: 'Listening', colorVar: '--fg-body', dotTone: 'neutral' },
  thinking: { label: 'Thinking', colorVar: '--fg-body', dotTone: 'neutral' },
  speaking: { label: 'Speaking', colorVar: '--status-success', dotTone: 'success' },
  interrupted: { label: 'Interrupted', colorVar: '--status-warning', dotTone: 'warning' },
  disconnected: { label: 'Ended', colorVar: '--fg-muted', dotTone: 'neutral' },
  error: { label: 'Connection error', colorVar: '--status-error', dotTone: 'error' },
};
