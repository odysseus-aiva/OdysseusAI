import { Module } from '@nestjs/common';
import { VoiceAgentController } from './voice-agent.controller';
import { VoiceAgentService } from './voice-agent.service';
import { OmniEngineService } from './engines/omni-engine.service';
import { TurnDetectionService } from './turn-detection.service';
import { SttModule } from '../stt/stt.module';
import { TtsModule } from '../tts/tts.module';
import { CallLogsModule } from '../call-logs/call-logs.module';
import { PerformanceModule } from '../performance/performance.module';
import { CostModule } from '../cost/cost.module';
import { LivekitRtcModule } from '../livekit/livekit-rtc.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    SttModule,
    TtsModule,
    CallLogsModule,
    PerformanceModule,
    CostModule,
    LivekitRtcModule,
    OrchestrationModule,
    AgentsModule,
  ],
  controllers: [VoiceAgentController],
  providers: [VoiceAgentService, TurnDetectionService, OmniEngineService],
  exports: [VoiceAgentService],
})
export class VoiceAgentModule {}
