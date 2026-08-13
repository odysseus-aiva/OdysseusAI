import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CONVERSATION_STATE_REPOSITORY } from '../orchestration/interfaces/conversation-state-repository.interface';
import type { ConversationStateRepository } from '../orchestration/interfaces/conversation-state-repository.interface';
import { CallLogsService } from './call-logs.service';
import type { CallStatus } from '../common/types/call-log.types';

@Controller('call-logs')
export class CallLogsController {
  constructor(
    private readonly callLogsService: CallLogsService,
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
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('startAfter') startAfterRaw?: string,
    @Query('startBefore') startBeforeRaw?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    return this.callLogsService.listCalls({
      limit,
      offset,
      agentId: agentId || undefined,
      status: isValidStatus(status) ? status : undefined,
      startAfter: startAfterRaw ? Number(startAfterRaw) : undefined,
      startBefore: startBeforeRaw ? Number(startBeforeRaw) : undefined,
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
    @Query('agentId') agentId?: string,
  ) {
    return this.callLogsService.getStats({
      period: Math.min(Math.max(period, 1), 90),
      agentId: agentId || undefined,
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
    const steps = stepRaw ? stepRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
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
    const state =
      await this.conversationStateRepository.findByCallId(callId);
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
}

function isValidStatus(s?: string): s is CallStatus {
  return s === 'in_progress' || s === 'completed' || s === 'error';
}

function isValidSortBy(
  s?: string,
): s is 'createdAt' | 'durationMs' | 'totalResponseLatencyMs' {
  return (
    s === 'createdAt' || s === 'durationMs' || s === 'totalResponseLatencyMs'
  );
}
