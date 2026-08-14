'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatAudioTime } from '../utils';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Keyboard step for the scrubber, in seconds. */
const ARROW_STEP = 5;
const PAGE_STEP = 10;

const HAIRLINE = '1px solid var(--line-hairline)';

export function CallAudioPlayer({
  callId,
  hasRecording,
  currentTime,
  onTimeUpdate,
  seekRequest,
  onSeekHandled,
}: {
  callId: string;
  hasRecording: boolean;
  currentTime: number;
  onTimeUpdate: (t: number) => void;
  seekRequest: number | null;
  onSeekHandled: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (seekRequest == null) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seekRequest;
    onTimeUpdate(seekRequest);
    onSeekHandled();
  }, [seekRequest, onSeekHandled, onTimeUpdate]);

  if (!hasRecording) {
    return (
      <div
        className="flex flex-none items-center justify-center px-5 py-3 text-caption"
        style={{ borderTop: HAIRLINE, color: 'var(--fg-muted)' }}
      >
        No recording available for this call
      </div>
    );
  }

  const knownDuration = Number.isFinite(duration) && duration > 0;
  const pct = knownDuration ? (currentTime / duration) * 100 : 0;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (isPlaying) audio.pause();
    else void audio.play();
  };

  const seekTo = (next: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(duration || 1e9, next));
    audio.currentTime = clamped;
    onTimeUpdate(clamped);
  };

  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track || !knownDuration) return;
    const rect = track.getBoundingClientRect();
    const next = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    audio.currentTime = next;
    onTimeUpdate(next);
  };

  const seekFromKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!knownDuration) return;
    const step = {
      ArrowLeft: -ARROW_STEP,
      ArrowRight: ARROW_STEP,
      ArrowDown: -ARROW_STEP,
      ArrowUp: ARROW_STEP,
      PageDown: -PAGE_STEP,
      PageUp: PAGE_STEP,
    }[e.key];

    if (step != null) {
      e.preventDefault();
      seekTo(currentTime + step);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      seekTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seekTo(duration);
    }
  };

  const skip = (delta: number) => seekTo((audioRef.current?.currentTime ?? 0) + delta);

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div
      className="flex flex-none flex-wrap items-center gap-3 px-4 py-2 lg:px-5"
      style={{ borderTop: HAIRLINE }}
    >
      <audio
        ref={audioRef}
        src={`/api/calls/${encodeURIComponent(callId)}/recording`}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          onTimeUpdate(0);
        }}
        onTimeUpdate={() => onTimeUpdate(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => {
          const d = audioRef.current?.duration ?? 0;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
          } else {
            audio.currentTime = 1e9;
          }
        }}
        onSeeked={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
            if (audio.currentTime >= audio.duration - 0.1) {
              audio.currentTime = 0;
            }
          }
        }}
        onError={() => setFailed(true)}
      />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => skip(-10)}
          aria-label="Skip back 10 seconds"
          className="icon-btn focus-inset"
        >
          <SkipBack size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={failed}
          data-playing={isPlaying || undefined}
          className="play-btn play-btn--static focus-inset disabled:cursor-not-allowed disabled:opacity-40"
          style={{ width: 'var(--icon-button-size)', height: 'var(--icon-button-size)' }}
        >
          {isPlaying ? (
            <Pause size={13} strokeWidth={2} />
          ) : (
            <Play size={13} strokeWidth={2} style={{ marginLeft: 1 }} />
          )}
        </button>
        <button
          type="button"
          onClick={() => skip(10)}
          aria-label="Skip forward 10 seconds"
          className="icon-btn focus-inset"
        >
          <SkipForward size={16} strokeWidth={2} />
        </button>
      </div>

      <span
        className="num w-10 shrink-0 font-mono text-micro"
        style={{ color: 'var(--fg-muted)' }}
      >
        {formatAudioTime(currentTime)}
      </span>

      {/* The played portion is the one product visual on this bar, so it is the
          one thing here licensed to carry the accent. Every control around it
          is chrome and stays neutral. */}
      <div
        ref={trackRef}
        onClick={seekFromClick}
        onKeyDown={seekFromKey}
        className="focus-inset relative flex min-w-[120px] flex-1 cursor-pointer items-center py-2"
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={knownDuration ? Math.floor(duration) : 0}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
      >
        <div
          className="relative h-1 w-full overflow-hidden rounded-pill"
          style={{ background: 'var(--surface-selected)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-pill"
            style={{ width: `${pct}%`, background: 'var(--product-accent)' }}
          />
        </div>
        <span
          aria-hidden
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-pill"
          style={{
            left: `${pct}%`,
            background: 'var(--product-accent)',
            opacity: knownDuration ? 1 : 0,
          }}
        />
      </div>

      <span
        className="num w-10 shrink-0 text-right font-mono text-micro"
        style={{ color: 'var(--fg-muted)' }}
      >
        {formatAudioTime(duration)}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.muted = !muted;
            setMuted(!muted);
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="icon-btn focus-inset"
        >
          {muted || volume === 0 ? (
            <VolumeX size={16} strokeWidth={2} />
          ) : (
            <Volume2 size={16} strokeWidth={2} />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            setMuted(v === 0);
            if (audioRef.current) {
              audioRef.current.volume = v;
              audioRef.current.muted = v === 0;
            }
          }}
          className="focus-inset hidden w-16 sm:block"
          style={{ accentColor: 'var(--fg-ink)' }}
          aria-label="Volume"
        />
        <button
          type="button"
          onClick={cycleSpeed}
          className="btn btn--ghost btn--sm num focus-inset"
          aria-label={`Playback speed ${speed} times. Change speed.`}
          title="Playback speed"
        >
          {speed}×
        </button>
      </div>

      {failed && (
        <span role="alert" className="w-full text-caption" style={{ color: 'var(--status-error)' }}>
          Recording failed to load
        </span>
      )}
    </div>
  );
}
