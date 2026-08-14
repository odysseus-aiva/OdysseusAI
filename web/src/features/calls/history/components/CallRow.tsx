'use client';

import {
  ArrowDown,
  MoreHorizontal,
  Copy,
  ExternalLink,
  Play,
  Pause,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CallSummary } from '@/lib/api/calls';
import type { CallStatus } from '@/lib/types/call-log';
import { Badge } from '@/components/ui/Badge';
import {
  formatDateTime,
  formatDuration,
  formatPhone,
  getAgentLabel,
  getCallerPhone,
  getContactLabel,
  initialsFromLabel,
} from '../utils';

const PAUSE_OTHERS = 'call-history:pause-recordings';

function recordingSrc(callId: string): string {
  return `/api/calls/${encodeURIComponent(callId)}/recording`;
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/* In-flight reads neutral, not warning: warning is reserved for a state the
   user has to act on. */
function statusVariant(
  status: CallStatus,
): 'success' | 'muted' | 'error' {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'muted';
  return 'error';
}

function statusLabel(status: CallStatus, endedBy?: string): string {
  if (status === 'completed' && endedBy === 'agent') return 'Agent ended';
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Error';
}

/** Compact in-row player — never navigates away from Call History. */
function InlineRecordingPlayer({ callId }: { callId: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onPauseOthers = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id === callId) return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
    };
    window.addEventListener(PAUSE_OTHERS, onPauseOthers);
    return () => window.removeEventListener(PAUSE_OTHERS, onPauseOthers);
  }, [callId]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || error) return;
    if (playing) {
      audio.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PAUSE_OTHERS, { detail: callId }));
    void audio.play().catch(() => setError(true));
  };

  return (
    <div
      className="inline-flex min-w-0 items-center gap-2"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={recordingSrc(callId)}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
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
        onError={() => setError(true)}
      />

      {/* Recording presence is data here, so the button stays visible instead of
          revealing on row hover the way a voice-preview slot does. */}
      <button
        type="button"
        onClick={toggle}
        disabled={error}
        aria-label={playing ? 'Pause recording' : 'Play recording'}
        data-playing={playing || undefined}
        className="play-btn play-btn--static focus-inset disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? (
          <Pause size={12} strokeWidth={2} />
        ) : (
          <Play size={12} strokeWidth={2} style={{ marginLeft: 1 }} />
        )}
      </button>

      <span
        className="truncate font-mono text-micro tabular-nums"
        style={{ color: error ? 'var(--status-error)' : 'var(--fg-muted)' }}
      >
        {error
          ? 'Unavailable'
          : duration > 0
            ? `${fmtTime(current)} / ${fmtTime(duration)}`
            : playing
              ? fmtTime(current)
              : 'Play'}
      </span>
    </div>
  );
}

