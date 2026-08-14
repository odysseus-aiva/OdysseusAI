import type { RoomOptions } from 'livekit-client';

/**
 * Room connection options tuned for a voice-only agent experience.
 * Centralized so audio presets and adaptive settings live in one place.
 */
export const voiceRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // Voice-optimized capture: echo cancellation + noise suppression on.
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  },
  // Hard-stop the MediaStreamTrack on mute so the OS mic indicator clears and
  // no residual capture reaches local analysers / captions while muted.
  publishDefaults: {
    stopMicTrackOnMute: true,
  },
};

/** Identity prefix the backend uses for the agent participant. */
export const AGENT_IDENTITY_PREFIX = 'agent-';
