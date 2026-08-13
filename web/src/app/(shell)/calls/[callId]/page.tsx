'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Phone,
  PhoneOff,
  AlertCircle,
  Wrench,
  MessageSquare,
  Activity,
  ChevronDown,
  Copy,
  Check,
  Sparkles,
  DollarSign,
  User,
  AudioLines,
  Mic,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  fetchCallDetail,
  fetchTranscript,
  type CallSummary,
  type CallAnalysis,
  type CallCost,
  type TranscriptEntry,
  type ToolCallRecord,
} from '@/lib/api/calls';
import type { CallStatus } from '@/lib/types/call-log';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallDetailPage() {
  const params = useParams<{ callId: string }>();
  const callId = decodeURIComponent(params.callId);

  const [call, setCall] = useState<CallSummary | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[] | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callData, transcriptData] = await Promise.all([
        fetchCallDetail(callId),
        fetchTranscript(callId).catch(() => null),
      ]);
      setCall(callData);
      setTranscript(transcriptData?.transcript ?? null);
      setToolCalls(transcriptData?.toolCalls ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call');
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => { void load(); }, [load]);

  // Interleave speech + tool executions into one chronological timeline so a
  // tool call renders at the exact point it happened, between the question that
  // triggered it and the answer that followed. Ordering only — no data change.
  const timeline = useMemo(
    () => buildTimeline(transcript ?? [], toolCalls),
    [transcript, toolCalls],
  );
  const messageCount = timeline.filter((i) => i.kind === 'message').length;
  const toolCount = timeline.length - messageCount;
  const agentName =
    call?.agentSnapshot?.name ??
    (call?.agentId ? `Agent ${call.agentId.slice(0, 8)}` : 'Agent');

  if (loading) return <DetailSkeleton />;
  if (error || !call) return <ErrorState message={error ?? 'Call not found'} callId={callId} />;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={`Call · ${callId.slice(0, 8)}…`} description="Full call record, transcript, and tool executions." />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl flex flex-col gap-6">

          {/* ── Summary header ─────────────────────────────────── */}
          <SummaryCard call={call} />

          {/* ── Recording ──────────────────────────────────────── */}
          {call.recordingUrl && (
            <Section title="Recording" icon={<Mic size={14} strokeWidth={2} />}>
              <RecordingPlayer callId={callId} />
            </Section>
          )}

          {/* ── AI Summary ─────────────────────────────────────── */}
          {call.analysis && (call.analysis.summary || call.analysis.sentiment) && (
            <Section title="AI Summary" icon={<Sparkles size={14} strokeWidth={2} />}>
              <AnalysisCard analysis={call.analysis} />
            </Section>
          )}

          {/* ── Latency breakdown ──────────────────────────────── */}
          {hasLatency(call.latencyMetrics) && (
            <Section title="Latency" icon={<Activity size={14} strokeWidth={2} />}>
              <LatencyBreakdown metrics={call.latencyMetrics} />
            </Section>
          )}

          {/* ── Cost breakdown ─────────────────────────────────── */}
          {call.cost && (
            <Section
              title="Cost"
              icon={<DollarSign size={14} strokeWidth={2} />}
              action={
                call.cost.estimated ? (
                  <span
                    className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-[500]"
                    style={{
                      background: 'rgb(251 191 36 / 0.08)',
                      color: 'var(--color-state-warning)',
                    }}
                  >
                    Estimated
                  </span>
                ) : undefined
              }
            >
              <CostBreakdown cost={call.cost} />
            </Section>
          )}

          {/* ── Conversation timeline ──────────────────────────── */}
          <Section
            title="Conversation"
            icon={<MessageSquare size={14} strokeWidth={2} />}
            action={
              timeline.length > 0 ? (
                <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
                  {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                  {toolCount > 0 && ` · ${toolCount} tool ${toolCount === 1 ? 'call' : 'calls'}`}
                </span>
              ) : undefined
            }
          >
            {timeline.length > 0 ? (
              <ConversationTimeline
                items={timeline}
                agentName={agentName}
                callStartMs={call.createdAt}
              />
            ) : (
              <EmptyConversation status={call.status} />
            )}
          </Section>

          {/* ── Errors ─────────────────────────────────────────── */}
          {(call.errors?.length ?? 0) > 0 && (
            <Section title="Errors" icon={<AlertCircle size={14} strokeWidth={2} />}>
              <ErrorList errors={call.errors} />
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ call }: { call: CallSummary }) {
  const agentName = call.agentSnapshot?.name ?? (call.agentId ? `Agent ${call.agentId.slice(0, 8)}` : 'Unknown agent');

  return (
    <div
      className="rounded-[12px] p-5 flex flex-col gap-4"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}
    >
      {/* Top row: agent + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-[600]" style={{ color: 'var(--color-text)' }}>
            {agentName}
          </span>
          <CopyableId id={call.callId} />
        </div>
        <StatusBadge status={call.status} endedBy={call.endedBy} />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Duration" value={call.durationMs != null ? formatDuration(call.durationMs) : '—'} />
        <Stat label="Turns" value={call.turnCount != null ? String(call.turnCount) : '—'} />
        <Stat label="Started" value={formatTime(call.createdAt)} />
        <Stat label="Ended by" value={formatEndedBy(call.endedBy)} />
      </div>

      {/* Agent snapshot pills */}
      {call.agentSnapshot && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {call.agentSnapshot.llmProvider && (
            <Pill label="LLM" value={call.agentSnapshot.llmProvider} />
          )}
          {call.agentSnapshot.ttsProvider && (
            <Pill label="TTS" value={call.agentSnapshot.ttsProvider} />
          )}
          {call.agentSnapshot.sttProvider && (
            <Pill label="STT" value={call.agentSnapshot.sttProvider} />
          )}
          {call.agentSnapshot.language && (
            <Pill label="Lang" value={call.agentSnapshot.language} />
          )}
          {call.agentSnapshot.enabledTools?.length > 0 && (
            <Pill label="Tools" value={String(call.agentSnapshot.enabledTools.length)} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Latency breakdown ────────────────────────────────────────────────────────

function LatencyBreakdown({ metrics }: { metrics: CallSummary['latencyMetrics'] }) {
  const bars: { label: string; value: number | undefined; max: number }[] = [
    { label: 'STT',   value: metrics.sttLatencyMs,   max: 1000 },
    { label: 'LLM',   value: metrics.llmLatencyMs,   max: 3000 },
    { label: 'TTS',   value: metrics.ttsLatencyMs,   max: 1000 },
    { label: 'Total', value: metrics.totalResponseLatencyMs, max: 4000 },
  ].filter((b) => b.value != null);

  return (
    <div className="flex flex-col gap-2.5">
      {bars.map(({ label, value, max }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="w-10 text-[11.5px] shrink-0" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-elevated)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ((value ?? 0) / max) * 100)}%`,
                background: latencyColor(value ?? 0),
              }}
            />
          </div>
          <span className="w-16 text-right text-[11.5px] font-mono shrink-0" style={{ color: latencyColor(value ?? 0) }}>
            {value != null ? `${value}ms` : '—'}
          </span>
        </div>
      ))}
      {(metrics.p50ResponseLatencyMs != null || metrics.p95ResponseLatencyMs != null) && (
        <div className="flex gap-4 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {metrics.p50ResponseLatencyMs != null && (
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              p50 <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{metrics.p50ResponseLatencyMs}ms</span>
            </span>
          )}
          {metrics.p95ResponseLatencyMs != null && (
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              p95 <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{metrics.p95ResponseLatencyMs}ms</span>
            </span>
          )}
          {metrics.turnsWithLatency != null && (
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-faint)' }}>
              across {metrics.turnsWithLatency} {metrics.turnsWithLatency === 1 ? 'turn' : 'turns'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cost breakdown ───────────────────────────────────────────────────────────

function CostBreakdown({ cost }: { cost: CallCost }) {
  const rows: {
    label: string;
    usd: number;
    detail: string;
    color: string;
  }[] = [
    {
      label: 'LLM',
      usd: cost.llmUsd,
      detail: [
        cost.breakdown.llm.model,
        `${formatCount(cost.breakdown.llm.promptTokens + cost.breakdown.llm.completionTokens)} tokens`,
      ]
        .filter(Boolean)
        .join(' · '),
      color: 'var(--color-accent)',
    },
    {
      label: 'TTS',
      usd: cost.ttsUsd,
      detail: [cost.breakdown.tts.provider, `${formatCount(cost.breakdown.tts.characters)} chars`]
        .filter(Boolean)
        .join(' · '),
      color: 'var(--color-state-thinking)',
    },
    {
      label: 'STT',
      usd: cost.sttUsd,
      detail: [cost.breakdown.stt.provider, `${cost.breakdown.stt.seconds}s`]
        .filter(Boolean)
        .join(' · '),
      color: 'var(--color-state-speaking)',
    },
  ];

  return (
    <div
      className="flex flex-col gap-3 rounded-[11px] p-4"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      {/* Headline total */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
          Total
        </span>
        <span className="text-[20px] font-[600] font-mono tracking-[-0.02em]" style={{ color: 'var(--color-text)' }}>
          {formatUsd(cost.totalUsd)}
        </span>
      </div>

      {/* Composition bar */}
      <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-surface-elevated)' }}>
        {rows.map((r) =>
          r.usd > 0 ? (
            <div
              key={r.label}
              style={{
                width: `${(r.usd / (cost.totalUsd || 1)) * 100}%`,
                background: r.color,
                opacity: 0.75,
              }}
            />
          ) : null,
        )}
      </div>

      {/* Per-component rows */}
      <div className="flex flex-col gap-2 pt-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="flex w-10 shrink-0 items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: r.color }} />
              {r.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
              {r.detail || '—'}
            </span>
            <span className="w-20 shrink-0 text-right font-mono text-[11.5px]" style={{ color: 'var(--color-text)' }}>
              {formatUsd(r.usd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sub-cent costs need more precision than a plain currency format. */
function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}

// ─── Conversation timeline ────────────────────────────────────────────────────
// A single chronological spine carrying both speech turns and tool executions.
// Speaker is conveyed by node + icon + label colour (Caller = neutral, Agent =
// cyan) rather than alternating bubbles or turn numbers — order + timestamps
// carry sequence. Tool calls sit inline, on the same spine, visually distinct.

type TimelineMessage = {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
};
type TimelineTool = {
  kind: 'tool';
  id: string;
  toolName: string;
  args?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success?: boolean;
  latencyMs?: number;
  ts: number;
};
type TimelineItem = TimelineMessage | TimelineTool;

/**
 * Build one chronological timeline from transcript entries + tool executions.
 * Speech is normalized first (junk dropped, same-speaker fragments merged), then
 * tools are interleaved by timestamp so each renders where it actually occurred.
 */
function buildTimeline(
  entries: TranscriptEntry[],
  toolCalls: ToolCallRecord[],
): TimelineItem[] {
  const items: TimelineItem[] = normalizeMessages(entries);

  toolCalls.forEach((t, i) => {
    items.push({
      kind: 'tool',
      id: `t${i}`,
      toolName: t.name,
      args: coerceArgs(t.input),
      output: t.output,
      error: t.error,
      success: t.success,
      ts: t.timestamp,
    });
  });

  return items.sort((a, b) => a.ts - b.ts);
}

/** Same-speaker chunks within this window are treated as one utterance/turn. */
const MERGE_GAP_MS = 6000;

/**
 * Turn raw transcript entries into clean, grouped messages:
 * - drop meaningless fragments (empty, "..", punctuation-only, whitespace)
 * - merge consecutive same-speaker chunks within MERGE_GAP_MS into one message
 * - collapse interim/final duplicates and prefix repeats
 * A change of speaker always starts a new message, so agent turns split runs.
 */
function normalizeMessages(entries: TranscriptEntry[]): TimelineMessage[] {
  const out: Array<TimelineMessage & { lastTs: number }> = [];

  for (const e of entries) {
    const text = collapseWhitespace(e.text ?? '');
    if (!isMeaningful(text)) continue;

    const prev = out[out.length - 1];
    const sameTurn =
      prev && prev.role === e.role && e.timestamp - prev.lastTs <= MERGE_GAP_MS;

    if (sameTurn) {
      prev.text = mergeText(prev.text, text);
      prev.lastTs = e.timestamp;
    } else {
      out.push({
        kind: 'message',
        id: `m${out.length}`,
        role: e.role,
        text,
        ts: e.timestamp,
        lastTs: e.timestamp,
      });
    }
  }

  return out.map(({ lastTs: _lastTs, ...m }) => m);
}

/** Tool args may arrive as an object or a JSON string — normalize for display. */
function coerceArgs(input: unknown): Record<string, unknown> | undefined {
  if (input == null) return undefined;
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* not JSON — fall through */
    }
    return { value: input };
  }
  if (typeof input === 'object') return input as Record<string, unknown>;
  return { value: input };
}

/** A fragment is meaningful only if it contains at least one letter or digit. */
function isMeaningful(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Join two same-speaker fragments, dropping interim/final and prefix duplicates. */
function mergeText(a: string, b: string): string {
  if (b === a || a.endsWith(b)) return a; // exact or trailing duplicate
  if (b.startsWith(a)) return b; // final is the interim's superset
  const joined = /^[.,!?;:]/.test(b) ? a + b : `${a} ${b}`;
  return collapseWhitespace(joined);
}

function ConversationTimeline({
  items,
  agentName,
  callStartMs,
}: {
  items: TimelineItem[];
  agentName: string;
  callStartMs: number;
}) {
  return (
    <ol className="relative flex flex-col">
      {/* the spine — a continuous hairline every node hangs on */}
      <span
        aria-hidden
        className="absolute left-[15px] top-2 bottom-2 w-px"
        style={{ background: 'var(--color-border)' }}
      />
      {items.map((item) =>
        item.kind === 'message' ? (
          <MessageRow key={item.id} item={item} agentName={agentName} callStartMs={callStartMs} />
        ) : (
          <ToolRow key={item.id} item={item} callStartMs={callStartMs} />
        ),
      )}
    </ol>
  );
}

function MessageRow({
  item,
  agentName,
  callStartMs,
}: {
  item: TimelineMessage;
  agentName: string;
  callStartMs: number;
}) {
  const isAgent = item.role === 'assistant';
  const name = isAgent ? agentName : 'Caller';
  const accent = isAgent ? 'var(--color-accent)' : 'var(--color-text-muted)';
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li className="group relative rounded-[10px] py-2 pl-11 pr-2 transition-colors hover:bg-[var(--color-glass)]">
      {/* speaker node */}
      <span
        aria-hidden
        className="absolute top-[13px] rounded-full"
        style={
          isAgent
            ? {
                left: 9,
                width: 13,
                height: 13,
                background: 'var(--color-accent)',
                boxShadow:
                  '0 0 0 3px var(--color-void), 0 0 0 4px var(--color-accent-ring), 0 0 12px var(--color-accent-glow)',
              }
            : {
                left: 10,
                width: 11,
                height: 11,
                background: 'var(--color-surface-elevated)',
                border: '1.5px solid var(--color-border-strong)',
                boxShadow: '0 0 0 3px var(--color-void)',
              }
        }
      />

      {/* header: speaker · time · copy */}
      <div className="flex items-center gap-2">
        {isAgent ? (
          <AudioLines size={12} strokeWidth={2} style={{ color: accent }} />
        ) : (
          <User size={12} strokeWidth={2} style={{ color: accent }} />
        )}
        <span className="text-[12px] font-[600] tracking-[0.01em]" style={{ color: accent }}>
          {name}
        </span>
        <time
          className="font-mono text-[10.5px]"
          style={{ color: 'var(--color-text-faint)' }}
          title={new Date(item.ts).toLocaleString()}
        >
          {formatOffset(item.ts - callStartMs)}
        </time>
        <button
          onClick={copy}
          aria-label="Copy message"
          className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {copied ? (
            <Check size={12} strokeWidth={2.5} style={{ color: 'var(--color-state-speaking)' }} />
          ) : (
            <Copy size={12} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
          )}
        </button>
      </div>

      {/* message body */}
      <p
        className="mt-1 max-w-[68ch] whitespace-pre-wrap text-[13.5px] leading-[1.62]"
        style={{ color: 'var(--color-text)' }}
      >
        {item.text}
      </p>
    </li>
  );
}

function ToolRow({ item, callStartMs }: { item: TimelineTool; callStartMs: number }) {
  const [open, setOpen] = useState(false);
  const failed = item.success === false || item.error != null;
  const tone = failed ? 'var(--color-state-error)' : 'var(--color-state-thinking)';
  const expandable = item.args !== undefined || item.output !== undefined || item.error != null;

  const caption = [
    firstArgValue(item.args),
    failed ? 'Failed' : 'Completed',
    item.latencyMs != null ? `${item.latencyMs}ms` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <li className="relative py-1.5 pl-11">
      {/* tool node — a diamond, distinct from the round speech nodes */}
      <span
        aria-hidden
        className="absolute left-[10px] top-[13px] rotate-45 rounded-[2px]"
        style={{
          width: 9,
          height: 9,
          background: 'var(--color-surface)',
          border: `1.5px solid ${tone}`,
          boxShadow: '0 0 0 3px var(--color-void)',
        }}
      />

      <div
        className="overflow-hidden rounded-[8px] border transition-colors"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}
      >
        <button
          onClick={() => expandable && setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--color-glass)]"
          style={{ cursor: expandable ? 'pointer' : 'default' }}
          aria-expanded={expandable ? open : undefined}
        >
          <Wrench size={11} strokeWidth={2.2} style={{ color: tone }} />
          <span
            className="text-[10px] font-[600] uppercase tracking-[0.13em]"
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
          <time className="font-mono text-[10.5px] shrink-0" style={{ color: 'var(--color-text-faint)' }}>
            {formatOffset(item.ts - callStartMs)}
          </time>
          {expandable && (
            <ChevronDown
              size={13}
              strokeWidth={2}
              className="shrink-0 transition-transform duration-200"
              style={{ color: 'var(--color-text-faint)', transform: open ? 'rotate(180deg)' : 'none' }}
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
                  <JsonBlock label="Result" value={item.output as Parameters<typeof JsonBlock>[0]['value']} />
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

/** First human-meaningful argument value, for the tool's one-line caption. */
function firstArgValue(args?: Record<string, unknown>): string | null {
  if (!args) return null;
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Compact elapsed offset from call start, e.g. "0:03", "1:24". */
function formatOffset(deltaMs: number): string {
  const ms = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function EmptyConversation({ status }: { status: CallStatus }) {
  const message =
    status === 'error'
      ? 'This call ended in an error before any conversation was captured.'
      : status === 'in_progress'
        ? 'This call is still in progress — the conversation will appear as it happens.'
        : 'No conversation was captured for this call.';
  return (
    <div
      className="flex flex-col items-center gap-2.5 rounded-[12px] py-11 text-center"
      style={{ border: '1px dashed var(--color-border)', background: 'var(--color-surface)' }}
    >
      <MessageSquare size={18} strokeWidth={1.8} style={{ color: 'var(--color-text-faint)' }} />
      <p className="max-w-[36ch] text-[12.5px] leading-[1.5]" style={{ color: 'var(--color-text-muted)' }}>
        {message}
      </p>
    </div>
  );
}

// ─── Recording player ─────────────────────────────────────────────────────────

function RecordingPlayer({ callId }: { callId: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { void audio.play(); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track || !knownDuration) return;
    const rect = track.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '--:--';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const knownDuration = Number.isFinite(duration) && duration > 0;
  const pct = knownDuration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="flex items-center gap-3 rounded-[10px] px-4 py-3"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <audio
        ref={audioRef}
        src={`/api/calls/${encodeURIComponent(callId)}/recording`}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
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
            // Streaming response without Content-Length: seek to end so the
            // browser determines the real duration, then reset to start.
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
      />

      {/* Play / Pause */}
      <button
        onClick={toggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={{ background: 'var(--color-accent)' }}
      >
        {isPlaying
          ? <Pause  size={12} strokeWidth={2.5} style={{ color: 'var(--color-void)' }} />
          : <Play   size={12} strokeWidth={2.5} style={{ color: 'var(--color-void)', marginLeft: 1 }} />}
      </button>

      {/* Elapsed */}
      <span className="w-9 shrink-0 font-mono text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
        {fmt(currentTime)}
      </span>

      {/* Progress track */}
      <div
        ref={trackRef}
        onClick={seek}
        className="relative h-1 flex-1 cursor-pointer rounded-full"
        style={{ background: 'var(--color-surface-elevated)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: 'var(--color-accent)', opacity: 0.85 }}
        />
        {/* Scrubber dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full transition-opacity"
          style={{
            left: `${pct}%`,
            background: 'var(--color-accent)',
            opacity: knownDuration ? 1 : 0,
            boxShadow: '0 0 0 2px var(--color-surface-raised)',
          }}
        />
      </div>

      {/* Duration */}
      <span className="w-9 shrink-0 text-right font-mono text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
        {fmt(duration)}
      </span>

      {/* Mute */}
      <button
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.muted = !muted;
          setMuted(!muted);
        }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="shrink-0 transition-opacity hover:opacity-70"
        style={{ color: 'var(--color-text-faint)' }}
      >
        {muted
          ? <VolumeX size={13} strokeWidth={2} />
          : <Volume2 size={13} strokeWidth={2} />}
      </button>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--color-text-faint)' }}>{icon}</span>
        <h2 className="text-[12px] font-[600] uppercase tracking-[0.08em]" style={{ color: 'var(--color-text-faint)' }}>
          {title}
        </h2>
        {action && <span className="ml-1">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
      <span className="text-[13px] font-[500]" style={{ color: 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
      style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
    >
      <span style={{ color: 'var(--color-text-faint)' }}>{label}</span>
      <span style={{ color: 'var(--color-text)' }}>{value}</span>
    </span>
  );
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-left"
      title="Copy call ID"
    >
      <span className="text-[11px] font-mono truncate max-w-[200px]" style={{ color: 'var(--color-text-faint)' }}>
        {id}
      </span>
      {copied
        ? <Check size={11} strokeWidth={2.5} style={{ color: 'var(--color-state-speaking)' }} />
        : <Copy size={11} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />}
    </button>
  );
}

function JsonBlock({ label, value }: { label: string; value: string | number | boolean | Record<string, unknown> | unknown[] | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.07em]" style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
      <pre
        className="text-[11.5px] rounded p-2 overflow-x-auto"
        style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {errors.map((e, i) => (
        <p key={i} className="text-[12.5px]" style={{ color: 'var(--color-state-error)' }}>
          {e}
        </p>
      ))}
    </div>
  );
}

const SENTIMENT_CONFIG = {
  positive: { label: 'Positive', color: 'var(--color-state-speaking)' },
  negative: { label: 'Negative', color: 'var(--color-state-error)' },
  neutral:  { label: 'Neutral',  color: 'var(--color-text-muted)' },
} as const;

function AnalysisCard({ analysis }: { analysis: CallAnalysis }) {
  const sentiment = analysis.sentiment ? SENTIMENT_CONFIG[analysis.sentiment] : null;
  return (
    <div
      className="rounded-[10px] p-4 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      {analysis.summary && (
        <p className="text-[13px] leading-[1.55]" style={{ color: 'var(--color-text)' }}>
          {analysis.summary}
        </p>
      )}
      {sentiment && (
        <span
          className="self-start text-[11px] font-[600] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
          style={{
            color: sentiment.color,
            background: `color-mix(in srgb, ${sentiment.color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${sentiment.color} 25%, transparent)`,
          }}
        >
          {sentiment.label}
        </span>
      )}
    </div>
  );
}

// ─── Status badge (reused from list page pattern) ─────────────────────────────

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string; icon: React.ElementType }> = {
  completed:   { label: 'Completed',   color: 'var(--color-state-speaking)', icon: PhoneOff },
  in_progress: { label: 'In progress', color: 'var(--color-accent)',         icon: Phone },
  error:       { label: 'Error',       color: 'var(--color-state-error)',     icon: AlertCircle },
};

function StatusBadge({ status, endedBy }: { status: CallStatus; endedBy?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  const Icon = cfg.icon;
  const label = endedBy === 'agent' ? 'Agent ended' : cfg.label;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-[500] shrink-0" style={{ color: cfg.color }}>
      <Icon size={11} strokeWidth={2.2} />
      {label}
    </span>
  );
}

// ─── Skeleton / error states ──────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div style={{ height: 64, background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }} />
      <div className="flex-1 px-8 py-6">
        <div className="max-w-4xl flex flex-col gap-6">
          {[120, 80, 300, 200].map((h, i) => (
            <div
              key={i}
              className="animate-pulse rounded-[12px]"
              style={{ height: h, background: 'var(--color-surface-raised)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, callId }: { message: string; callId: string }) {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title={`Call · ${callId.slice(0, 8)}…`} />
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <AlertCircle size={24} style={{ color: 'var(--color-state-error)' }} />
          <p className="text-[13.5px] font-[500]" style={{ color: 'var(--color-text)' }}>
            Could not load call
          </p>
          <p className="text-[12.5px]" style={{ color: 'var(--color-state-error)' }}>{message}</p>
          <Link href="/calls">
            <Button variant="ghost" size="sm">Back to history</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatEndedBy(endedBy?: string): string {
  switch (endedBy) {
    case 'participant': return 'Participant';
    case 'agent':       return 'Agent';
    case 'timeout':     return 'Timeout';
    case 'error':       return 'Error';
    default:            return '—';
  }
}

function latencyColor(ms: number): string {
  if (ms < 800)  return 'var(--color-state-speaking)';
  if (ms < 1800) return 'var(--color-state-warning, #f59e0b)';
  return 'var(--color-state-error)';
}

function hasLatency(m: CallSummary['latencyMetrics']): boolean {
  return (
    m.totalResponseLatencyMs != null ||
    m.sttLatencyMs != null ||
    m.llmLatencyMs != null ||
    m.ttsLatencyMs != null
  );
}
