import { Module } from '@nestjs/common';
import { LivekitController } from './livekit.controller';
import { LivekitService } from './livekit.service';
import { LivekitRtcModule } from './livekit-rtc.module';
import { CallLogsModule } from '../call-logs/call-logs.module';
import { VoiceAgentModule } from '../voice-agent/voice-agent.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [CallLogsModule, VoiceAgentModule, LivekitRtcModule, AgentsModule],
  controllers: [LivekitController],
  providers: [LivekitService],
  exports: [LivekitService, LivekitRtcModule],
})
export class LivekitModule {}
