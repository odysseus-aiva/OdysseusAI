import { Module } from '@nestjs/common';
import { CartesiaTtsProvider } from './providers/cartesia-tts.provider';
import { ElevenLabsTtsProvider } from './providers/elevenlabs-tts.provider';
import { OpenAiTtsProvider } from './providers/openai-tts.provider';
import { PyAiSpeakProvider } from './providers/pyai-speak.provider';
import { TtsService } from './tts.service';

@Module({
  providers: [
    ElevenLabsTtsProvider,
    OpenAiTtsProvider,
    CartesiaTtsProvider,
    PyAiSpeakProvider,
    TtsService,
  ],
  exports: [TtsService],
})
export class TtsModule {}
