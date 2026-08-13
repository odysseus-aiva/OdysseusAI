import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { LatencyMetrics } from '../common/types/performance.types';
import { CallCost } from '../common/types/cost.types';
import {
  AgentSnapshot,
  CallEndedBy,
  CallLogEntry,
  CallLogStep,
  CallRecord,
  CallStatus,
} from '../common/types/call-log.types';
import {
  CALL_LOGS_REPOSITORY,
  type CallLogsRepository,
  type CallSummary,
} from './interfaces/call-logs-repository.interface';
import { createCallRecord, createLogEntry } from './call-record.factory';

@Injectable()
export class CallLogsService {
  private readonly logger = new Logger(CallLogsService.name);

  constructor(
    @Inject(CALL_LOGS_REPOSITORY)
    private readonly repository: CallLogsRepository,
  ) {}

  async initCall(
    callId: string,
    roomName: string,
    participantId?: string,
    agentId?: string,
    agentSnapshot?: AgentSnapshot,
    metadata?: Record<string, string | number | boolean>,
  ): Promise<CallRecord> {
    const existing = await this.repository.findByCallId(callId);
    if (existing) return existing;

    const record = createCallRecord(callId, roomName, participantId, agentId, agentSnapshot, metadata);
    await this.repository.create(record);
    this.logger.log(`Initialized call log: ${callId} (room: ${roomName})`);
    return record;
  }

  async getByCallId(callId: string): Promise<CallRecord> {
    const record = await this.repository.findByCallId(callId);
    if (!record) {
      throw new NotFoundException(`Call log not found: ${callId}`);
    }
    return record;
  }

  async getByRoomName(roomName: string): Promise<CallRecord | null> {
    return this.repository.findByRoomName(roomName);
  }

  async appendLog(
    callId: string,
    step: CallLogStep,
    data?: {
      roomName?: string;
      participantId?: string;
      data?: unknown;
      error?: string;
      latencyMs?: number;
    },
  ): Promise<CallLogEntry> {
    const record = await this.getByCallId(callId);
    const entry = createLogEntry({
      callId,
      roomName: data?.roomName ?? record.roomName,
      participantId: data?.participantId ?? record.participantId,
      step,
      data: sanitizeLogData(step, data?.data),
      error: data?.error,
      latencyMs: data?.latencyMs,
    });

    await this.repository.appendLogEntry(callId, entry, data?.error);

    this.logger.debug(`[${callId}] log: ${step}`);
    return entry;
  }

  async updateLatencyMetrics(
    callId: string,
    metrics: LatencyMetrics,
  ): Promise<void> {
    await this.repository.updateCall(callId, { latencyMetrics: metrics });
  }

  async setParticipantId(callId: string, participantId: string): Promise<void> {
    await this.repository.updateCall(callId, { participantId });
  }

  /**
   * Stamp the call as finalized with its outcome, exact duration, turn count,
   * and final latency metrics including p50/p95 across all turns.
   * Called once by VoiceAgentService.stopSession.
   */
  async finalizeCall(
    callId: string,
    endedBy: CallEndedBy,
    hasErrors: boolean,
    opts?: {
      turnCount?: number;
      finalLatencyMetrics?: LatencyMetrics;
      finalCost?: CallCost;
    },
  ): Promise<void> {
    const endedAt = Date.now();
    const record = await this.repository.findByCallId(callId);
    const durationMs = record ? endedAt - record.createdAt : 0;
    const status = hasErrors ? 'error' : 'completed';

    await this.repository.finalizeCall(callId, {
      status,
      endedBy,
      endedAt,
      durationMs,
      turnCount: opts?.turnCount ?? 0,
      finalLatencyMetrics: opts?.finalLatencyMetrics,
      finalCost: opts?.finalCost,
    });

    this.logger.log(
      `Finalized call ${callId}: status=${status} endedBy=${endedBy} duration=${durationMs}ms turns=${opts?.turnCount ?? 0}`,
    );
  }

