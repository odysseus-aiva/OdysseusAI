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
 * Quiet glass rail so the orb stays the visual center.
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
    // Instant scroll — smooth animation lags behind live typing.
    el.scrollTop = el.scrollHeight;
  }, [lines.length, lastText]);

  return (
    <aside
      className="flex w-full flex-col overflow-hidden rounded-[18px]"
      style={{
        background: 'rgb(8 10 16 / 0.72)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 12px 40px rgb(0 0 0 / 0.45)',
        backdropFilter: 'blur(18px)',
        maxHeight: 'min(420px, 46vh)',
      }}
      aria-label="Live transcription"
    >
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ background: 'var(--color-accent)' }}
            />
            <span
              className="relative h-2 w-2 rounded-full"
              style={{ background: 'var(--color-accent)' }}
            />
          </span>
          <span
            className="text-[10px] font-[600] uppercase tracking-[0.24em]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            Live transcript
          </span>
        </div>
        <span
          className="font-mono text-[10.5px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {lines.length === 0
            ? 'waiting'
            : `${lines.length} turn${lines.length === 1 ? '' : 's'}`}
        </span>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ scrollbarGutter: 'stable' }}
      >
        {!ready || lines.length === 0 ? (
          <EmptyState listening={ready} />
        ) : (
          <ul className="flex flex-col gap-2.5">
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
  const accent = isAgent ? 'var(--color-accent)' : 'var(--color-text-muted)';

  return (
    <li
      className="relative rounded-[12px] px-3 py-2.5"
      style={{
        background: isAgent ? 'var(--color-accent-subtle)' : 'var(--color-glass)',
        border: `1px solid ${isAgent ? 'var(--color-accent-hairline)' : 'var(--color-border)'}`,
        boxShadow: isLatest && isAgent ? '0 0 24px var(--color-accent-glow)' : undefined,
      }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {isAgent ? (
          <AudioLines size={12} strokeWidth={2} style={{ color: accent }} />
        ) : (
          <User size={12} strokeWidth={2} style={{ color: accent }} />
        )}
        <span
          className="text-[11px] font-[600] tracking-[0.04em]"
          style={{ color: accent }}
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
          opacity: line.isFinal ? 1 : 0.78,
        }}
      >
        {line.text}
        {!line.isFinal ? <Caret /> : null}
      </p>
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
