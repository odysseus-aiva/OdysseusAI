'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight,
  Clock,
  Phone,
  PhoneOff,
  AlertCircle,
  Wrench,
  MessageSquare,
  Activity,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Sparkles,
  DollarSign,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import {
  fetchCallDetail,
  fetchTranscript,
  fetchCallEvents,
  type CallSummary,
  type CallAnalysis,
  type CallCost,
  type TranscriptEntry,
  type CallEvent,
} from '@/lib/api/calls';
import type { CallStatus } from '@/lib/types/call-log';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallDetailPage() {
  const params = useParams<{ callId: string }>();
  const callId = decodeURIComponent(params.callId);

  const [call, setCall] = useState<CallSummary | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[] | null>(null);
  const [toolEvents, setToolEvents] = useState<CallEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callData, transcriptData, eventsData] = await Promise.all([
        fetchCallDetail(callId),
        fetchTranscript(callId).catch(() => null),
        fetchCallEvents(callId, { step: 'tool_call,tool_result', limit: 200 }).catch(() => ({ total: 0, events: [] })),
      ]);
      setCall(callData);
      setTranscript(transcriptData?.transcript ?? null);
      setToolEvents(eventsData.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load call');
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <DetailSkeleton />;
  if (error || !call) return <ErrorState message={error ?? 'Call not found'} callId={callId} />;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={`Call · ${callId.slice(0, 8)}…`} description="Full call record, transcript, and tool executions." />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl flex flex-col gap-6">

          {/* ── Summary header ─────────────────────────────────── */}
          <SummaryCard call={call} />

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

          {/* ── Transcript ─────────────────────────────────────── */}
          <Section title="Transcript" icon={<MessageSquare size={14} strokeWidth={2} />}>
            {transcript && transcript.length > 0
              ? <TranscriptViewer entries={transcript} />
              : <EmptySection label="No transcript available" />}
          </Section>

          {/* ── Tool executions ────────────────────────────────── */}
          {toolEvents.length > 0 && (
            <Section title="Tool Executions" icon={<Wrench size={14} strokeWidth={2} />}>
              <ToolTimeline events={toolEvents} />
            </Section>
          )}

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

// ─── Transcript viewer ────────────────────────────────────────────────────────

function TranscriptViewer({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => (
        <TranscriptBubble key={i} entry={entry} />
      ))}
    </div>
  );
}

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div
        className="max-w-[80%] rounded-[10px] px-3.5 py-2.5 flex flex-col gap-1"
        style={{
          background: isUser ? 'var(--color-surface-elevated)' : 'var(--color-accent)',
          color: isUser ? 'var(--color-text)' : '#fff',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-[500] uppercase tracking-[0.07em] opacity-60">
            {isUser ? 'User' : 'Agent'}
            {entry.turnIndex != null ? ` · #${entry.turnIndex}` : ''}
          </span>
          <span className="text-[10.5px] opacity-50 shrink-0">
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <p className="text-[13px] leading-[1.5]">{entry.text}</p>
        {entry.toolCallNames && entry.toolCallNames.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {entry.toolCallNames.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.15)', color: 'inherit' }}
              >
                <Wrench size={8} className="inline mr-1" strokeWidth={2.5} />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool timeline ────────────────────────────────────────────────────────────

function ToolTimeline({ events }: { events: CallEvent[] }) {
  // Pair up tool_call + tool_result events by toolName proximity
  const pairs: Array<{ call?: CallEvent; result?: CallEvent }> = [];
  const calls = events.filter((e) => e.step === 'tool_call');
  const results = events.filter((e) => e.step === 'tool_result');

  for (const c of calls) {
    const cData = c.data as Record<string, unknown> | undefined;
    const toolName = cData?.toolName as string | undefined;
    const match = results.find((r) => {
      const rData = r.data as Record<string, unknown> | undefined;
      return rData?.toolName === toolName && r.timestamp >= c.timestamp;
    });
    pairs.push({ call: c, result: match });
  }

  return (
    <div className="flex flex-col gap-2">
      {pairs.map((pair, i) => (
        <ToolRow key={i} pair={pair} />
      ))}
    </div>
  );
}

function ToolRow({ pair }: { pair: { call?: CallEvent; result?: CallEvent } }) {
  const [expanded, setExpanded] = useState(false);
  const cData = pair.call?.data as Record<string, unknown> | undefined;
  const rData = pair.result?.data as Record<string, unknown> | undefined;
  const toolName = (cData?.toolName ?? rData?.toolName ?? 'unknown') as string;
  const success = rData?.success as boolean | undefined;
  const latencyMs = pair.result?.latencyMs;

  return (
    <div
      className="rounded-[8px] overflow-hidden"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <button
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
        style={{ background: 'var(--color-surface-raised)' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className="text-[11px] font-[500] px-1.5 py-0.5 rounded"
          style={{
            background: success === false ? 'var(--color-state-error)22' : 'var(--color-state-speaking)22',
            color: success === false ? 'var(--color-state-error)' : 'var(--color-state-speaking)',
          }}
        >
          {success === false ? '✗' : '✓'}
        </span>
        <span className="flex-1 text-[12.5px] font-mono" style={{ color: 'var(--color-text)' }}>
          {toolName}
        </span>
        {latencyMs != null && (
          <span className="text-[11.5px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
            {latencyMs}ms
          </span>
        )}
        {expanded
          ? <ChevronUp size={13} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
          : <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />}
      </button>
      {expanded && (
        <div
          className="px-3.5 pb-3 pt-2 flex flex-col gap-2 border-t"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          {cData?.args !== undefined && (
            <JsonBlock label="Input" value={cData.args as Record<string, unknown>} />
          )}
          {rData?.output !== undefined && (
            <JsonBlock label="Output" value={rData.output as Record<string, unknown>} />
          )}
          {rData?.error != null && (
            <p className="text-[12px]" style={{ color: 'var(--color-state-error)' }}>
              Error: {String(rData.error as string)}
            </p>
          )}
        </div>
      )}
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

function EmptySection({ label }: { label: string }) {
  return (
    <p className="text-[12.5px]" style={{ color: 'var(--color-text-faint)' }}>
      {label}
    </p>
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
        <div className="max-w-3xl flex flex-col gap-6">
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