  /**
   * Paginated list of call summaries — lightweight, no events loaded.
   */
  async listCalls(opts: {
    limit?: number;
    offset?: number;
    agentId?: string;
    status?: CallStatus;
    startAfter?: number;
    startBefore?: number;
    sortBy?: 'createdAt' | 'durationMs' | 'totalResponseLatencyMs';
    order?: 'asc' | 'desc';
  }): Promise<{ total: number; calls: CallSummary[] }> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const filters = {
      agentId: opts.agentId,
      status: opts.status,
      startAfter: opts.startAfter,
      startBefore: opts.startBefore,
    };
    const [calls, total] = await Promise.all([
      this.repository.listSummaries({ limit, offset, ...filters, sortBy: opts.sortBy, order: opts.order }),
      this.repository.countAll(filters),
    ]);
    return { total, calls };
  }

  /**
   * Aggregated platform stats for the analytics/dashboard surfaces.
   * period: number of days to look back (default 7).
   */
  async getStats(opts: {
    period?: number;
    agentId?: string;
  }): Promise<{
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
  }> {
    const period = opts.period ?? 7;
    const startAfter = Date.now() - period * 24 * 60 * 60 * 1000;

    const [allInWindow, total] = await Promise.all([
      this.repository.listSummaries({
        limit: 2000,
        offset: 0,
        agentId: opts.agentId || undefined,
        startAfter,
        order: 'asc',
        sortBy: 'createdAt',
      }),
      this.repository.countAll({
        agentId: opts.agentId || undefined,
        startAfter,
      }),
    ]);

    const completed   = allInWindow.filter((c) => c.status === 'completed');
    const errors      = allInWindow.filter((c) => c.status === 'error');
    const inProgress  = allInWindow.filter((c) => c.status === 'in_progress');

    const durations   = completed.filter((c) => c.durationMs != null).map((c) => c.durationMs!);
    const latencies   = completed
      .filter((c) => c.latencyMetrics?.p50ResponseLatencyMs != null)
      .map((c) => c.latencyMetrics.p50ResponseLatencyMs!);

    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    const sortedLat = [...latencies].sort((a, b) => a - b);
    const p50LatencyMs = sortedLat.length
      ? sortedLat[Math.floor(sortedLat.length * 0.5)] ?? null
      : null;
    const p95LatencyMs = sortedLat.length
      ? sortedLat[Math.floor(sortedLat.length * 0.95)] ?? null
      : null;

    // calls per day
    const byDay = new Map<string, number>();
    for (let d = 0; d < period; d++) {
      const dt = new Date(startAfter + d * 86400000);
      byDay.set(dt.toISOString().slice(0, 10), 0);
    }
    for (const call of allInWindow) {
      const day = new Date(call.createdAt).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const callsPerDay = Array.from(byDay.entries()).map(([date, count]) => ({ date, count }));

    // top tools from agentSnapshot enabledTools (rough proxy)
    const toolCount = new Map<string, number>();
    for (const call of allInWindow) {
      for (const t of call.agentSnapshot?.enabledTools ?? []) {
        toolCount.set(t, (toolCount.get(t) ?? 0) + 1);
      }
    }
    const topTools = Array.from(toolCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // Cost aggregates — only priced calls contribute to the average.
    const costed = allInWindow.filter((c) => c.cost?.totalUsd != null);
    const totalCostUsd = costed.reduce((sum, c) => sum + (c.cost!.totalUsd || 0), 0);
    const avgCostUsd = costed.length
      ? Math.round((totalCostUsd / costed.length) * 1e6) / 1e6
      : null;

    return {
      totalCalls: total,
      completedCalls: completed.length,
      errorCalls: errors.length,
      inProgressCalls: inProgress.length,
      avgDurationMs,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      errorRate: total > 0 ? errors.length / total : 0,
      totalCostUsd: Math.round(totalCostUsd * 1e6) / 1e6,
      avgCostUsd,
      callsPerDay,
      topTools,
    };
  }

  /**
   * Paginated event stream for a single call, with optional step-type filtering.
   */
  async listEvents(
    callId: string,
    opts: { limit?: number; offset?: number; steps?: string[] },
  ): Promise<{ total: number; events: CallLogEntry[] }> {
    const record = await this.repository.findByCallId(callId);
    if (!record) {
      throw new NotFoundException(`Call log not found: ${callId}`);
    }
    const limit = Math.min(opts.limit ?? 100, 500);
    const offset = opts.offset ?? 0;
    let logs = record.logs;
    if (opts.steps?.length) {
      const stepSet = new Set(opts.steps);
      logs = logs.filter((e) => stepSet.has(e.step));
    }
    return {
      total: logs.length,
      events: logs.slice(offset, offset + limit),
    };
  }
}

/** Trim large webhook payloads before persistence. */
function sanitizeLogData(step: CallLogStep, data: unknown): unknown {
  if (step !== 'webhook' || !data || typeof data !== 'object') {
    return data;
  }

  const payload = data as Record<string, unknown>;
  if (!payload.rawEvent) {
    return data;
  }

  return {
    eventType: payload.eventType,
    rawEventSummary: summarizeWebhookEvent(payload.rawEvent),
  };
}

function summarizeWebhookEvent(rawEvent: unknown): Record<string, unknown> {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return { type: 'unknown' };
  }

  const event = rawEvent as Record<string, unknown>;
  return {
    event: event.event,
    room: (event.room as Record<string, unknown> | undefined)?.name,
    participant: (event.participant as Record<string, unknown> | undefined)
      ?.identity,
  };
}
