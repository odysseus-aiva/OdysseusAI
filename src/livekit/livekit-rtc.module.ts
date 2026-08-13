import { Module } from '@nestjs/common';
import { RecordingModule } from '../recording/recording.module';
import { LivekitRtcService } from './livekit-rtc.service';

@Module({
  imports: [RecordingModule],
  providers: [LivekitRtcService],
  exports: [LivekitRtcService],
})
export class LivekitRtcModule {}
