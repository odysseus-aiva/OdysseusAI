'use client';

import {
  useCallback,
  useEffect,
  useId,
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
      /* The active hit inverts to ink the way a running pill does; the rest
         take a neutral surface step. Highlighting is emphasis, not status. */
      <mark
        key={`${r.start}-${i}`}
        className="rounded-xs px-0.5"
        style={
          active
            ? { background: 'var(--fg-ink)', color: 'var(--fg-on-ink)' }
            : { background: 'var(--surface-selected)', color: 'inherit' }
        }
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
        style={{ borderBottom: '1px solid var(--line-hairline)' }}
      >
        <h2 className="section__title">Transcript</h2>
        {language && <span className="badge ml-auto">{language}</span>}
      </div>

      {/* Toolbar — same control height/radius as Call History filters */}
      <div
        className="flex flex-none flex-wrap items-center gap-2 px-3 py-3 lg:px-4"
        style={{ borderBottom: '1px solid var(--line-hairline)' }}
      >
        <label className="relative flex min-w-0 flex-1 items-center" style={{ minWidth: 140 }}>
          <Search
            size={16}
            strokeWidth={2}
            aria-hidden
            className="pointer-events-none absolute left-3"
            style={{ color: 'var(--fg-muted)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search transcript…"
            className="input pl-9 pr-9"
            aria-label="Search transcript"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="icon-btn focus-inset absolute right-1"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </label>

        {matches.length > 0 && (
          <div className="flex items-center gap-1">
            <span
              className="num px-1 text-micro"
              style={{ color: 'var(--fg-muted)' }}
              aria-live="polite"
            >
              {matchIndex + 1}/{matches.length}
            </span>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous match"
              className="icon-btn focus-inset"
            >
              <ChevronUp size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next match"
              className="icon-btn focus-inset"
            >
              <ChevronDown size={16} strokeWidth={2} />
            </button>
          </div>
        )}

        <div className="segmented" role="group" aria-label="Speaker filter">
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
                className="segmented__item focus-inset"
                data-active={on || undefined}
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
  /* Speaker is carried by the label, the icon and one surface step — never by
     hue. Tinting the two speakers differently would be a two-colour categorical
     system, which is the loudest colour-as-chrome violation available here. */
  const speakerInk = isAgent ? 'var(--fg-ink)' : 'var(--fg-body)';
  const offset = formatOffset(item.ts - callStartMs);
  const seekTo = offsetSeconds(item.ts, callStartMs);

  return (
    <li
      ref={registerRef}
      className="rounded-md px-3 py-2 transition-colors duration-[120ms]"
      style={{
        background: isPlaying
          ? 'var(--surface-selected)'
          : isSearchHit
            ? 'var(--surface-hover)'
            : isAgent
              ? 'var(--surface-recessed)'
              : 'transparent',
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        {isAgent ? (
          <AudioLines size={14} strokeWidth={2} aria-hidden="true" style={{ color: speakerInk }} />
        ) : (
          <User size={14} strokeWidth={2} aria-hidden="true" style={{ color: speakerInk }} />
        )}
        <span className="text-caption font-medium" style={{ color: speakerInk }}>
          {name}
        </span>
        <button
          type="button"
          onClick={() => onSeek(seekTo)}
          className="num focus-inset rounded-xs font-mono text-micro text-[var(--fg-muted)] transition-colors duration-[120ms] hover:text-[var(--fg-ink)]"
          aria-label={`Seek recording to ${offset}`}
          title="Seek recording to this moment"
        >
          {offset}
        </button>
      </div>
      <p
        className="whitespace-pre-wrap text-nav leading-body"
        style={{ color: 'var(--fg-strong)' }}
      >
        <HighlightedText text={item.text} query={query} active={isSearchHit} />
      </p>
    </li>
  );
}

function ToolTurn({ item, callStartMs }: { item: TimelineTool; callStartMs: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const failed = item.success === false || item.error != null;
  const tone = failed ? 'var(--status-error)' : 'var(--fg-muted)';
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
        className="overflow-hidden rounded-md"
        style={{
          border: '1px solid var(--line-hairline)',
          background: 'var(--surface-recessed)',
        }}
      >
        <button
          type="button"
          onClick={() => expandable && setOpen((v) => !v)}
          className="focus-inset flex w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]"
          style={{ cursor: expandable ? 'pointer' : 'default' }}
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? panelId : undefined}
        >
          <Wrench size={14} strokeWidth={2} aria-hidden="true" style={{ color: tone }} />
          <span className="text-micro" style={{ color: 'var(--fg-muted)' }}>
            Tool
          </span>
          <span className="font-mono text-caption" style={{ color: 'var(--fg-ink)' }}>
            {item.toolName}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-caption"
            style={{ color: failed ? tone : 'var(--fg-body)' }}
          >
            {caption}
          </span>
          <time className="num shrink-0 font-mono text-micro" style={{ color: 'var(--fg-muted)' }}>
            {formatOffset(item.ts - callStartMs)}
          </time>
          {expandable && (
            <ChevronDown
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className="shrink-0 transition-transform duration-[120ms]"
              style={{
                color: 'var(--fg-muted)',
                transform: open ? 'rotate(180deg)' : undefined,
              }}
            />
          )}
        </button>
        {/* The disclosure does not tween its height: nothing in this language
            animates layout. */}
        {open && expandable && (
          <div
            id={panelId}
            className="flex flex-col gap-3 px-3 pb-3 pt-3"
            style={{
              borderTop: '1px solid var(--line-hairline)',
              background: 'var(--surface-card)',
            }}
          >
            {item.args !== undefined && <JsonBlock label="Arguments" value={item.args} />}
            {item.output !== undefined && (
              <JsonBlock
                label="Result"
                value={item.output as Parameters<typeof JsonBlock>[0]['value']}
              />
            )}
            {item.error != null && (
              <p className="text-caption" style={{ color: 'var(--status-error)' }}>
                Error: {String(item.error)}
              </p>
            )}
          </div>
        )}
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
      <span className="text-micro" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </span>
      <pre className="code-block p-2">{JSON.stringify(value, null, 2)}</pre>
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
    <div className="empty-state" aria-live="polite">
      <span className="empty-state__tile" aria-hidden="true">
        <MessageSquare size={20} strokeWidth={1.7} />
      </span>
      <p className="empty-state__body mb-0">{message}</p>
    </div>
  );
}
