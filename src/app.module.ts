import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PersistenceModule } from './persistence/persistence.module';
import { LivekitModule } from './livekit/livekit.module';
import { VoiceAgentModule } from './voice-agent/voice-agent.module';
import { SessionModule } from './session/session.module';
import { CallLogsModule } from './call-logs/call-logs.module';
import { PerformanceModule } from './performance/performance.module';
import { SttModule } from './stt/stt.module';
import { LlmModule } from './llm/llm.module';
import { TtsModule } from './tts/tts.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PersistenceModule.forRoot(),
    PerformanceModule,
    SttModule,
    LlmModule,
    TtsModule,
    CallLogsModule,
    AgentsModule,
    VoiceAgentModule,
    LivekitModule,
    SessionModule,
  ],
})
export class AppModule {}
