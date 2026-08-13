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
 * column (identity + seated orb + state + control dock) paired with a
 * full-height live-transcript rail. RoomAudioRenderer transparently plays the
 * agent's audio track — the user hears the agent with zero manual wiring.
 */
export function VoiceRoom({ agent, callId, onDisconnect, onReconnect }: VoiceRoomProps) {
  const liveState = useAgentVoiceState();
  const { audioTrack } = useVoiceAssistant();
  const { microphoneTrack } = useLocalParticipant();
  const { lines, ready, toolEvents, interrupted } = useLiveTranscript(callId);

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
  const { level: micLevel, dataRef: micData } = useAudioLevel(micTrack, !isSpeaking);
  const audioLevel = isSpeaking ? agentLevel : micLevel;
  // Feed the orb the per-frame spectral data for whichever side is active.
  const audioData = isSpeaking ? agentData : micData;

  const agentName = agent?.name?.trim() || 'Agent';
  const engineLabel = agent?.engine === 'omni' ? 'PyAI Omni' : 'Custom pipeline';

  return (
    <div className="relative z-10 h-full w-full">
      {/* Plays all remote (agent) audio automatically */}
      <RoomAudioRenderer />

      <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-5 py-5 sm:px-6 lg:py-7">
        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-9">
          {/* ── Orb hero column ── */}
          <div className="flex min-h-0 flex-1 flex-col items-center gap-5">
            <CallMeta
              agentName={agentName}
              engineLabel={engineLabel}
              elapsed={elapsed}
              live={voiceState !== 'disconnected' && voiceState !== 'error'}
            />

            {/* Center stage — grows to absorb space so nothing floats */}
            <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-6">
              <OrbStage level={audioLevel} active={voiceState === 'listening' || isSpeaking}>
                <ParticleOrb
                  size={264}
                  state={voiceState}
                  audioLevel={audioLevel}
                  audioData={audioData}
                />
              </OrbStage>

              <StatusIndicator state={voiceState} />
            </div>

            {/* Control dock — pinned to the bottom of the column */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center rounded-full px-3 py-2.5"
              style={{
                background: 'var(--color-glass)',
                border: '1px solid var(--color-glass-border)',
                backdropFilter: 'blur(14px)',
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
            transition={{ delay: 0.28, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
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
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3"
    >
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: 'var(--color-accent-soft)',
          border: '1px solid var(--color-accent-ring)',
        }}
      >
        <Bot size={15} strokeWidth={2} style={{ color: 'var(--color-accent)' }} />
      </span>
      <div className="flex min-w-0 flex-col">
        <span
          className="truncate text-[13.5px] font-[600] leading-tight tracking-[-0.01em]"
          style={{ color: 'var(--color-text)' }}
        >
          {agentName}
        </span>
        <span
          className="text-[10px] font-[500] uppercase tracking-[0.11em]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {engineLabel}
        </span>
      </div>

      <span aria-hidden className="h-6 w-px" style={{ background: 'var(--color-border)' }} />

      <div className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5" aria-hidden style={{ opacity: live ? 1 : 0.4 }}>
          {live && (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ background: 'var(--color-state-error)' }}
            />
          )}
          <span
            className="relative h-1.5 w-1.5 rounded-full"
            style={{ background: live ? 'var(--color-state-error)' : 'var(--color-text-faint)' }}
          />
        </span>
        <span
          className="font-mono text-[13px] tabular-nums tracking-[0.02em]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {elapsed}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Orb stage ────────────────────────────────────────────────────────────────

/** Seats the orb on a soft radial stage that breathes with live audio. */
function OrbStage({
  children,
  level,
  active,
}: {
  children: React.ReactNode;
  level: number;
  active: boolean;
}) {
  const glow = active ? 0.35 + Math.min(level, 1) * 0.5 : 0.28;
  return (
    <div className="relative flex aspect-square w-full max-w-[300px] items-center justify-center">
      {/* Ambient stage glow behind the orb — grounds it instead of floating */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '6%',
          background:
            'radial-gradient(circle at 50% 52%, var(--color-accent-soft), transparent 62%)',
          opacity: glow,
          filter: 'blur(14px)',
          transition: 'opacity 200ms var(--ease-fluid)',
        }}
      />
      {/* Faint seating ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '2%',
          border: '1px solid var(--color-accent-hairline)',
          opacity: 0.5,
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </div>
    </div>
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
