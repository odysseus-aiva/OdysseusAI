import { Module } from '@nestjs/common';
import { DeepgramSttProvider } from './providers/deepgram-stt.provider';
import { PyAiHearProvider } from './providers/pyai-hear.provider';
import { SttService } from './stt.service';

@Module({
  providers: [DeepgramSttProvider, PyAiHearProvider, SttService],
  exports: [SttService],
})
export class SttModule {}
