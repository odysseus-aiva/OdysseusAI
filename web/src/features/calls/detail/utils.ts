import type {
  CallCost,
  CallSummary,
  TranscriptEntry,
  ToolCallRecord,
} from '@/lib/api/calls';
import type { CallStatus } from '@/lib/types/call-log';

export type TimelineMessage = {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
};

export type TimelineTool = {
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

export type TimelineItem = TimelineMessage | TimelineTool;

/** Same-speaker chunks within this window are treated as one utterance/turn. */
const MERGE_GAP_MS = 6000;

/**
 * Build one chronological timeline from transcript entries + tool executions.
 * Speech is normalized first, then tools are interleaved by timestamp.
 */
export function buildTimeline(
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

export function coerceArgs(input: unknown): Record<string, unknown> | undefined {
  if (input == null) return undefined;
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    return { value: input };
  }
  if (typeof input === 'object') return input as Record<string, unknown>;
  return { value: input };
}

function isMeaningful(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeText(a: string, b: string): string {
  if (b === a || a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  const joined = /^[.,!?;:]/.test(b) ? a + b : `${a} ${b}`;
  return collapseWhitespace(joined);
}

export function firstArgValue(args?: Record<string, unknown>): string | null {
  if (!args) return null;
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Compact elapsed offset from call start, e.g. "0:03", "1:24". */
export function formatOffset(deltaMs: number): string {
  const ms = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEndedBy(endedBy?: string): string {
  switch (endedBy) {
    case 'participant':
      return 'Participant';
    case 'agent':
      return 'Agent';
    case 'timeout':
      return 'Timeout';
    case 'error':
      return 'Error';
    default:
      return '—';
  }
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}

export function formatAudioTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function shortCallId(callId: string): string {
  return callId.length > 8 ? `${callId.slice(0, 8)}…` : callId;
}

export function getAgentName(call: CallSummary): string {
  return (
    call.agentSnapshot?.name ??
    (call.agentId ? `Agent ${call.agentId.slice(0, 8)}` : 'Unknown agent')
  );
}

export function statusLabel(status: CallStatus, endedBy?: string): string {
  if (status === 'completed' && endedBy === 'agent') return 'Agent ended';
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Error';
}

export function statusVariant(
  status: CallStatus,
): 'success' | 'accent' | 'error' {
  if (status === 'completed') return 'success';
  if (status === 'in_progress') return 'accent';
  return 'error';
}

/**
 * Latency state for UI. Negative values are unexpected (backend milestone
 * ordering) — surface them as "slow"/error visually but keep the raw number.
 */
export type LatencyState = 'good' | 'warning' | 'slow' | 'invalid';

export function latencyState(ms: number | undefined | null): LatencyState | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 0) return 'invalid';
  if (ms < 800) return 'good';
  if (ms < 1800) return 'warning';
  return 'slow';
}

/** Soft state tint — bars/labels only; large numbers stay neutral text. */
export function latencyColor(ms: number): string {
  const state = latencyState(ms);
  if (state === 'good') return 'var(--color-state-speaking)';
  if (state === 'warning') return 'var(--color-state-warning)';
  return 'var(--color-state-error)';
}

export function latencyStateLabel(state: LatencyState): string {
  switch (state) {
    case 'good':
      return 'Good';
    case 'warning':
      return 'Elevated';
    case 'slow':
      return 'Slow';
    case 'invalid':
      return 'Unexpected';
  }
}

/**
 * Progress fill for latency bars. Negatives and non-finite values render as 0
 * width so the bar never breaks; the numeric label still shows the raw value.
 */
export function latencyBarPct(value: number | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0 || max <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

export function hasLatency(m: CallSummary['latencyMetrics']): boolean {
  return (
    m.totalResponseLatencyMs != null ||
    m.sttLatencyMs != null ||
    m.llmLatencyMs != null ||
    m.ttsLatencyMs != null
  );
}

export function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return `${Math.round(ms)}ms`;
}

export function costRows(cost: CallCost): {
  label: string;
  usd: number;
  detail: string;
  color: string;
}[] {
  return [
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
}

/** Seconds from call start for a transcript timestamp (for audio seek). */
export function offsetSeconds(ts: number, callStartMs: number): number {
  const delta = ts - callStartMs;
  if (!Number.isFinite(delta) || delta < 0) return 0;
  return delta / 1000;
}
