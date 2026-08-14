'use client';

import {
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

function statusVariant(
  status: CallStatus,
): 'success' | 'accent' | 'error' {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'accent';
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
      className="inline-flex items-center gap-1.5"
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

      <button
        type="button"
        onClick={toggle}
        disabled={error}
        aria-label={playing ? 'Pause recording' : 'Play recording'}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-[140ms] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: playing
            ? 'var(--color-accent-soft)'
            : 'var(--color-surface-elevated)',
          border: `1px solid ${
            playing ? 'var(--color-accent-hairline)' : 'var(--color-border)'
          }`,
          color: playing ? 'var(--color-accent)' : 'var(--color-text-muted)',
        }}
        onMouseEnter={(e) => {
          if (error) return;
          e.currentTarget.style.borderColor = 'var(--color-accent-hairline)';
          e.currentTarget.style.color = 'var(--color-accent)';
          e.currentTarget.style.background = 'var(--color-accent-soft)';
        }}
        onMouseLeave={(e) => {
          if (error) return;
          e.currentTarget.style.borderColor = playing
            ? 'var(--color-accent-hairline)'
            : 'var(--color-border)';
          e.currentTarget.style.color = playing
            ? 'var(--color-accent)'
            : 'var(--color-text-muted)';
          e.currentTarget.style.background = playing
            ? 'var(--color-accent-soft)'
            : 'var(--color-surface-elevated)';
        }}
      >
        {playing ? (
          <Pause size={11} strokeWidth={2.2} />
        ) : (
          <Play size={11} strokeWidth={2.2} style={{ marginLeft: 1 }} />
        )}
      </button>

      <span
        className="font-mono text-[11px] tabular-nums"
        style={{ color: error ? 'var(--color-state-error)' : 'var(--color-text-faint)' }}
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
        className="flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors duration-[140ms]"
        style={{ color: 'var(--color-text-faint)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface-elevated)';
          e.currentTarget.style.color = 'var(--color-text-muted)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-faint)';
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-[10px] py-1"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            boxShadow:
              '0 4px 6px rgb(0 0 0 / 0.06), 0 10px 32px rgb(0 0 0 / 0.18)',
          }}
        >
          <Link
            href={`/calls/${encodeURIComponent(call.callId)}`}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-[13px] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-raised)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <ExternalLink size={14} strokeWidth={2} />
            Open details
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void copyId();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-surface-raised)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
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

export const CALL_TABLE_COLUMNS =
  'minmax(180px, 1.5fr) 120px minmax(100px, 1fr) 120px 72px 110px minmax(110px, 0.9fr) 40px';

export function CallTableHeader() {
  const headers = [
    'Contact',
    'Number',
    'Agent',
    'Date',
    'Duration',
    'Recording',
    'Status',
    '',
  ];
  return (
    <div
      className="hidden items-center gap-3 px-4 py-2.5 md:grid"
      style={{
        gridTemplateColumns: CALL_TABLE_COLUMNS,
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
      role="row"
    >
      {headers.map((h, i) => (
        <span
          key={i}
          className="text-[11px] font-[500] uppercase tracking-[0.08em]"
          style={{ color: 'var(--color-text-faint)' }}
          role="columnheader"
        >
          {h}
        </span>
      ))}
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
      className="group cursor-pointer border-b outline-none last:border-b-0 transition-colors duration-[140ms]"
      style={{
        borderColor: 'var(--color-border)',
        background: selected
          ? 'var(--color-accent-subtle)'
          : 'var(--color-surface-raised)',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = 'var(--color-surface-elevated)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = selected
          ? 'var(--color-accent-subtle)'
          : 'var(--color-surface-raised)';
      }}
      aria-current={selected ? 'true' : undefined}
    >
      <div
        className="hidden items-center gap-3 px-4 py-3 md:grid"
        style={{ gridTemplateColumns: CALL_TABLE_COLUMNS }}
        role="row"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-[600]"
            style={{
              background: selected
                ? 'var(--color-accent-soft)'
                : 'var(--color-surface-elevated)',
              color: selected ? 'var(--color-accent)' : 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
            aria-hidden
          >
            {initialsFromLabel(contact)}
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-[13px] font-[500]"
              style={{
                color: selected ? 'var(--color-accent)' : 'var(--color-text)',
              }}
            >
              {contact}
            </p>
            {call.analysis?.summary ? (
              <p
                className="truncate text-[12px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {call.analysis.summary}
              </p>
            ) : null}
          </div>
        </div>

        <span
          className="truncate font-mono text-[12.5px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {formatPhone(phone)}
        </span>

        <span
          className="truncate text-[13px]"
          style={{ color: 'var(--color-text-muted)' }}
          title={agent}
        >
          {agent}
        </span>

        <div className="flex flex-col leading-tight">
          <span className="text-[12.5px]" style={{ color: 'var(--color-text)' }}>
            {date}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>
            {time}
          </span>
        </div>

        <span
          className="font-mono text-[12.5px] tabular-nums"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {formatDuration(call.durationMs)}
        </span>

        <div className="flex items-center">
          {hasRecording ? (
            <InlineRecordingPlayer callId={call.callId} />
          ) : (
            <span
              className="text-[12.5px]"
              style={{ color: 'var(--color-text-faint)' }}
            >
              —
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant={statusVariant(call.status)} dot>
            {statusLabel(call.status, call.endedBy)}
          </Badge>
          {sentiment ? <Badge variant="muted">{sentiment}</Badge> : null}
        </div>

        <RowActions call={call} />
      </div>

      <div className="flex flex-col gap-2 px-4 py-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="truncate text-[14px] font-[500]"
              style={{ color: selected ? 'var(--color-accent)' : 'var(--color-text)' }}
            >
              {contact}
            </p>
            <p className="truncate text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {formatPhone(phone)} · {agent}
            </p>
          </div>
          <Badge variant={statusVariant(call.status)} dot>
            {statusLabel(call.status, call.endedBy)}
          </Badge>
        </div>
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span>
            {date} · {time}
          </span>
          <span>{formatDuration(call.durationMs)}</span>
          {hasRecording ? <InlineRecordingPlayer callId={call.callId} /> : null}
        </div>
      </div>
    </div>
  );
}
