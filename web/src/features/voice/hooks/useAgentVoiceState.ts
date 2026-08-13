'use client';

import { useMemo } from 'react';
import { ConnectionState } from 'livekit-client';
import {
  useConnectionState,
  useVoiceAssistant,
} from '@livekit/components-react';
import type { VoiceState } from '../types';

/**
 * Single source of truth for the canonical VoiceState, derived from LiveKit.
 *
 * Precedence:
 *   1. Local room connection → connecting / disconnected.
 *   2. Raw `lk.agent.state` participant attribute read directly from the
 *      participant object — avoids useParticipantAttribute which requires a
 *      ParticipantContext and throws when agent is null on mount.
 */
export function useAgentVoiceState(): VoiceState {
  const connectionState = useConnectionState();
  const { agent } = useVoiceAssistant();

  // Read the raw string attribute directly — covers 'error' which the SDK's
  // typed AgentState enum does not include.
  const rawState = agent?.attributes?.['lk.agent.state'];

  return useMemo<VoiceState>(() => {
    if (
      connectionState === ConnectionState.Connecting ||
      connectionState === ConnectionState.Reconnecting
    ) {
      return 'connecting';
    }

    if (connectionState === ConnectionState.Disconnected) {
      return 'disconnected';
    }

    switch (rawState) {
      case 'thinking':
        return 'thinking';
      case 'speaking':
        return 'speaking';
      case 'listening':
        return 'listening';
      case 'error':
        return 'error';
      default:
        return 'listening';
    }
  }, [connectionState, rawState]);
}
