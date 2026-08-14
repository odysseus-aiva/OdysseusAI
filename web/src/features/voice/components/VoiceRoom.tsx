'use client';

import { useEffect, useState } from 'react';
import {
  RoomAudioRenderer,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import type { Agent } from '@/lib/api/agents';
import { useAgentVoiceState } from '../hooks/useAgentVoiceState';
import { useAudioLevel } from '../hooks/useAudioLevel';
import { useLiveTranscript } from '../hooks/useLiveTranscript';
import { ParticleOrb } from './ParticleOrb';
import { StatusIndicator } from './StatusIndicator';
import { AudioControls } from './AudioControls';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';

const ENTER_EASE = [0.22, 1, 0.36, 1] as const;

interface VoiceRoomProps {
  /** Resolved agent for the session — drives call meta + engine chip. */
  agent?: Agent | null;
  /** Call id from session start — resets the live transcript on reconnect. */
  callId: string;
  onDisconnect: () => void;
  onReconnect: () => void;
}

/**
 * Rendered INSIDE the LiveKit RoomContext. A bounded "call stage": an orb hero
 * column (identity + orb + state + control dock) paired with a full-height
 * live-transcript rail. RoomAudioRenderer transparently plays the agent's audio
 * track — the user hears the agent with zero manual wiring.
 */
export function VoiceRoom({ agent, callId, onDisconnect, onReconnect }: VoiceRoomProps) {
  const liveState = useAgentVoiceState();
  const { audioTrack } = useVoiceAssistant();
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const { lines, ready, toolEvents, interrupted } = useLiveTranscript(
    callId,
    isMicrophoneEnabled,
  );

  // A server barge signal briefly overrides the LiveKit-derived state so the
  // caller sees an explicit "Interrupted" flash before it settles to listening.
  const voiceState =
    interrupted && (liveState === 'listening' || liveState === 'speaking')
      ? 'interrupted'
      : liveState;

  // Session start ≈ this component's first mount; drives the elapsed timer and
  // call-relative transcript timestamps.
  const [callStart] = useState(() => Date.now());
  const elapsed = useElapsed(callStart);

  // Listening reads the user's mic; speaking reads the agent's output. Sampling
  // only the relevant track keeps one AnalyserNode alive at a time.
  const isSpeaking = voiceState === 'speaking';
  const agentTrack = audioTrack?.publication?.track as RemoteAudioTrack | undefined;
  const micTrack = microphoneTrack?.track as LocalAudioTrack | undefined;

  const { level: agentLevel, dataRef: agentData } = useAudioLevel(agentTrack, isSpeaking);
  const { level: micLevel, dataRef: micData } = useAudioLevel(
    micTrack,
    !isSpeaking && isMicrophoneEnabled,
  );
  const audioLevel = isSpeaking ? agentLevel : micLevel;
  // Feed the orb the per-frame spectral data for whichever side is active.
  const audioData = isSpeaking ? agentData : micData;

  const agentName = agent?.name?.trim() || 'Agent';
  const engineLabel = agent?.engine === 'omni' ? 'PyAI Omni' : 'Custom pipeline';

  return (
    <div className="relative z-10 h-full w-full">
      {/* Plays all remote (agent) audio automatically */}
      <RoomAudioRenderer />

      <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-5 py-5 sm:px-6 lg:py-6">
        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
          {/* ── Orb hero column ── */}
          <div className="flex min-h-0 flex-1 flex-col items-center gap-5">
            <CallMeta
              agentName={agentName}
              engineLabel={engineLabel}
              elapsed={elapsed}
              live={voiceState !== 'disconnected' && voiceState !== 'error'}
            />

            {/* Center stage — grows to absorb space so nothing floats. The orb
                brings its own wash, halo and hairline ring, so there is nothing
                to seat it on here. */}
            <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6">
              <div
                className="flex aspect-square w-full items-center justify-center"
                style={{ maxWidth: 300 }}
              >
                <ParticleOrb
                  size={264}
                  state={voiceState}
                  audioLevel={audioLevel}
                  audioData={audioData}
                />
              </div>

              <StatusIndicator state={voiceState} />
            </div>

            {/* Control dock — pinned to the bottom of the column. It sits in the
                column rather than floating over it, so it separates with a
                hairline: the composer and the orb are the only two things in
                this language that cast anything. */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.38, ease: ENTER_EASE }}
              className="flex items-center"
              style={{
                padding: 'var(--space-1)',
                background: 'var(--surface-card)',
                border: '1px solid var(--line-hairline)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <AudioControls
                onDisconnect={onDisconnect}
                onReconnect={onReconnect}
                micLevel={isSpeaking ? 0 : micLevel}
              />
            </motion.div>
          </div>

          {/* ── Live transcript rail — sizes to content, caps + scrolls ── */}
          <motion.div
            className="flex min-h-0 w-full flex-1 items-start lg:w-[380px] lg:flex-none"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.18, duration: 0.38, ease: ENTER_EASE }}
          >
            <LiveTranscriptPanel
              lines={lines}
              toolEvents={toolEvents}
              ready={ready}
              agentName={agentName}
              callStartMs={callStart}
              state={voiceState}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ─── Call meta strip ──────────────────────────────────────────────────────────

/** Identity (avatar + name + engine) on the left, live timer on the right. */
function CallMeta({
  agentName,
  engineLabel,
  elapsed,
  live,
}: {
  agentName: string;
  engineLabel: string;
  elapsed: string;
  live: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: ENTER_EASE }}
      className="flex items-center gap-3"
    >
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center"
        style={{
          background: 'var(--surface-selected)',
          border: '1px solid var(--line-hairline)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Bot size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--fg-ink)' }} />
      </span>
      <div className="flex min-w-0 flex-col">
        <span
          className="truncate"
          style={{
            fontSize: 'var(--text-nav)',
            fontWeight: 'var(--weight-medium)',
            lineHeight: 'var(--leading-nav)',
            color: 'var(--fg-ink)',
          }}
        >
          {agentName}
        </span>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--fg-muted)' }}>
          {engineLabel}
        </span>
      </div>

      <span
        aria-hidden="true"
        className="h-6 w-px"
        style={{ background: 'var(--line-hairline)' }}
      />

      {/* The live signal is the dot's rhythm, not its hue — a red dot next to a
          healthy call reads as a fault. */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`chip__dot chip__dot--${live ? 'success' : 'neutral'}`}
          style={live ? { animation: 'dotPulse 2.4s var(--ease-standard) infinite' } : undefined}
        />
        <span className="sr-only">{live ? 'Call in progress' : 'Call ended'}</span>
        <span
          className="num"
          style={{ fontSize: 'var(--text-caption)', color: 'var(--fg-body)' }}
        >
          {elapsed}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Elapsed timer ──────────────────────────────────────────────────────────────

/** Live m:ss (or h:mm:ss) elapsed since `startMs`, ticking every second. */
function useElapsed(startMs: number): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
