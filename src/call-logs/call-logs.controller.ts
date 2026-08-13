import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, statSync } from 'fs';
import { CONVERSATION_STATE_REPOSITORY } from '../orchestration/interfaces/conversation-state-repository.interface';
import type { ConversationStateRepository } from '../orchestration/interfaces/conversation-state-repository.interface';
import { AnalyticsService } from './analytics.service';
import { CallLogsService } from './call-logs.service';
import { RecordingService } from '../recording/recording.service';
import type { CallStatus } from '../common/types/call-log.types';

@Controller('call-logs')
export class CallLogsController {
  constructor(
    private readonly callLogsService: CallLogsService,
    private readonly analyticsService: AnalyticsService,
    private readonly recordingService: RecordingService,
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationStateRepository: ConversationStateRepository,
  ) {}

  /**
   * Paginated call history list — summary rows only, no events loaded.
   * GET /call-logs?limit=50&offset=0&agentId=&status=&startAfter=&startBefore=&sortBy=&order=
   */
  @Get()
  async listCalls(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('agentId') agentId?: unknown,
    @Query('status') status?: unknown,
    @Query('startAfter') startAfterRaw?: unknown,
    @Query('startBefore') startBeforeRaw?: unknown,
    @Query('sortBy') sortBy?: unknown,
    @Query('order') order?: unknown,
  ) {
    return this.callLogsService.listCalls({
      limit,
      offset,
      agentId: cleanAgentId(agentId),
      status: isValidStatus(status) ? status : undefined,
      startAfter: cleanTimestamp(startAfterRaw),
      startBefore: cleanTimestamp(startBeforeRaw),
      sortBy: isValidSortBy(sortBy) ? sortBy : undefined,
      order: order === 'asc' ? 'asc' : 'desc',
    });
  }

  /**
   * Aggregated platform stats for Analytics / Dashboard.
   * GET /call-logs/stats?period=7&agentId=
   */
  @Get('stats')
  async getStats(
    @Query('period', new DefaultValuePipe(7), ParseIntPipe) period: number,
    @Query('agentId') agentId?: unknown,
  ) {
    return this.analyticsService.getStats({
      period: clampPeriod(period),
      agentId: cleanAgentId(agentId),
    });
  }

  /**
   * Turn-level latency analytics: percentiles, stage decomposition, histogram.
   * GET /call-logs/latency?period=7&agentId=
   */
  @Get('latency')
  async getLatency(
    @Query('period', new DefaultValuePipe(7), ParseIntPipe) period: number,
    @Query('agentId') agentId?: unknown,
  ) {
    return this.analyticsService.getLatency({
      period: clampPeriod(period),
      agentId: cleanAgentId(agentId),
    });
  }

  /**
   * Tool execution analytics from tool_call / tool_result events.
   * GET /call-logs/tools?period=7&agentId=
   */
  @Get('tools')
  async getTools(
    @Query('period', new DefaultValuePipe(7), ParseIntPipe) period: number,
    @Query('agentId') agentId?: unknown,
  ) {
    return this.analyticsService.getTools({
      period: clampPeriod(period),
      agentId: cleanAgentId(agentId),
    });
  }

  /**
   * Full call record with all pipeline events.
   * GET /call-logs/:callId
   */
  @Get(':callId')
  async getCallLogs(@Param('callId') callId: string) {
    const record = await this.callLogsService.getByCallId(callId);
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
      turnCount: record.turnCount,
      analysis: record.analysis,
      cost: record.cost,
      recordingUrl: record.recordingUrl,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      logs: record.logs,
      latencyMetrics: record.latencyMetrics,
      errors: record.errors,
    };
  }

  /**
   * Paginated, step-filtered event stream for a single call.
   * GET /call-logs/:callId/events?step=tool_call,tool_result&limit=100&offset=0
   */
  @Get(':callId/events')
  async getCallEvents(
    @Param('callId') callId: string,
    @Query('step') stepRaw?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const steps = stepRaw
      ? stepRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return this.callLogsService.listEvents(callId, { limit, offset, steps });
  }

  /**
   * Clean turn-by-turn transcript from the conversation state collection.
   * GET /call-logs/:callId/transcript
   *
   * Returns [{role, text, timestamp, turnIndex, toolCallNames}] — the canonical
   * readable transcript, not raw STT events.
   */
  @Get(':callId/transcript')
  async getTranscript(@Param('callId') callId: string) {
    const state = await this.conversationStateRepository.findByCallId(callId);
    if (!state) {
      throw new NotFoundException(
        `No conversation state found for call: ${callId}`,
      );
    }
    return {
      callId,
      transcript: state.transcriptHistory,
      // Tool executions with timestamps so the client can interleave them into
      // the transcript at the exact point they occurred. Sourced from
      // conversation state (populated for both pipeline and Omni engines).
      toolCalls: state.toolCallHistory,
      lastUserUtterance: state.lastUserUtterance,
      lastAgentResponse: state.lastAgentResponse,
    };
  }

  /**
   * Stream the mixed WAV recording for a completed call.
   * GET /call-logs/:callId/recording
   */
  @Get(':callId/recording')
  @Header('Accept-Ranges', 'none')
  getRecording(@Param('callId') callId: string): StreamableFile {
    const filePath = this.recordingService.getRecordingPath(callId);
    if (!filePath) {
      throw new NotFoundException(`Recording not found for call: ${callId}`);
    }
    const { size } = statSync(filePath);
    return new StreamableFile(createReadStream(filePath), {
      type: 'audio/wav',
      length: size,
    });
  }
}

function isValidStatus(s: unknown): s is CallStatus {
  return s === 'in_progress' || s === 'completed' || s === 'error';
}

function isValidSortBy(
  s: unknown,
): s is 'createdAt' | 'durationMs' | 'totalResponseLatencyMs' {
  return (
    s === 'createdAt' || s === 'durationMs' || s === 'totalResponseLatencyMs'
  );
}

function clampPeriod(period: number): number {
  if (!Number.isFinite(period)) return 7;
  return Math.min(Math.max(Math.trunc(period), 1), 90);
}

/**
 * Query strings parsed by Express can yield arrays or objects (`?agentId[$ne]=x`),
 * which would reach the database as a query operator. Only accept a plain,
 * bounded string.
 */
function cleanAgentId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  return trimmed;
}

function cleanTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
