'use client';

import { useMemo } from 'react';
import {
  RoomAudioRenderer,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';
import { motion } from 'motion/react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { Agent } from '@/lib/api/agents';
import { useAgentVoiceState } from '../hooks/useAgentVoiceState';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { useLiveTranscript } from '../hooks/useLiveTranscript';
import { ParticleOrb } from './ParticleOrb';
import { StatusIndicator, type StatusDetail } from './StatusIndicator';
import { AudioControls } from './AudioControls';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';

interface VoiceRoomProps {
  /** Resolved agent for the session — drives the diagnostics rail. */
  agent?: Agent | null;
  /** Call id from session start — resets the live transcript on reconnect. */
  callId: string;
  onDisconnect: () => void;
  onReconnect: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  anthropic: 'Claude',
  deepgram: 'Deepgram',
  elevenlabs: 'ElevenLabs',
  cartesia: 'Cartesia',
};

function providerName(id: string | undefined, fallback: string): string {
  const key = (id ?? fallback).toLowerCase();
  return PROVIDER_LABELS[key] ?? (id ?? fallback);
}

/**
 * Rendered INSIDE the LiveKit RoomContext. Wires LiveKit hooks to the
 * presentational components. RoomAudioRenderer transparently plays the agent's
 * audio track — the user hears the agent with zero manual wiring.
 */
export function VoiceRoom({ agent, callId, onDisconnect, onReconnect }: VoiceRoomProps) {
  const voiceState = useAgentVoiceState();
  const { audioTrack } = useVoiceAssistant();
  const { microphoneTrack } = useLocalParticipant();
  const { lines, ready } = useLiveTranscript(callId);

  // Listening reads the user's mic; speaking reads the agent's output. Sampling
  // only the relevant track keeps one AnalyserNode alive at a time.
  const isSpeaking = voiceState === 'speaking';
  const agentTrack = audioTrack?.publication?.track as RemoteAudioTrack | undefined;
  const micTrack = microphoneTrack?.track as LocalAudioTrack | undefined;

  const { level: agentLevel } = useAudioLevel(agentTrack, isSpeaking);
  const { level: micLevel } = useAudioLevel(micTrack, !isSpeaking);
  const audioLevel = isSpeaking ? agentLevel : micLevel;

  const details: StatusDetail[] = useMemo(() => {
    const rail: StatusDetail[] = [
      { label: 'LLM', value: providerName(agent?.defaultProviders?.llm, 'openai') },
      { label: 'STT', value: providerName(agent?.defaultProviders?.stt, 'deepgram') },
      { label: 'TTS', value: providerName(agent?.defaultProviders?.tts, 'openai') },
    ];
    return rail;
  }, [agent]);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 py-8">
      {/* Plays all remote (agent) audio automatically */}
      <RoomAudioRenderer />

      <div className="flex w-full max-w-6xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-12">
        {/* Orb column */}
        <div className="flex w-full max-w-[360px] flex-col items-center gap-10">
          <div className="flex w-full max-w-[320px] justify-center">
            <ParticleOrb size={320} state={voiceState} audioLevel={audioLevel} />
          </div>

          <div className="flex flex-col items-center gap-4">
            <StatusIndicator state={voiceState} details={details} />
            <LevelMeter level={audioLevel} active={voiceState === 'listening' || isSpeaking} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassPanel className="flex flex-col items-center gap-2.5 px-5 py-3.5">
              <span
                className="text-[9.5px] font-[600] uppercase tracking-[0.22em]"
                style={{ color: 'var(--color-text-faint)' }}
              >
                Session
              </span>
              <AudioControls onDisconnect={onDisconnect} onReconnect={onReconnect} />
            </GlassPanel>
          </motion.div>
        </div>

        {/* Live captions — beside orb on desktop, under controls on mobile */}
        <motion.div
          className="w-full max-w-md lg:max-w-[380px]"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.28, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <LiveTranscriptPanel
            lines={lines}
            ready={ready}
            agentName={agent?.name ?? 'Agent'}
          />
        </motion.div>
      </div>
    </div>
  );
}

const BAR_COUNT = 9;
/** Bars taper from the center so the meter reads as one form, not a row. */
const BAR_WEIGHTS = [0.35, 0.55, 0.78, 0.94, 1, 0.94, 0.78, 0.55, 0.35];

/**
 * Symmetric level meter driven by real RMS. Uses scaleY (compositor-only) so a
 * per-frame audio signal never triggers layout.
 */
function LevelMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <div
      className="flex items-center justify-center gap-[3px]"
      style={{ height: 22 }}
      aria-hidden
    >
      {BAR_WEIGHTS.slice(0, BAR_COUNT).map((weight, i) => {
        const scale = active ? Math.max(0.12, level * weight) : 0.08;
        return (
          <span
            key={i}
            className="rounded-full origin-center"
            style={{
              width: 2.5,
              height: 22,
              background: 'var(--color-accent)',
              opacity: active ? 0.35 + level * weight * 0.65 : 0.16,
              transform: `scaleY(${scale})`,
              transition:
                'transform 90ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms var(--ease-fluid)',
            }}
          />
        );
      })}
    </div>
  );
}
