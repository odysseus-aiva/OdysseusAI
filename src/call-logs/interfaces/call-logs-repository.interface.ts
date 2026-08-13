import { LatencyMetrics } from '../../common/types/performance.types';
import { CallCost } from '../../common/types/cost.types';
import {
  AgentSnapshot,
  CallAnalysis,
  CallEndedBy,
  CallLogEntry,
  CallRecord,
  CallStatus,
} from '../../common/types/call-log.types';

export const CALL_LOGS_REPOSITORY = Symbol('CALL_LOGS_REPOSITORY');

/**
 * Minimal summary row used by the list endpoint — no events loaded.
 * Contains only fields stored on the `calls` collection.
 */
export interface CallSummary {
  callId: string;
  roomName: string;
  participantId?: string;
  agentId?: string;
  agentSnapshot?: AgentSnapshot;
  metadata?: Record<string, string | number | boolean>;
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
  latencyMetrics: LatencyMetrics;
  errors: string[];
}

export interface CallLogsRepository {
  create(record: CallRecord): Promise<CallRecord>;
  findByCallId(callId: string): Promise<CallRecord | null>;
  findByRoomName(roomName: string): Promise<CallRecord | null>;
  appendLogEntry(
    callId: string,
    entry: CallLogEntry,
    error?: string,
  ): Promise<void>;
  updateCall(
    callId: string,
    patch: {
      participantId?: string;
      latencyMetrics?: LatencyMetrics;
    },
  ): Promise<void>;
  /**
   * Stamp the call as finalized. Idempotent — safe to call multiple times.
   */
  finalizeCall(
    callId: string,
    outcome: {
      status: CallStatus;
      endedBy: CallEndedBy;
      endedAt: number;
      durationMs: number;
      turnCount: number;
      finalLatencyMetrics?: LatencyMetrics;
      finalCost?: CallCost;
      /** Replaces the stored snapshot — used to backfill the runtime LLM model. */
      agentSnapshot?: AgentSnapshot;
      recordingUrl?: string;
    },
  ): Promise<void>;
  /**
   * Events across many calls, for cross-call aggregation. Unlike the per-call
   * event reader this never loads full call records.
   */
  listEventsForCalls(
    callIds: string[],
    steps: string[],
    limit: number,
  ): Promise<CallLogEntry[]>;
  /**
   * Returns lightweight summary rows — never loads call_events.
   * Results are sorted by createdAt descending by default.
   */
  listSummaries(opts: {
    limit: number;
    offset: number;
    agentId?: string;
    status?: CallStatus;
    startAfter?: number;
    startBefore?: number;
    sortBy?: 'createdAt' | 'durationMs' | 'totalResponseLatencyMs';
    order?: 'asc' | 'desc';
  }): Promise<CallSummary[]>;
  countAll(filters?: {
    agentId?: string;
    status?: CallStatus;
    startAfter?: number;
    startBefore?: number;
  }): Promise<number>;
  /** Write AI-generated analysis back to the call record. */
  writeAnalysis(callId: string, analysis: CallAnalysis): Promise<void>;
  /** @deprecated Use listSummaries. Kept for internal tooling only. */
  listAll(): Promise<CallRecord[]>;
}
