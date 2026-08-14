import type { CallStatus, CallEndedBy, CallSentiment } from '@/lib/types/call-log';
export type { CallStatus };

export interface CallAnalysis {
  summary?: string;
  sentiment?: CallSentiment;
  analyzedAt?: number;
}

export interface CallCost {
  totalUsd: number;
  llmUsd: number;
  ttsUsd: number;
  sttUsd: number;
  omniUsd?: number;
  pricingModel?: 'pipeline' | 'omni';
  breakdown: {
    llm: { model?: string; promptTokens: number; completionTokens: number; usd: number };
    tts: { provider?: string; characters: number; usd: number };
    stt: { provider?: string; seconds: number; usd: number };
  };
  estimated: boolean;
  computedAt: number;
}

export interface AgentSnapshot {
  name?: string;
  llmProvider?: string;
  llmModel?: string;
  ttsProvider?: string;
  sttProvider?: string;
  voiceId?: string;
  language?: string;
  enabledTools: string[];
}

export interface CallSummary {
  callId: string;
  roomName: string;
  participantId?: string;
  agentId?: string;
  agentSnapshot?: AgentSnapshot;
  status: CallStatus;
  endedBy?: CallEndedBy;
  endedAt?: number;
  durationMs?: number;
  turnCount: number;
  analysis?: CallAnalysis;
  cost?: CallCost;
  recordingUrl?: string;
  createdAt: number;
  updatedAt: number;
  latencyMetrics: {
    totalResponseLatencyMs?: number;
    sttLatencyMs?: number;
    llmLatencyMs?: number;
    ttsLatencyMs?: number;
    p50ResponseLatencyMs?: number;
    p95ResponseLatencyMs?: number;
    turnsWithLatency?: number;
  };
  errors: string[];
}

export interface CallListResponse {
  total: number;
  calls: CallSummary[];
}

export async function fetchCalls(opts?: {
  limit?: number;
  offset?: number;
  agentId?: string;
  status?: CallStatus;
  startAfter?: number;
  startBefore?: number;
  sortBy?: 'createdAt' | 'durationMs' | 'totalResponseLatencyMs';
  order?: 'asc' | 'desc';
}): Promise<CallListResponse> {
  const params = new URLSearchParams();
  if (opts?.limit    != null) params.set('limit',       String(opts.limit));
  if (opts?.offset   != null) params.set('offset',      String(opts.offset));
  if (opts?.agentId)          params.set('agentId',     opts.agentId);
  if (opts?.status)           params.set('status',      opts.status);
  if (opts?.startAfter  != null) params.set('startAfter',  String(opts.startAfter));
  if (opts?.startBefore != null) params.set('startBefore', String(opts.startBefore));
  if (opts?.sortBy)           params.set('sortBy',      opts.sortBy);
  if (opts?.order)            params.set('order',       opts.order);
  const qs = params.toString();
  const res = await fetch(`/api/calls${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load call history (${res.status})`);
  return res.json() as Promise<CallListResponse>;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  turnIndex?: number;
  toolCallNames?: string[];
}

export interface ToolCallRecord {
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  success: boolean;
  timestamp: number;
}

export interface TranscriptResponse {
  callId: string;
  transcript: TranscriptEntry[];
  /** Tool executions with timestamps, for inline interleaving into the transcript. */
  toolCalls?: ToolCallRecord[];
  lastUserUtterance?: string;
  lastAgentResponse?: string;
}

export async function fetchTranscript(callId: string): Promise<TranscriptResponse> {
  const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`);
  return res.json() as Promise<TranscriptResponse>;
}

/** Soft 404 for live polling — conversation state may lag behind session start. */
export async function fetchLiveTranscript(callId: string): Promise<TranscriptResponse> {
  const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: 'no-store' });
  if (res.status === 404) {
    return { callId, transcript: [], toolCalls: [] };
  }
  if (!res.ok) throw new Error(`Failed to load transcript (${res.status})`);
  return res.json() as Promise<TranscriptResponse>;
}

export interface CallEvent {
  id: string;
  callId: string;
  roomName: string;
  participantId?: string;
  step: string;
  timestamp: number;
  data?: unknown;
  error?: string;
  latencyMs?: number;
}

export interface CallEventsResponse {
  total: number;
  events: CallEvent[];
}

export async function fetchCallEvents(
  callId: string,
  opts?: { step?: string; limit?: number; offset?: number },
): Promise<CallEventsResponse> {
  const params = new URLSearchParams();
  if (opts?.step)   params.set('step',   opts.step);
  if (opts?.limit  != null) params.set('limit',  String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(
    `/api/calls/${encodeURIComponent(callId)}/events${qs ? `?${qs}` : ''}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`Failed to load call events (${res.status})`);
  return res.json() as Promise<CallEventsResponse>;
}

export async function fetchCallDetail(callId: string): Promise<CallSummary & { logs: CallEvent[]; errors: string[] }> {
  const res = await fetch(`/api/calls/${encodeURIComponent(callId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load call detail (${res.status})`);
  return res.json() as Promise<CallSummary & { logs: CallEvent[]; errors: string[] }>;
}

