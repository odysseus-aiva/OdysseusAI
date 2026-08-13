import { Module } from '@nestjs/common';
import { LivekitRtcService } from './livekit-rtc.service';

@Module({
  providers: [LivekitRtcService],
  exports: [LivekitRtcService],
})
export class LivekitRtcModule {}
