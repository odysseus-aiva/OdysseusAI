import { create } from 'zustand';
import type { SessionConnection } from '@/lib/api/session';
import type { ConnectionPhase } from '../types';

/**
 * App-level voice session state that lives OUTSIDE the LiveKit React context —
 * the connection lifecycle, the active connection envelope, and any error.
 * LiveKit runtime state (participants, tracks, agent state) is read from
 * LiveKit hooks and never duplicated here.
 */
interface VoiceStore {
  phase: ConnectionPhase;
  connection: SessionConnection | null;
  error: string | null;

  startRequest: () => void;
  setConnected: (connection: SessionConnection) => void;
  setError: (message: string) => void;
  /** Mark an agent-side error mid-call so reset() after LiveKit disconnect
   *  lands on the error phase instead of idle. */
  signalAgentError: () => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  phase: 'idle',
  connection: null,
  error: null,

  startRequest: () => set({ phase: 'requesting', error: null }),
  setConnected: (connection) => set({ phase: 'connected', connection }),
  setError: (message) => set({ phase: 'error', error: message }),
  signalAgentError: () => set({ phase: 'error', error: 'The agent encountered an error and ended the session.' }),
  reset: () => set((s) => s.phase === 'error'
    ? s  // preserve error — LiveKit disconnect must not wipe it
    : { phase: 'idle', connection: null, error: null }),
}));
