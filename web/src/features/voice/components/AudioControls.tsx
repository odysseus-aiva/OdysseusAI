'use client';

import { useCallback } from 'react';
import { Track } from 'livekit-client';
import { useLocalParticipant, useTrackToggle } from '@livekit/components-react';
import { motion } from 'motion/react';

interface AudioControlsProps {
  onDisconnect: () => void;
  onReconnect: () => void;
}

/**
 * Phase 1 audio controls: mute mic, disconnect, reconnect. Nothing else.
 * Mic state is read/toggled through LiveKit hooks — no local mirror state.
 */
export function AudioControls({
  onDisconnect,
  onReconnect,
}: AudioControlsProps) {
  const { isMicrophoneEnabled } = useLocalParticipant();
  const { toggle } = useTrackToggle({ source: Track.Source.Microphone });

  const toggleMic = useCallback(() => {
    void toggle();
  }, [toggle]);

  return (
    <div className="flex items-center gap-3">
      <ControlButton
        active={!isMicrophoneEnabled}
        label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        onClick={toggleMic}
      >
        {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
      </ControlButton>

      <ControlButton label="Reconnect" onClick={onReconnect}>
        <ReconnectIcon />
      </ControlButton>

      <ControlButton label="End conversation" danger onClick={onDisconnect}>
        <EndIcon />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  active = false,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const isDanger = danger || active;
  const accent = isDanger ? 'var(--color-state-error)' : 'var(--color-text)';
  const hoverBorder = isDanger
    ? 'rgb(251 113 133 / 0.5)'
    : 'var(--color-accent-border)';

  return (
    <motion.button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border backdrop-blur-xl"
      style={{
        color: accent,
        background: 'var(--color-glass)',
        borderColor: 'var(--color-glass-border)',
        transition:
          'border-color 180ms var(--ease-fluid), background 180ms var(--ease-fluid)',
      }}
      onPointerEnter={(e) => {
        e.currentTarget.style.borderColor = hoverBorder;
        e.currentTarget.style.background = 'var(--color-glass-hover)';
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-glass-border)';
        e.currentTarget.style.background = 'var(--color-glass)';
      }}
    >
      {children}
    </motion.button>
  );
}

/* --- Icons (inline, no dependency) --- */

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7 7 0 0 0 19 11v-1" />
      <path d="M5 10v1a7 7 0 0 0 12 5" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function ReconnectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function EndIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  );
}
