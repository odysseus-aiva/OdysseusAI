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
        className="flex flex-none items-center justify-center px-5 py-2 text-[12px]"
        style={{
          borderTop: '1px solid var(--color-border)',
          color: 'var(--color-text-faint)',
        }}
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

  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track || !knownDuration) return;
    const rect = track.getBoundingClientRect();
    const next = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    audio.currentTime = next;
    onTimeUpdate(next);
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration || 1e9, audio.currentTime + delta));
    audio.currentTime = next;
    onTimeUpdate(next);
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div
      className="flex flex-none flex-wrap items-center gap-2.5 px-4 py-2 lg:px-5"
      style={{ borderTop: '1px solid var(--color-border)' }}
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

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => skip(-10)}
          aria-label="Skip back 10 seconds"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--color-glass-hover)]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          <SkipBack size={13} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={failed}
          className="flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors duration-[140ms] disabled:opacity-40"
          style={{
            background: isPlaying ? 'var(--color-accent-subtle)' : 'transparent',
            color: isPlaying ? 'var(--color-accent)' : 'var(--color-text-muted)',
          }}
        >
          {isPlaying ? (
            <Pause size={12} strokeWidth={2} />
          ) : (
            <Play size={12} strokeWidth={2} style={{ marginLeft: 1 }} />
          )}
        </button>
        <button
          type="button"
          onClick={() => skip(10)}
          aria-label="Skip forward 10 seconds"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--color-glass-hover)]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          <SkipForward size={13} strokeWidth={1.8} />
        </button>
      </div>

      <span
        className="w-9 shrink-0 font-mono text-[10.5px] tabular-nums"
        style={{ color: 'var(--color-text-faint)' }}
      >
        {formatAudioTime(currentTime)}
      </span>

      <div
        ref={trackRef}
        onClick={seekFromClick}
        className="relative h-px min-w-[120px] flex-1 cursor-pointer"
        style={{ background: 'var(--color-border)' }}
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={knownDuration ? Math.floor(duration) : 0}
        aria-valuenow={Math.floor(currentTime)}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: 'var(--color-text-muted)',
            opacity: 0.55,
          }}
        />
        <div
          className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${pct}%`,
            background: 'var(--color-text-muted)',
            opacity: knownDuration ? 0.9 : 0,
          }}
        />
      </div>

      <span
        className="w-9 shrink-0 text-right font-mono text-[10.5px] tabular-nums"
        style={{ color: 'var(--color-text-faint)' }}
      >
        {formatAudioTime(duration)}
      </span>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.muted = !muted;
            setMuted(!muted);
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] hover:bg-[var(--color-glass-hover)]"
          style={{ color: 'var(--color-text-faint)' }}
        >
          {muted || volume === 0 ? (
            <VolumeX size={13} strokeWidth={1.8} />
          ) : (
            <Volume2 size={13} strokeWidth={1.8} />
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
          className="hidden w-16 opacity-60 sm:block"
          style={{ accentColor: 'var(--color-text-muted)' }}
          aria-label="Volume"
        />
        <button
          type="button"
          onClick={cycleSpeed}
          className="h-7 min-w-[36px] rounded-[6px] px-1.5 text-[11px] font-[500] tabular-nums hover:bg-[var(--color-glass-hover)]"
          style={{ color: 'var(--color-text-faint)' }}
          title="Playback speed"
        >
          {speed}×
        </button>
      </div>

      {failed && (
        <span className="w-full text-[11.5px]" style={{ color: 'var(--color-state-error)' }}>
          Recording failed to load
        </span>
      )}
    </div>
  );
}
