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

export interface TranscriptResponse {
  callId: string;
  transcript: TranscriptEntry[];
  lastUserUtterance?: string;
  lastAgentResponse?: string;
}

export async function fetchTranscript(callId: string): Promise<TranscriptResponse> {
  const res = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, { cache: 'no-store' });
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

export interface CallStats {
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
}

export async function fetchStats(opts?: { period?: number; agentId?: string }): Promise<CallStats> {
  const params = new URLSearchParams();
  if (opts?.period  != null) params.set('period',  String(opts.period));
  if (opts?.agentId)         params.set('agentId', opts.agentId);
  const qs = params.toString();
  const res = await fetch(`/api/calls/stats${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
  return res.json() as Promise<CallStats>;
}
