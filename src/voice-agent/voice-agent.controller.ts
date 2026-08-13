import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StartVoiceAgentDto } from './dto/start-voice-agent.dto';
import { VoiceAgentService } from './voice-agent.service';

@Controller('voice-agent')
export class VoiceAgentController {
  constructor(private readonly voiceAgentService: VoiceAgentService) {}

  @Post('start')
  async startSession(@Body() dto: StartVoiceAgentDto) {
    const session = await this.voiceAgentService.startSession(
      dto.roomName,
      dto.callId,
      dto.agentConfig,
    );
    return { success: true, session };
  }

  @Get('session/:roomName')
  async getSession(@Param('roomName') roomName: string) {
    return this.voiceAgentService.getSessionWithLogs(roomName);
  }
}