/** Conversation quality, distinct from whether the pipeline threw. */
export type CallOutcome = 'engaged' | 'no_interaction' | 'failed' | 'in_progress';

/** Change versus the equally-sized window immediately before the current one. */
export interface StatDelta {
  current: number;
  previous: number;
  absolute: number;
  /** Null when the previous window was zero, since percent change is undefined. */
  pct: number | null;
}

export interface MixEntry {
  key: string;
  count: number;
}

export interface CallStats {
  period: number;
  from: number;
  to: number;

  totalCalls: number;
  completedCalls: number;
  errorCalls: number;
  inProgressCalls: number;
  avgDurationMs: number | null;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  errorRate: number;
  totalCostUsd: number;
  avgCostUsd: number | null;
  callsPerDay: { date: string; count: number }[];
  topTools: { name: string; count: number }[];

  outcomeMix: { outcome: CallOutcome; count: number }[];
  engagementRate: number;
  avgTurnCount: number | null;
  turnHistogram: { label: string; count: number }[];

  endedByMix: MixEntry[];
  sentimentMix: MixEntry[];

  costBreakdown: {
    llmUsd: number;
    ttsUsd: number;
    sttUsd: number;
    estimatedCalls: number;
    estimatedShare: number | null;
  };
  unitEconomics: {
    perCallUsd: number | null;
    perMinuteUsd: number | null;
    perTurnUsd: number | null;
  };
  costByEngine: {
    omni: { calls: number; totalUsd: number; totalMinutes: number };
    pipeline: { calls: number; totalUsd: number; totalMinutes: number };
  };

  topAgents: {
    agentId: string;
    name?: string;
    llmModel?: string;
    calls: number;
    engagementRate: number;
    avgCostUsd: number | null;
    avgDurationMs: number | null;
  }[];

  samples: {
    calls: number;
    latencyTurns: number;
    costedCalls: number;
    analyzedCalls: number;
    latencyReliable: boolean;
    minLatencySample: number;
  };

  deltas: {
    totalCalls: StatDelta | null;
    engagementRate: StatDelta | null;
    errorRate: StatDelta | null;
    p50LatencyMs: StatDelta | null;
    avgCostUsd: StatDelta | null;
    avgDurationMs: StatDelta | null;
  };

  series: {
    bucket: 'day' | 'week';
    points: {
      date: string;
      total: number;
      engaged: number;
      noInteraction: number;
      failed: number;
      costUsd: number;
      omniCostUsd: number;
      totalMinutes: number;
    }[];
  };
}

export interface StageStats {
  avg: number | null;
  p50: number | null;
  p95: number | null;
  samples: number;
}

export interface LatencyAnalytics {
  period: number;
  from: number;
  to: number;
  samples: { turns: number; calls: number; reliable: boolean; minSample: number };
  percentiles: {
    avg: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  } | null;
  stages: {
    stt: StageStats;
    llm: StageStats;
    tts: StageStats;
    /** End-to-end time not attributable to STT, LLM or TTS. */
    unaccounted: { avg: number | null; samples: number; sharePct: number | null };
  };
  histogram: { label: string; fromMs: number; toMs: number | null; count: number }[];
  byTurnIndex: { turnIndex: number; p50: number; avg: number | null; samples: number }[];
  overTime: { date: string; p50: number; p95: number; samples: number }[];
  budget: {
    thresholdMs: number;
    withinCount: number;
    breachedCount: number;
    withinPct: number | null;
  };
  interruptions: { count: number; callsAffected: number; perCall: number | null };
}

export interface ToolAnalytics {
  period: number;
  from: number;
  to: number;
  samples: { calls: number; invocations: number };
  totals: {
    invocations: number;
    failures: number;
    successRate: number | null;
    callsWithTools: number;
    adoptionRate: number | null;
    invocationsPerCall: number | null;
  };
  tools: {
    name: string;
    invocations: number;
    successes: number;
    failures: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
  }[];
}

interface WindowOpts {
  period?: number;
  agentId?: string;
}

function windowQuery(opts?: WindowOpts): string {
  const params = new URLSearchParams();
  if (opts?.period != null) params.set('period', String(opts.period));
  if (opts?.agentId) params.set('agentId', opts.agentId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchStats(opts?: WindowOpts): Promise<CallStats> {
  const res = await fetch(`/api/calls/stats${windowQuery(opts)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
  return res.json() as Promise<CallStats>;
}

export async function fetchLatencyAnalytics(opts?: WindowOpts): Promise<LatencyAnalytics> {
  const res = await fetch(`/api/calls/latency${windowQuery(opts)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load latency analytics (${res.status})`);
  return res.json() as Promise<LatencyAnalytics>;
}

export async function fetchToolAnalytics(opts?: WindowOpts): Promise<ToolAnalytics> {
  const res = await fetch(`/api/calls/tools${windowQuery(opts)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load tool analytics (${res.status})`);
  return res.json() as Promise<ToolAnalytics>;
}
