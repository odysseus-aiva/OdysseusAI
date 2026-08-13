'use client';

import { useEffect, useRef } from 'react';
import { AudioLines, User } from 'lucide-react';
import type { LiveLine } from '../hooks/useLiveTranscript';

interface LiveTranscriptPanelProps {
  lines: LiveLine[];
  ready: boolean;
  agentName?: string;
}

/**
 * Live call captions — Agent / Customer turns beside the orb.
 * Token-driven so light mode stays bright paper; dark stays quiet glass.
 */
export function LiveTranscriptPanel({
  lines,
  ready,
  agentName = 'Agent',
}: LiveTranscriptPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastText = lines.at(-1)?.text ?? '';

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, lastText]);

  return (
    <aside
      className="flex w-full flex-col overflow-hidden rounded-[18px]"
      style={{
        /* Elevated cool sheet — separates from pale void in light mode */
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-strong)',
        boxShadow:
          '0 1px 0 var(--color-border-strong), 0 16px 40px rgb(12 17 32 / 0.14)',
        maxHeight: 'min(420px, 46vh)',
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
              style={{ background: 'var(--color-accent)' }}
            />
            <span
              className="relative h-2 w-2 rounded-full"
              style={{ background: 'var(--color-accent)' }}
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
        {!ready || lines.length === 0 ? (
          <EmptyState listening={ready} />
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <TranscriptLine
                key={line.id}
                line={line}
                agentName={agentName}
                isLatest={index === lines.length - 1}
              />
            ))}
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
  isLatest,
}: {
  line: LiveLine;
  agentName: string;
  isLatest: boolean;
}) {
  const isAgent = line.role === 'assistant';
  const label = isAgent ? agentName : 'Customer';

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
            {formatClock(line.timestamp)}
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

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[0.9em] w-[2px] align-[-0.1em] animate-pulse"
      style={{ background: 'var(--color-accent)' }}
    />
  );
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
