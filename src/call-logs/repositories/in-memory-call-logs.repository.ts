import { Injectable } from '@nestjs/common';
import { LatencyMetrics } from '../../common/types/performance.types';
import {
  AgentSnapshot,
  CallAnalysis,
  CallEndedBy,
  CallLogEntry,
  CallRecord,
  CallStatus,
} from '../../common/types/call-log.types';
import {
  CallLogsRepository,
  CallSummary,
} from '../interfaces/call-logs-repository.interface';

/**
 * In-memory call logs repository (default for local dev / tests).
 */
@Injectable()
export class InMemoryCallLogsRepository implements CallLogsRepository {
  private readonly byCallId = new Map<string, CallRecord>();
  private readonly byRoomName = new Map<string, string>();

  async create(record: CallRecord): Promise<CallRecord> {
    const stored = this.clone(record);
    this.byCallId.set(record.callId, stored);
    this.byRoomName.set(record.roomName, record.callId);
    return this.clone(stored);
  }

  async findByCallId(callId: string): Promise<CallRecord | null> {
    const record = this.byCallId.get(callId);
    return record ? this.clone(record) : null;
  }

  async findByRoomName(roomName: string): Promise<CallRecord | null> {
    const callId = this.byRoomName.get(roomName);
    if (!callId) return null;
    return this.findByCallId(callId);
  }

  async appendLogEntry(
    callId: string,
    entry: CallLogEntry,
    error?: string,
  ): Promise<void> {
    const record = this.byCallId.get(callId);
    if (!record) return;

    record.logs.push({ ...entry });
    if (error) {
      record.errors.push(error);
    }
    record.updatedAt = Date.now();
  }

  async updateCall(
    callId: string,
    patch: {
      participantId?: string;
      latencyMetrics?: LatencyMetrics;
    },
  ): Promise<void> {
    const record = this.byCallId.get(callId);
    if (!record) return;

    if (patch.participantId !== undefined) {
      record.participantId = patch.participantId;
    }
    if (patch.latencyMetrics) {
      record.latencyMetrics = {
        ...record.latencyMetrics,
        ...patch.latencyMetrics,
      };
    }
    record.updatedAt = Date.now();
  }

  async finalizeCall(
    callId: string,
    outcome: {
      status: CallStatus;
      endedBy: CallEndedBy;
      endedAt: number;
      durationMs: number;
      turnCount: number;
      finalLatencyMetrics?: import('../../common/types/performance.types').LatencyMetrics;
      finalCost?: import('../../common/types/cost.types').CallCost;
      agentSnapshot?: AgentSnapshot;
    },
  ): Promise<void> {
    const record = this.byCallId.get(callId);
    if (!record) return;
    record.status = outcome.status;
    record.endedBy = outcome.endedBy;
    record.endedAt = outcome.endedAt;
    record.durationMs = outcome.durationMs;
    record.turnCount = outcome.turnCount;
    if (outcome.finalLatencyMetrics) {
      record.latencyMetrics = { ...record.latencyMetrics, ...outcome.finalLatencyMetrics };
    }
    if (outcome.finalCost) {
      record.cost = outcome.finalCost;
    }
    if (outcome.agentSnapshot) {
      record.agentSnapshot = { ...outcome.agentSnapshot };
    }
    record.updatedAt = Date.now();
  }

  async listEventsForCalls(
    callIds: string[],
    steps: string[],
    limit: number,
  ): Promise<CallLogEntry[]> {
    const wanted = new Set(callIds);
    const stepSet = new Set(steps);
    const out: CallLogEntry[] = [];

    for (const record of this.byCallId.values()) {
      if (!wanted.has(record.callId)) continue;
      for (const entry of record.logs) {
        if (stepSet.size && !stepSet.has(entry.step)) continue;
        out.push({ ...entry });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async listSummaries(opts: {
    limit: number;
    offset: number;
    agentId?: string;
    status?: CallStatus;
    startAfter?: number;
    startBefore?: number;
    sortBy?: 'createdAt' | 'durationMs' | 'totalResponseLatencyMs';
    order?: 'asc' | 'desc';
  }): Promise<CallSummary[]> {
    let all = Array.from(this.byCallId.values());

    if (opts.agentId) all = all.filter((r) => r.agentId === opts.agentId);
    if (opts.status) all = all.filter((r) => r.status === opts.status);
    if (opts.startAfter !== undefined) all = all.filter((r) => r.createdAt > opts.startAfter!);
    if (opts.startBefore !== undefined) all = all.filter((r) => r.createdAt < opts.startBefore!);

    const dir = opts.order === 'asc' ? 1 : -1;
    all.sort((a, b) => {
      let va: number;
      let vb: number;
      if (opts.sortBy === 'durationMs') {
        va = a.durationMs ?? 0;
        vb = b.durationMs ?? 0;
      } else if (opts.sortBy === 'totalResponseLatencyMs') {
        va = a.latencyMetrics?.totalResponseLatencyMs ?? 0;
        vb = b.latencyMetrics?.totalResponseLatencyMs ?? 0;
      } else {
        va = a.createdAt;
        vb = b.createdAt;
      }
      return (va - vb) * dir;
    });

    return all.slice(opts.offset, opts.offset + opts.limit).map(toSummary);
  }

  async countAll(filters?: {
    agentId?: string;
    status?: CallStatus;
    startAfter?: number;
    startBefore?: number;
  }): Promise<number> {
    if (!filters) return this.byCallId.size;
    let all = Array.from(this.byCallId.values());
    if (filters.agentId) all = all.filter((r) => r.agentId === filters.agentId);
    if (filters.status) all = all.filter((r) => r.status === filters.status);
    if (filters.startAfter !== undefined) all = all.filter((r) => r.createdAt > filters.startAfter!);
    if (filters.startBefore !== undefined) all = all.filter((r) => r.createdAt < filters.startBefore!);
    return all.length;
  }

  async writeAnalysis(callId: string, analysis: CallAnalysis): Promise<void> {
    const record = this.byCallId.get(callId);
    if (!record) return;
    record.analysis = { ...analysis };
    record.updatedAt = Date.now();
  }

  async listAll(): Promise<CallRecord[]> {
    return Array.from(this.byCallId.values()).map((r) => this.clone(r));
  }

  private clone(record: CallRecord): CallRecord {
    return {
      ...record,
      logs: [...record.logs],
      latencyMetrics: { ...record.latencyMetrics },
      errors: [...record.errors],
    };
  }
}

function toSummary(record: CallRecord): CallSummary {
  return {
    callId: record.callId,
    roomName: record.roomName,
    participantId: record.participantId,
    agentId: record.agentId,
    agentSnapshot: record.agentSnapshot,
    metadata: record.metadata,
    status: record.status,
    endedBy: record.endedBy,
    endedAt: record.endedAt,
    durationMs: record.durationMs,
    turnCount: record.turnCount ?? 0,
    analysis: record.analysis,
    cost: record.cost,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    latencyMetrics: { ...record.latencyMetrics },
    errors: [...record.errors],
  };
}
