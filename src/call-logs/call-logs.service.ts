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

    // The runtime model id is only known once the provider has echoed it back
    // through usage accounting, so the snapshot is completed here rather than
    // at call start.
    const runtimeModel = opts?.finalCost?.breakdown.llm.model;
    const agentSnapshot =
      runtimeModel && record?.agentSnapshot && !record.agentSnapshot.llmModel
        ? { ...record.agentSnapshot, llmModel: runtimeModel }
        : undefined;

    await this.repository.finalizeCall(callId, {
      status,
      endedBy,
      endedAt,
      durationMs,
      turnCount: opts?.turnCount ?? 0,
      finalLatencyMetrics: opts?.finalLatencyMetrics,
      finalCost: opts?.finalCost,
      agentSnapshot,
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
