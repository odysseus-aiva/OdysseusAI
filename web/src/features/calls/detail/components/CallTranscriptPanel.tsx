'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Search,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { CallStatus } from '@/lib/types/call-log';
import {
  firstArgValue,
  formatOffset,
  offsetSeconds,
  type TimelineItem,
  type TimelineMessage,
  type TimelineTool,
} from '../utils';

export type SpeakerFilter = 'all' | 'caller' | 'agent';

type Match = { itemId: string; start: number; end: number };

function findMatches(text: string, query: string): { start: number; end: number }[] {
  if (!query.trim()) return [];
  const q = query.trim();
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: { start: number; end: number }[] = [];
  let from = 0;
  while (from < lower.length) {
    const idx = lower.indexOf(needle, from);
    if (idx === -1) break;
    out.push({ start: idx, end: idx + needle.length });
    from = idx + needle.length;
  }
  return out;
}

function HighlightedText({
  text,
  query,
  active,
}: {
  text: string;
  query: string;
  active: boolean;
}) {
  const ranges = findMatches(text, query);
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark
        key={`${r.start}-${i}`}
        className="rounded-[2px] px-0.5"
          style={{
            background: active
              ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)'
              : 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
            color: 'inherit',
          }}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function CallTranscriptPanel({
  timeline,
  agentName,
  callStartMs,
  status,
  language,
  currentTimeSec,
  onSeek,
}: {
  timeline: TimelineItem[];
  agentName: string;
  callStartMs: number;
  status: CallStatus;
  language?: string;
  currentTimeSec: number;
  onSeek: (seconds: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<SpeakerFilter>('all');
  const [matchIndex, setMatchIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  const filtered = useMemo(() => {
    return timeline.filter((item) => {
      if (item.kind === 'tool') return speaker === 'all';
      if (speaker === 'caller') return item.role === 'user';
      if (speaker === 'agent') return item.role === 'assistant';
      return true;
    });
  }, [timeline, speaker]);

  const matches = useMemo(() => {
    if (!query.trim()) return [] as Match[];
    const out: Match[] = [];
    for (const item of filtered) {
      if (item.kind !== 'message') continue;
      for (const r of findMatches(item.text, query)) {
        out.push({ itemId: item.id, start: r.start, end: r.end });
      }
    }
    return out;
  }, [filtered, query]);

  useEffect(() => {
    setMatchIndex(0);
  }, [query, speaker]);

  const activeMatch = matches[matchIndex] ?? null;

  const activeMessageId = useMemo(() => {
    const messages = filtered.filter((i): i is TimelineMessage => i.kind === 'message');
    if (messages.length === 0) return null;
    let active: string | null = null;
    for (const m of messages) {
      const start = offsetSeconds(m.ts, callStartMs);
      if (currentTimeSec + 0.15 >= start) active = m.id;
      else break;
    }
    return active;
  }, [filtered, currentTimeSec, callStartMs]);

  useEffect(() => {
    if (!activeMatch) return;
    const el = rowRefs.current.get(activeMatch.itemId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeMatch]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setMatchIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setMatchIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('');
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    }
  };

  const messageCount = timeline.filter((i) => i.kind === 'message').length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex flex-none items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <h2
          className="text-[13px] font-[600] tracking-[-0.015em]"
          style={{ color: 'var(--color-text)' }}
        >
          Transcript
        </h2>
        {language && (
          <span
            className="ml-auto rounded-[6px] px-2 py-0.5 text-[11px] font-[450]"
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text-faint)',
              border: '1px solid var(--color-border)',
            }}
          >
            {language}
          </span>
        )}
      </div>

      {/* Toolbar — same control height/radius as Call History filters */}
      <div
        className="flex flex-none flex-wrap items-center gap-2 px-3 py-2.5 lg:px-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
            <label
              className="relative flex min-w-0 flex-1 items-center"
              style={{ minWidth: 140 }}
            >
              <Search
                size={13}
                strokeWidth={2}
                className="pointer-events-none absolute left-3"
                style={{ color: 'var(--color-text-faint)' }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search transcript…"
                className="w-full rounded-[9px] py-2 pl-9 pr-8 text-[13px] outline-none transition-colors duration-[140ms]"
                style={{
                  background: 'var(--color-void)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  height: 36,
                }}
                aria-label="Search transcript"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-focus)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 flex h-5 w-5 items-center justify-center rounded-[5px]"
                  style={{ color: 'var(--color-text-faint)' }}
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </label>

            {matches.length > 0 && (
              <div className="flex items-center gap-0.5">
                <span className="px-1 text-[11px] tabular-nums" style={{ color: 'var(--color-text-faint)' }}>
                  {matchIndex + 1}/{matches.length}
                </span>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Previous match"
                  className="rounded-[6px] p-1.5 hover:bg-[var(--color-glass-hover)]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <ChevronUp size={14} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Next match"
                  className="rounded-[6px] p-1.5 hover:bg-[var(--color-glass-hover)]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <ChevronDown size={14} strokeWidth={2} />
                </button>
              </div>
            )}

            <div
              className="flex items-center gap-0.5 rounded-[9px] p-0.5"
              style={{ background: 'var(--color-void)', border: '1px solid var(--color-border)' }}
              role="group"
              aria-label="Speaker filter"
            >
              {(
                [
                  { id: 'all' as const, label: 'All' },
                  { id: 'caller' as const, label: 'Caller' },
                  { id: 'agent' as const, label: 'Agent' },
                ] as const
              ).map((opt) => {
                const on = speaker === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSpeaker(opt.id)}
                    className="rounded-[7px] px-2.5 py-1.5 text-[12px] font-[450]"
                    style={{
                      color: on ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      background: on ? 'var(--color-nav-active-bg)' : 'transparent',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-4">
            {filtered.length === 0 ? (
              <EmptyTranscript status={status} hasMessages={messageCount > 0} />
            ) : (
              <ol className="flex flex-col gap-3">
                {filtered.map((item) =>
                  item.kind === 'message' ? (
                    <MessageTurn
                      key={item.id}
                      item={item}
                      agentName={agentName}
                      callStartMs={callStartMs}
                      query={query}
                      isPlaying={activeMessageId === item.id}
                      isSearchHit={activeMatch?.itemId === item.id}
                      onSeek={onSeek}
                      registerRef={(el) => {
                        if (el) rowRefs.current.set(item.id, el);
                        else rowRefs.current.delete(item.id);
                      }}
                    />
                  ) : (
                    <ToolTurn key={item.id} item={item} callStartMs={callStartMs} />
                  ),
                )}
              </ol>
            )}
          </div>
    </div>
  );
}

function MessageTurn({
  item,
  agentName,
  callStartMs,
  query,
  isPlaying,
  isSearchHit,
  onSeek,
  registerRef,
}: {
  item: TimelineMessage;
  agentName: string;
  callStartMs: number;
  query: string;
  isPlaying: boolean;
  isSearchHit: boolean;
  onSeek: (seconds: number) => void;
  registerRef: (el: HTMLElement | null) => void;
}) {
  const isAgent = item.role === 'assistant';
  const name = isAgent ? agentName : 'Caller';
  const accent = isAgent ? 'var(--color-accent)' : 'var(--color-text-muted)';
  const seekTo = offsetSeconds(item.ts, callStartMs);

  return (
    <li
      ref={registerRef}
      className="rounded-[10px] px-2.5 py-2 transition-colors duration-[140ms]"
      style={{
        background: isPlaying
          ? 'var(--color-accent-subtle)'
          : isSearchHit
            ? 'var(--color-glass)'
            : 'transparent',
        border: isPlaying
          ? '1px solid var(--color-accent-hairline)'
          : '1px solid transparent',
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        {isAgent ? (
          <AudioLines size={12} strokeWidth={2} style={{ color: accent }} />
        ) : (
          <User size={12} strokeWidth={2} style={{ color: accent }} />
        )}
        <span className="text-[12px] font-[550] tracking-[-0.01em]" style={{ color: accent }}>
          {name}
        </span>
        <button
          type="button"
          onClick={() => onSeek(seekTo)}
          className="font-mono text-[10.5px] tabular-nums transition-opacity hover:opacity-100"
          style={{ color: 'var(--color-text-faint)' }}
          title="Seek recording to this moment"
        >
          {formatOffset(item.ts - callStartMs)}
        </button>
      </div>
      <p
        className="whitespace-pre-wrap text-[13px] leading-[1.55]"
        style={{ color: 'var(--color-text)' }}
      >
        <HighlightedText text={item.text} query={query} active={isSearchHit} />
      </p>
    </li>
  );
}

function ToolTurn({ item, callStartMs }: { item: TimelineTool; callStartMs: number }) {
  const [open, setOpen] = useState(false);
  const failed = item.success === false || item.error != null;
  const tone = failed
    ? 'color-mix(in srgb, var(--color-state-error) 40%, var(--color-text-muted))'
    : 'var(--color-text-faint)';
  const expandable = item.args !== undefined || item.output !== undefined || item.error != null;
  const caption = [
    firstArgValue(item.args),
    failed ? 'Failed' : 'Completed',
    item.latencyMs != null ? `${item.latencyMs}ms` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <li className="pl-1">
      <div
        className="overflow-hidden rounded-[8px]"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}
      >
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-glass)]"
          style={{ cursor: expandable ? 'pointer' : 'default' }}
          aria-expanded={expandable ? open : undefined}
        >
          <Wrench size={11} strokeWidth={2.2} style={{ color: tone }} />
          <span
            className="text-[10px] font-[600] uppercase tracking-[0.12em]"
            style={{ color: 'var(--color-text-faint)' }}
          >
            Tool
          </span>
          <span className="font-mono text-[12px]" style={{ color: 'var(--color-text)' }}>
            {item.toolName}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[11.5px]"
            style={{ color: failed ? tone : 'var(--color-text-muted)' }}
          >
            {caption}
          </span>
          <time className="shrink-0 font-mono text-[10.5px]" style={{ color: 'var(--color-text-faint)' }}>
            {formatOffset(item.ts - callStartMs)}
          </time>
          {expandable && (
            <ChevronDown
              size={13}
              strokeWidth={2}
              className="shrink-0 transition-transform duration-200"
              style={{
                color: 'var(--color-text-faint)',
                transform: open ? 'rotate(180deg)' : 'none',
              }}
            />
          )}
        </button>
        <AnimatePresence initial={false}>
          {open && expandable && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div
                className="flex flex-col gap-2 border-t px-3 pb-3 pt-2.5"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {item.args !== undefined && <JsonBlock label="Arguments" value={item.args} />}
                {item.output !== undefined && (
                  <JsonBlock
                    label="Result"
                    value={item.output as Parameters<typeof JsonBlock>[0]['value']}
                  />
                )}
                {item.error != null && (
                  <p className="text-[12px]" style={{ color: 'var(--color-state-error)' }}>
                    Error: {String(item.error)}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

function JsonBlock({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | Record<string, unknown> | unknown[] | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10.5px] uppercase tracking-[0.07em]"
        style={{ color: 'var(--color-text-faint)' }}
      >
        {label}
      </span>
      <pre
        className="overflow-x-auto rounded p-2 text-[11.5px]"
        style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function EmptyTranscript({
  status,
  hasMessages,
}: {
  status: CallStatus;
  hasMessages: boolean;
}) {
  const message = hasMessages
    ? 'No turns match this speaker filter.'
    : status === 'error'
      ? 'This call ended in an error before any conversation was captured.'
      : status === 'in_progress'
        ? 'This call is still in progress — the conversation will appear as it happens.'
        : 'No conversation was captured for this call.';

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-[10px] py-10 text-center"
      style={{ border: '1px dashed var(--color-border)' }}
    >
      <MessageSquare size={18} strokeWidth={1.8} style={{ color: 'var(--color-text-faint)' }} />
      <p className="max-w-[32ch] text-[12.5px] leading-[1.5]" style={{ color: 'var(--color-text-muted)' }}>
        {message}
      </p>
    </div>
  );
}
