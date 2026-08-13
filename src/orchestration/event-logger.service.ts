import { Injectable, Logger } from '@nestjs/common';
import { CallLogsService } from '../call-logs/call-logs.service';
import { CallLogStep } from '../common/types/call-log.types';

/**
 * Thin orchestration event logger. Never throws — logging failures must not break the call.
 */
@Injectable()
export class EventLoggerService {
  private readonly logger = new Logger(EventLoggerService.name);

  constructor(private readonly callLogsService: CallLogsService) {}

  async log(
    callId: string,
    step: CallLogStep,
    data?: {
      roomName?: string;
      participantId?: string;
      data?: unknown;
      error?: string;
      latencyMs?: number;
    },
  ): Promise<void> {
    try {
      await this.callLogsService.appendLog(callId, step, data);
    } catch (err) {
      this.logger.warn(
        `Failed to log ${step} for ${callId}: ${(err as Error).message}`,
      );
    }
  }
}
