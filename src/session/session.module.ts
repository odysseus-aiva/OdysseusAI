import { Module } from '@nestjs/common';
import { LivekitModule } from '../livekit/livekit.module';
import { VoiceAgentModule } from '../voice-agent/voice-agent.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [LivekitModule, VoiceAgentModule],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}
