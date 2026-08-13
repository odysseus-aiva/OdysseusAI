import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LatencyMetrics } from '../../common/types/performance.types';
import { CallCost } from '../../common/types/cost.types';
import {
  AgentSnapshot,
  CallAnalysis,
  CallEndedBy,
  CallLogEntry,
  CallLogStep,
  CallRecord,
  CallStatus,
} from '../../common/types/call-log.types';
import {
  CallLogsRepository,
  CallSummary,
} from '../../call-logs/interfaces/call-logs-repository.interface';
import { CallDocument, CallEntity } from './schemas/call.schema';
import {
  CallEventDocument,
  CallEventEntity,
} from './schemas/call-event.schema';

@Injectable()
export class MongoCallLogsRepository implements CallLogsRepository {
  constructor(
    @InjectModel(CallEntity.name)
    private readonly callModel: Model<CallDocument>,
    @InjectModel(CallEventEntity.name)
    private readonly eventModel: Model<CallEventDocument>,
  ) {}

  async create(record: CallRecord): Promise<CallRecord> {
    await this.callModel.create({
      callId: record.callId,
      roomName: record.roomName,
      participantId: record.participantId,
      agentId: record.agentId,
      agentSnapshot: record.agentSnapshot,
      metadata: record.metadata,
      status: record.status ?? 'in_progress',
      turnCount: record.turnCount ?? 0,
      latencyMetrics: { ...(record.latencyMetrics ?? {}) },
      callErrors: record.errors ?? [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });

    return { ...record, logs: [] };
  }

  async findByCallId(callId: string): Promise<CallRecord | null> {
    const call = await this.callModel.findOne({ callId }).lean().exec();
    if (!call) return null;

    const events = await this.eventModel
      .find({ callId })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    return this.toCallRecord(call, events);
  }

  async findByRoomName(roomName: string): Promise<CallRecord | null> {
    const call = await this.callModel
      .findOne({ roomName })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    if (!call) return null;

    return this.findByCallId(call.callId);
  }

  async appendLogEntry(
    callId: string,
    entry: CallLogEntry,
    error?: string,
  ): Promise<void> {
    await this.eventModel.create({
      eventId: entry.id,
      callId: entry.callId,
      roomName: entry.roomName,
      participantId: entry.participantId,
      step: entry.step,
      timestamp: entry.timestamp,
      data: entry.data,
      error: entry.error,
      latencyMs: entry.latencyMs,
    });

    const update: Record<string, unknown> = { updatedAt: Date.now() };
    if (entry.participantId) {
      update.participantId = entry.participantId;
    }

    const updateDoc: Record<string, unknown> = { $set: update };
    if (error) {
      updateDoc.$push = { callErrors: error };
    }

    await this.callModel.updateOne({ callId }, updateDoc).exec();
  }

  async updateCall(
    callId: string,
    patch: {
      participantId?: string;
      latencyMetrics?: LatencyMetrics;
    },
  ): Promise<void> {
    const $set: Record<string, unknown> = { updatedAt: Date.now() };

    if (patch.participantId !== undefined) {
      $set.participantId = patch.participantId;
    }
    if (patch.latencyMetrics) {
      const existing = await this.callModel
        .findOne({ callId })
        .select('latencyMetrics')
        .lean()
        .exec();
      $set.latencyMetrics = {
        ...(existing?.latencyMetrics ?? {}),
        ...patch.latencyMetrics,
      };
    }

    await this.callModel.updateOne({ callId }, { $set }).exec();
  }

  async finalizeCall(
    callId: string,
    outcome: {
      status: CallStatus;
      endedBy: CallEndedBy;
      endedAt: number;
      durationMs: number;
      turnCount: number;
      finalLatencyMetrics?: LatencyMetrics;
      finalCost?: CallCost;
      agentSnapshot?: AgentSnapshot;
      recordingUrl?: string;
    },
  ): Promise<void> {
    const $set: Record<string, unknown> = {
      status: outcome.status,
      endedBy: outcome.endedBy,
      endedAt: outcome.endedAt,
      durationMs: outcome.durationMs,
      turnCount: outcome.turnCount,
      updatedAt: Date.now(),
    };

    if (outcome.agentSnapshot) {
      $set.agentSnapshot = outcome.agentSnapshot;
    }

    if (outcome.finalLatencyMetrics) {
      const existing = await this.callModel
        .findOne({ callId })
        .select('latencyMetrics')
        .lean()
        .exec();
      $set.latencyMetrics = {
        ...(existing?.latencyMetrics ?? {}),
        ...outcome.finalLatencyMetrics,
      };
    }

    if (outcome.finalCost) {
      $set.cost = outcome.finalCost;
    }

    if (outcome.recordingUrl) {
      $set.recordingUrl = outcome.recordingUrl;
    }

    await this.callModel.updateOne({ callId }, { $set }).exec();
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
    const filter = buildFilter(opts);
    const sortField =
      opts.sortBy === 'durationMs' ? 'durationMs'
      : opts.sortBy === 'totalResponseLatencyMs' ? 'latencyMetrics.totalResponseLatencyMs'
      : 'createdAt';
    const sortDir = opts.order === 'asc' ? 1 : -1;

    const docs = await this.callModel
      .find(filter)
      .sort({ [sortField]: sortDir })
      .skip(opts.offset)
      .limit(opts.limit)
      .lean()
      .exec();

    return docs.map((doc) => ({
      callId: doc.callId,
      roomName: doc.roomName,
      participantId: doc.participantId,
      agentId: doc.agentId,
      agentSnapshot: doc.agentSnapshot,
      metadata: doc.metadata as Record<string, string | number | boolean> | undefined,
      status: (doc.status ?? 'in_progress') as CallStatus,
      endedBy: doc.endedBy as CallEndedBy | undefined,
      endedAt: doc.endedAt,
      durationMs: doc.durationMs,
      turnCount: doc.turnCount ?? 0,
      analysis: doc.analysis as CallAnalysis | undefined,
      cost: doc.cost as CallCost | undefined,
      recordingUrl: doc.recordingUrl,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      latencyMetrics: (doc.latencyMetrics as LatencyMetrics) ?? {},
      errors: doc.callErrors ?? [],
    }));
  }

  async listEventsForCalls(
    callIds: string[],
    steps: string[],
    limit: number,
  ): Promise<CallLogEntry[]> {
    if (callIds.length === 0) return [];

    const filter: Record<string, unknown> = { callId: { $in: callIds } };
    if (steps.length) filter.step = { $in: steps };

    const docs = await this.eventModel
      .find(filter)
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc) => ({
      id: doc.eventId,
      callId: doc.callId,
      roomName: doc.roomName,
      participantId: doc.participantId,
      step: doc.step as CallLogStep,
      timestamp: doc.timestamp,
      data: doc.data,
      error: doc.error,
      latencyMs: doc.latencyMs,
    }));
  }

  async countAll(filters?: {
    agentId?: string;
    status?: CallStatus;
    startAfter?: number;
    startBefore?: number;
  }): Promise<number> {
    const filter = filters ? buildFilter(filters) : {};
    return this.callModel.countDocuments(filter).exec();
  }

  async writeAnalysis(callId: string, analysis: CallAnalysis): Promise<void> {
    await this.callModel
      .updateOne({ callId }, { $set: { analysis, updatedAt: Date.now() } })
      .exec();
  }

  async listAll(): Promise<CallRecord[]> {
    const calls = await this.callModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return Promise.all(
      calls.map((call) => this.findByCallId(call.callId)),
    ).then((records) =>
      records.filter((record): record is CallRecord => record !== null),
    );
  }

  private toCallRecord(
    call: {
      callId: string;
      roomName: string;
      participantId?: string;
      agentId?: string;
      agentSnapshot?: import('../../common/types/call-log.types').AgentSnapshot;
      metadata?: Record<string, unknown>;
      status?: string;
      endedBy?: string;
      endedAt?: number;
      durationMs?: number;
      turnCount?: number;
      analysis?: CallAnalysis;
      cost?: CallCost;
      recordingUrl?: string;
      latencyMetrics?: LatencyMetrics;
      callErrors?: string[];
      createdAt: number;
      updatedAt: number;
    },
    events: Array<{
      eventId: string;
      callId: string;
      roomName: string;
      participantId?: string;
      step: string;
      timestamp: number;
      data?: unknown;
      error?: string;
      latencyMs?: number;
    }>,
  ): CallRecord {
    return {
      callId: call.callId,
      roomName: call.roomName,
      participantId: call.participantId,
      agentId: call.agentId,
      agentSnapshot: call.agentSnapshot,
      metadata: call.metadata as Record<string, string | number | boolean> | undefined,
      status: (call.status ?? 'in_progress') as CallStatus,
      endedBy: call.endedBy as CallEndedBy | undefined,
      endedAt: call.endedAt,
      durationMs: call.durationMs,
      turnCount: call.turnCount ?? 0,
      analysis: call.analysis,
      cost: call.cost,
      recordingUrl: call.recordingUrl,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt,
      latencyMetrics: call.latencyMetrics ?? {},
      errors: call.callErrors ?? [],
      logs: events.map((event) => ({
        id: event.eventId,
        callId: event.callId,
        roomName: event.roomName,
        participantId: event.participantId,
        step: event.step as CallLogStep,
        timestamp: event.timestamp,
        data: event.data,
        error: event.error,
        latencyMs: event.latencyMs,
      })),
    };
  }
}

function buildFilter(opts: {
  agentId?: string;
  status?: CallStatus;
  startAfter?: number;
  startBefore?: number;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.agentId) filter.agentId = opts.agentId;
  if (opts.status) filter.status = opts.status;
  if (opts.startAfter !== undefined || opts.startBefore !== undefined) {
    const range: Record<string, number> = {};
    if (opts.startAfter !== undefined) range.$gt = opts.startAfter;
    if (opts.startBefore !== undefined) range.$lt = opts.startBefore;
    filter.createdAt = range;
  }
  return filter;
}
