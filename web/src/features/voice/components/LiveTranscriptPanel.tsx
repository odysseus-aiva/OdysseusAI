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
  /** Current session state — the header dot reflects it, synced to the orb. */
  state?: VoiceState;
}

type TimelineItem =
  | { kind: 'msg'; ts: number; line: LiveLine }
  | { kind: 'tool'; ts: number; ev: LiveToolEvent };

/**
 * Full-height live-call transcript rail — Agent / Caller turns paired with the
 * orb. Separation is carried by hairlines and by three steps of neutral surface,
 * never by an accent edge: the orb is the product visual on this screen and the
 * rail beside it is chrome.
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
      className="flex max-h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--line-hairline)',
        background: 'var(--surface-card)',
      }}
      aria-label="Live transcription"
    >
      <header
        className="flex shrink-0 items-center justify-between"
        style={{
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-nav)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--fg-ink)',
          }}
        >
          Live transcript
        </span>
        <span className="chip chip--sm">
          <span
            aria-hidden
            className={`chip__dot chip__dot--${VOICE_STATE_META[state].dotTone}`}
            style={{ animation: 'dotPulse 2s var(--ease-standard) infinite' }}
          />
          {/* The dot's tone is the only thing carrying the session state here, so
              the state has to be said as well as coloured. */}
          <span className="sr-only">{VOICE_STATE_META[state].label}</span>
          {lines.length === 0
            ? 'waiting'
            : `${lines.length} turn${lines.length === 1 ? '' : 's'}`}
        </span>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: 'var(--space-3)', scrollbarGutter: 'stable' }}
      >
        {!ready || items.length === 0 ? (
          <EmptyState listening={ready} />
        ) : (
          <ul className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
            {items.map((item) =>
              item.kind === 'msg' ? (
                <TranscriptLine
                  key={item.line.id}
                  line={item.line}
                  agentName={agentName}
                  callStartMs={callStartMs}
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
    <div className="empty-state empty-state--bare">
      <p
        className="m-0"
        style={{
          maxWidth: 'var(--measure-prose)',
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-body)',
          color: 'var(--fg-muted)',
        }}
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
}: {
  line: LiveLine;
  agentName: string;
  callStartMs?: number;
}) {
  const isAgent = line.role === 'assistant';
  const label = isAgent ? agentName : 'Caller';

  return (
    <li className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
      <div
        className="relative max-w-[92%]"
        style={{
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--line-hairline)',
          // Two neutral steps rather than two hues: the agent sits back into the
          // panel, the caller sits forward off it.
          background: isAgent ? 'var(--surface-recessed)' : 'var(--surface-selected)',
        }}
      >
        <div className="mb-1 flex items-center" style={{ gap: 'var(--space-1)' }}>
          {isAgent ? (
            <AudioLines size={14} strokeWidth={2} style={{ color: 'var(--fg-muted)' }} aria-hidden />
          ) : (
            <User size={14} strokeWidth={2} style={{ color: 'var(--fg-muted)' }} aria-hidden />
          )}
          <span
            style={{
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-medium)',
              color: isAgent ? 'var(--fg-ink)' : 'var(--fg-body)',
            }}
          >
            {label}
          </span>
          <time
            className="num ml-auto"
            style={{ fontSize: 'var(--text-micro)', color: 'var(--fg-muted)' }}
            dateTime={new Date(line.timestamp).toISOString()}
          >
            {formatClock(line.timestamp, callStartMs)}
          </time>
        </div>
        <p
          className="m-0 whitespace-pre-wrap"
          style={{
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-body)',
            // An open utterance is still being revised by STT, so it reads back
            // a step until it commits.
            color: line.isFinal ? 'var(--fg-ink)' : 'var(--fg-body)',
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
  // A tool outcome is a status, which is the one thing besides the orb that
  // earns a hue. Everything else in this row is furniture.
  const tone = failed
    ? 'var(--status-error)'
    : running
      ? 'var(--fg-body)'
      : 'var(--status-success)';
  const expandable = ev.args !== undefined || ev.output !== undefined || ev.error != null;
  const status = running ? 'Running…' : failed ? 'Failed' : 'Completed';
  const caption = [status, ev.latencyMs != null ? `${ev.latencyMs}ms` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex justify-center">
      <div
        className="w-full overflow-hidden"
        style={{
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--line-hairline)',
          background: 'var(--surface-recessed)',
        }}
      >
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          className="focus-inset flex w-full items-center text-left"
          style={{
            gap: 'var(--space-2)',
            padding: 'var(--space-1) var(--space-3)',
            minHeight: 'var(--icon-button-size)',
            cursor: expandable ? 'pointer' : 'default',
          }}
          aria-expanded={expandable ? open : undefined}
        >
          <Wrench size={14} strokeWidth={2} style={{ color: 'var(--fg-muted)' }} aria-hidden />
          <span
            className="font-mono"
            style={{ fontSize: 'var(--text-caption)', color: 'var(--fg-ink)' }}
          >
            {ev.name}
          </span>
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              fontSize: 'var(--text-micro)',
              color: failed ? tone : 'var(--fg-muted)',
            }}
          >
            {caption}
          </span>
          <time
            className="num"
            style={{ fontSize: 'var(--text-micro)', color: 'var(--fg-muted)' }}
          >
            {formatClock(ev.timestamp, callStartMs)}
          </time>
          {running ? (
            <span
              aria-hidden
              style={{
                width: 'var(--dot-size)',
                height: 'var(--dot-size)',
                flex: '0 0 auto',
                borderRadius: 'var(--radius-pill)',
                background: tone,
                animation: 'dotPulse 1.4s var(--ease-standard) infinite',
              }}
            />
          ) : expandable ? (
            <ChevronDown
              size={16}
              strokeWidth={2}
              className="transition-transform"
              style={{ color: 'var(--fg-muted)', transform: open ? 'rotate(180deg)' : 'none' }}
              aria-hidden
            />
          ) : null}
        </button>
        {open && expandable && (
          <div
            className="flex flex-col"
            style={{
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              borderTop: '1px solid var(--line-hairline)',
            }}
          >
            {ev.args !== undefined && <MiniJson label="Input" value={ev.args} />}
            {ev.output !== undefined && <MiniJson label="Output" value={ev.output} />}
            {ev.error != null && (
              <p
                className="m-0"
                style={{ fontSize: 'var(--text-caption)', color: 'var(--status-error)' }}
              >
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
    <div className="flex flex-col gap-1">
      <span
        style={{
          fontSize: 'var(--text-overline)',
          fontWeight: 'var(--weight-medium)',
          letterSpacing: 'var(--tracking-overline)',
          color: 'var(--fg-muted)',
        }}
      >
        {label}
      </span>
      <pre className="code-block" style={{ padding: 'var(--space-1) var(--space-2)' }}>
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block align-[-0.1em]"
      style={{
        width: 2,
        height: '0.9em',
        background: 'var(--fg-ink)',
        animation: 'dotPulse 1.1s var(--ease-standard) infinite',
      }}
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
