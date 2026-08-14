'use client';

import { useCallback } from 'react';
import { useLocalParticipant } from '@livekit/components-react';

interface AudioControlsProps {
  onDisconnect: () => void;
  onReconnect: () => void;
  /** Live mic loudness 0..1 — drives the ring around the mute button. */
  micLevel?: number;
}

/**
 * In-call control dock: mute (with a live mic-level ring), reconnect, and a
 * clearly separated, labeled End button so the destructive action is never
 * confused with mute. Mic state is read/toggled through LiveKit hooks — no local
 * mirror state.
 *
 * End is a labeled danger button rather than a red circle: the word is what makes
 * it unmistakable, and the tone is licensed because ending a call badly is a
 * genuine status, not decoration.
 */
export function AudioControls({
  onDisconnect,
  onReconnect,
  micLevel = 0,
}: AudioControlsProps) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const toggleMic = useCallback(() => {
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  const level = Math.min(micLevel, 1);

  return (
    <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
      {/* Mute — the ring reads real mic input while the track is open. A meter,
          so it moves on opacity and scale and stays a neutral hairline: it is
          chrome, and only the orb is licensed to be blue. */}
      <div className="relative flex items-center justify-center">
        {isMicrophoneEnabled && (
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: -3,
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--line-strong)',
              opacity: 0.2 + level * 0.6,
              transform: `scale(${1 + level * 0.18})`,
              transition:
                'transform var(--duration-instant) var(--ease-standard), opacity var(--duration-hover) var(--ease-standard)',
            }}
          />
        )}
        <DockButton
          active={!isMicrophoneEnabled}
          label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={toggleMic}
        >
          {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
        </DockButton>
      </div>

      <DockButton label="Reconnect" onClick={onReconnect}>
        <ReconnectIcon />
      </DockButton>

      {/* Spacer keeps the destructive action visually apart from mute */}
      <span aria-hidden style={{ width: 'var(--space-2)' }} />

      <button
        type="button"
        onClick={onDisconnect}
        aria-label="End conversation"
        title="End conversation"
        className="btn btn--danger"
      >
        <EndIcon />
        End
      </button>
    </div>
  );
}

/**
 * A 1:1 circle, which is one of the shapes a full radius is reserved for — the
 * transport controls read as round because they are round, not because they are
 * pills. Muted is signalled by the glyph, `aria-pressed` and a neutral held
 * fill; a red mute button would claim something has gone wrong.
 */
function DockButton({
  children,
  label,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="icon-btn icon-btn--bordered icon-btn--round"
      style={active ? { background: 'var(--surface-selected)', color: 'var(--fg-ink)' } : undefined}
    >
      {children}
    </button>
  );
}

/* --- Icons (inline, no dependency) --- */

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function EndIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6.33-6.33 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4z" />
      <line x1="22" y1="2" x2="2" y2="22" />
    </svg>
  );
}