function RowActions({ call }: { call: CallSummary }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(call.callId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={ref}
      className="relative"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label="Call actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="icon-btn focus-inset"
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>
      {open && (
        /* A menu genuinely floats, so it is one of the few things that earns a
           shadow. */
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-md py-1"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--line-hairline)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <Link
            href={`/calls/${encodeURIComponent(call.callId)}`}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-caption text-[var(--fg-body)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)] hover:text-[var(--fg-ink)]"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={14} strokeWidth={2} />
            Open details
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-[var(--fg-body)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)] hover:text-[var(--fg-ink)]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void copyId();
            }}
          >
            <Copy size={14} strokeWidth={2} />
            {copied ? 'Copied' : 'Copy call ID'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Screen-local grid geometry. Column tracks are the one thing a screen owns
 * rather than inherits, so they ride on the page root as custom properties.
 */
export const CALL_TABLE_COLUMNS =
  'minmax(180px, 1.6fr) 120px minmax(104px, 1fr) 116px 76px 120px 180px 28px';

export const CALL_TABLE_MIN_WIDTH = '1060px';

export function CallTableHeader() {
  return (
    <div className="listing__head hidden md:grid" role="row">
      <span role="columnheader">Contact</span>
      <span role="columnheader">Number</span>
      <span role="columnheader">Agent</span>
      {/* The list is served sorted by createdAt desc; the caret reports the
          active column rather than offering to change it. */}
      <span
        role="columnheader"
        aria-sort="descending"
        className="inline-flex items-center gap-1"
        style={{ color: 'var(--fg-strong)' }}
      >
        Date
        <ArrowDown
          size={13}
          strokeWidth={2}
          aria-hidden
          className="listing__caret"
          data-direction="desc"
        />
      </span>
      <span role="columnheader" className="listing__right">
        Duration
      </span>
      <span role="columnheader">Recording</span>
      <span role="columnheader">Status</span>
      <span role="columnheader">
        <span className="sr-only">Actions</span>
      </span>
    </div>
  );
}

export function CallRow({
  call,
  selected,
  onSelect,
}: {
  call: CallSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const contact = getContactLabel(call);
  const phone = getCallerPhone(call);
  const agent = getAgentLabel(call);
  const { date, time } = formatDateTime(call.createdAt);
  const sentiment = call.analysis?.sentiment;
  const hasRecording = Boolean(call.recordingUrl);
  const href = `/calls/${encodeURIComponent(call.callId)}`;

  const openDetail = () => {
    onSelect();
    router.push(href);
  };

  const initials = (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-pill text-overline font-medium"
      style={{
        background: 'var(--surface-recessed)',
        border: '1px solid var(--line-hairline)',
        color: 'var(--fg-body)',
      }}
      aria-hidden
    >
      {initialsFromLabel(contact)}
    </span>
  );

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail();
        }
      }}
      className="focus-inset cursor-pointer"
      aria-current={selected ? 'true' : undefined}
    >
      <div
        className="listing__row hidden md:grid"
        role="row"
        data-selected={selected || undefined}
      >
        <span className="flex min-w-0 items-center gap-2" role="cell">
          {initials}
          <span className="min-w-0">
            <span className="listing__strong block truncate text-nav">
              {contact}
            </span>
            {call.analysis?.summary ? (
              <span className="listing__muted block truncate text-caption">
                {call.analysis.summary}
              </span>
            ) : null}
          </span>
        </span>

        <span className="truncate font-mono text-nav" role="cell">
          {formatPhone(phone)}
        </span>

        <span className="truncate" role="cell" title={agent}>
          {agent}
        </span>

        <span className="flex flex-col leading-tight" role="cell">
          <span>{date}</span>
          <span className="listing__muted text-caption">{time}</span>
        </span>

        <span className="listing__right tabular-nums" role="cell">
          {formatDuration(call.durationMs)}
        </span>

        <span className="flex min-w-0 items-center" role="cell">
          {hasRecording ? (
            <InlineRecordingPlayer callId={call.callId} />
          ) : (
            <span className="listing__muted">—</span>
          )}
        </span>

        <span className="flex min-w-0 items-center gap-2" role="cell">
          <Badge variant={statusVariant(call.status)}>
            {statusLabel(call.status, call.endedBy)}
          </Badge>
          {sentiment ? <Badge variant="muted">{sentiment}</Badge> : null}
        </span>

        <span role="cell">
          <RowActions call={call} />
        </span>
      </div>

      <div
        className="flex flex-col gap-2 rounded-sm px-3 py-3 transition-colors duration-[120ms] hover:bg-[var(--surface-hover)] md:hidden"
        style={selected ? { background: 'var(--surface-selected)' } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-nav font-medium" style={{ color: 'var(--fg-ink)' }}>
              {contact}
            </p>
            <p className="truncate text-caption" style={{ color: 'var(--fg-muted)' }}>
              {formatPhone(phone)} · {agent}
            </p>
          </div>
          <Badge variant={statusVariant(call.status)}>
            {statusLabel(call.status, call.endedBy)}
          </Badge>
        </div>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption"
          style={{ color: 'var(--fg-body)' }}
        >
          <span>
            {date} · {time}
          </span>
          <span className="tabular-nums">{formatDuration(call.durationMs)}</span>
          {hasRecording ? <InlineRecordingPlayer callId={call.callId} /> : null}
        </div>
      </div>
    </div>
  );
}
