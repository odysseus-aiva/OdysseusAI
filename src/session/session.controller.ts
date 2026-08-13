import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { SessionService } from './session.service';
import { StartSessionDto, StartSessionResponse } from './dto/start-session.dto';

/**
 * The primary entry point for the web app. A single POST begins a fully
 * orchestrated voice session; the client copies nothing and joins nothing
 * manually.
 */
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('start')
  async start(@Body() dto: StartSessionDto): Promise<StartSessionResponse> {
    return this.sessionService.startSession(dto.agentConfig, dto.metadata);
  }

  @Delete(':roomName')
  async stop(
    @Param('roomName') roomName: string,
  ): Promise<{ success: boolean }> {
    await this.sessionService.stopSession(roomName);
    return { success: true };
  }
}
