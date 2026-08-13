'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, User, Wrench, ChevronDown } from 'lucide-react';
import type { LiveLine, LiveToolEvent } from '../hooks/useLiveTranscript';
import { VOICE_STATE_META, type VoiceState } from '../types';

interface LiveTranscriptPanelProps {
  lines: LiveLine[];
  ready: boolean;
  agentName?: string;
  /** Tool executions surfaced live, interleaved with turns by timestamp. */
  toolEvents?: LiveToolEvent[];
  /** Call start epoch ms — timestamps render relative to it (m:ss). */
  callStartMs?: number;
  /** Current session state — the header dot/label reflect it, synced to the orb. */
  state?: VoiceState;
}

type TimelineItem =
  | { kind: 'msg'; ts: number; line: LiveLine }
  | { kind: 'tool'; ts: number; ev: LiveToolEvent };

/**
 * Full-height live-call transcript rail — Agent / Caller turns paired with the
 * orb. Token-driven so light mode stays bright paper; dark stays quiet glass.
 */
export function LiveTranscriptPanel({
  lines,
  ready,
  agentName = 'Agent',
  toolEvents = [],
  callStartMs,
  state = 'listening',
}: LiveTranscriptPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastText = lines.at(-1)?.text ?? '';
  const stateColor = `var(${VOICE_STATE_META[state].colorVar})`;

  // Weave speech + tool executions into one time-ordered stream so a tool call
  // appears exactly where it fired, between the turns around it.
  const items = useMemo<TimelineItem[]>(() => {
    const merged: TimelineItem[] = [
      ...lines.map((line) => ({ kind: 'msg' as const, ts: line.timestamp, line })),
      ...toolEvents.map((ev) => ({ kind: 'tool' as const, ts: ev.timestamp, ev })),
    ];
    return merged.sort((a, b) => a.ts - b.ts);
  }, [lines, toolEvents]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length, lastText]);

  return (
    <aside
      className="flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-[18px]"
      style={{
        /* Elevated cool sheet — separates from pale void in light mode */
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-strong)',
        boxShadow:
          '0 1px 0 var(--color-border-strong), 0 16px 40px rgb(12 17 32 / 0.14)',
      }}
      aria-label="Live transcription"
    >
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
        style={{
          background: 'color-mix(in srgb, var(--color-surface-elevated) 70%, var(--color-surface) 30%)',
          borderBottom: '1px solid var(--color-border-strong)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-50"
              style={{ background: stateColor }}
            />
            <span
              className="relative h-2 w-2 rounded-full"
              style={{ background: stateColor, boxShadow: `0 0 6px ${stateColor}` }}
            />
          </span>
          <span
            className="text-[10px] font-[600] uppercase tracking-[0.2em]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Live transcript
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 font-mono text-[10.5px]"
          style={{
            color: 'var(--color-text-muted)',
            background: 'var(--color-glass)',
            border: '1px solid var(--color-border)',
          }}
        >
          {lines.length === 0
            ? 'waiting'
            : `${lines.length} turn${lines.length === 1 ? '' : 's'}`}
        </span>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{
          scrollbarGutter: 'stable',
          background: 'var(--color-surface-elevated)',
        }}
      >
        {!ready || items.length === 0 ? (
          <EmptyState listening={ready} />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((item, index) =>
              item.kind === 'msg' ? (
                <TranscriptLine
                  key={item.line.id}
                  line={item.line}
                  agentName={agentName}
                  callStartMs={callStartMs}
                  isLatest={index === items.length - 1}
                />
              ) : (
                <ToolRow key={item.ev.id} ev={item.ev} callStartMs={callStartMs} />
              ),
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ listening }: { listening: boolean }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {listening
          ? 'Start talking — words appear as you speak.'
          : 'Connecting transcript…'}
      </p>
    </div>
  );
}

function TranscriptLine({
  line,
  agentName,
  callStartMs,
  isLatest,
}: {
  line: LiveLine;
  agentName: string;
  callStartMs?: number;
  isLatest: boolean;
}) {
  const isAgent = line.role === 'assistant';
  const label = isAgent ? agentName : 'Caller';

  return (
    <li
      className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className="relative max-w-[92%] rounded-[14px] px-3.5 py-2.5"
        style={{
          /* White bubbles on cool sheet — readable lift in light mode */
          background: isAgent
            ? 'var(--color-accent-subtle)'
            : 'var(--color-surface)',
          border: `1px solid ${
            isAgent ? 'var(--color-accent-border)' : 'var(--color-border-strong)'
          }`,
          borderLeft: isAgent
            ? '3px solid var(--color-accent)'
            : '1px solid var(--color-border-strong)',
          boxShadow: isLatest
            ? '0 2px 8px rgb(12 17 32 / 0.1)'
            : '0 1px 2px rgb(12 17 32 / 0.05)',
        }}
      >
        <div className="mb-1 flex items-center gap-1.5">
          {isAgent ? (
            <AudioLines
              size={12}
              strokeWidth={2}
              style={{ color: 'var(--color-accent)' }}
            />
          ) : (
            <User
              size={12}
              strokeWidth={2}
              style={{ color: 'var(--color-text-muted)' }}
            />
          )}
          <span
            className="text-[11px] font-[600] tracking-[0.03em]"
            style={{
              color: isAgent ? 'var(--color-accent)' : 'var(--color-text-muted)',
            }}
          >
            {label}
          </span>
          <time
            className="ml-auto font-mono text-[10px]"
            style={{ color: 'var(--color-text-faint)' }}
            dateTime={new Date(line.timestamp).toISOString()}
          >
            {formatClock(line.timestamp, callStartMs)}
          </time>
        </div>
        <p
          className="whitespace-pre-wrap text-[13.5px] leading-[1.55]"
          style={{
            color: 'var(--color-text)',
            opacity: line.isFinal ? 1 : 0.72,
          }}
        >
          {line.text}
          {!line.isFinal ? <Caret /> : null}
        </p>
      </div>
    </li>
  );
}

/** Compact inline tool execution — status + latency, expandable for details. */
function ToolRow({ ev, callStartMs }: { ev: LiveToolEvent; callStartMs?: number }) {
  const [open, setOpen] = useState(false);
  const running = ev.status === 'running';
  const failed = ev.status === 'error';
  const tone = failed
    ? 'var(--color-state-error)'
    : running
      ? 'var(--color-state-thinking)'
      : 'var(--color-state-speaking)';
  const expandable = ev.args !== undefined || ev.output !== undefined || ev.error != null;
  const status = running ? 'Running…' : failed ? 'Failed' : 'Completed';
  const caption = [status, ev.latencyMs != null ? `${ev.latencyMs}ms` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex justify-center px-1.5">
      <div
        className="w-full overflow-hidden rounded-[9px]"
        style={{ border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)' }}
      >
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
          style={{ cursor: expandable ? 'pointer' : 'default' }}
          aria-expanded={expandable ? open : undefined}
        >
          <Wrench size={11} strokeWidth={2} style={{ color: tone }} />
          <span className="font-mono text-[11.5px]" style={{ color: 'var(--color-text)' }}>
            {ev.name}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[10.5px]"
            style={{ color: failed ? tone : 'var(--color-text-faint)' }}
          >
            {caption}
          </span>
          <time className="font-mono text-[10px]" style={{ color: 'var(--color-text-faint)' }}>
            {formatClock(ev.timestamp, callStartMs)}
          </time>
          {running ? (
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: tone }}
              aria-hidden
            />
          ) : expandable ? (
            <ChevronDown
              size={12}
              strokeWidth={2}
              className="transition-transform"
              style={{ color: 'var(--color-text-faint)', transform: open ? 'rotate(180deg)' : 'none' }}
            />
          ) : null}
        </button>
        {open && expandable && (
          <div className="flex flex-col gap-1.5 border-t px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
            {ev.args !== undefined && <MiniJson label="Input" value={ev.args} />}
            {ev.output !== undefined && <MiniJson label="Output" value={ev.output} />}
            {ev.error != null && (
              <p className="text-[11px]" style={{ color: 'var(--color-state-error)' }}>
                {ev.error}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function MiniJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[9.5px] font-[600] uppercase tracking-[0.1em]"
        style={{ color: 'var(--color-text-faint)' }}
      >
        {label}
      </span>
      <pre
        className="overflow-x-auto rounded-[6px] px-2 py-1.5 text-[10.5px]"
        style={{
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[0.9em] w-[2px] align-[-0.1em] animate-pulse"
      style={{ background: 'var(--color-accent)' }}
    />
  );
}

/** Call-relative elapsed offset (m:ss) when a start time is known, else clock. */
function formatClock(ts: number, startMs?: number): string {
  if (startMs && ts >= startMs) {
    const total = Math.floor((ts - startMs) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
