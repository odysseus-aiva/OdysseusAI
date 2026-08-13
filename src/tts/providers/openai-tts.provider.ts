import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequest, TtsResult } from '../../common/types/tts.types';
import { TtsProvider } from '../interfaces/tts-provider.interface';

const OPENAI_VALID_VOICES = new Set([
  'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'sage', 'coral',
]);

@Injectable()
export class OpenAiTtsProvider implements TtsProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiTtsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async synthesizeSpeech(request: TtsRequest): Promise<TtsResult> {
    const apiKey = this.configService.get<string>('openai.apiKey');
    const sampleRate = request.sampleRate ?? 24000;

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — returning silent audio');
      const durationMs = Math.max(500, request.text.length * 40);
      const numSamples = Math.floor((sampleRate * durationMs) / 1000);
      return {
        audio: Buffer.alloc(numSamples * 2),
        format: 'pcm',
        durationMs,
        sampleRate,
      };
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: request.text,
        voice: (() => {
          if (request.voiceId && !OPENAI_VALID_VOICES.has(request.voiceId)) {
            this.logger.warn(`voiceId "${request.voiceId}" is not a valid OpenAI voice — falling back to alloy`);
            return 'alloy';
          }
          return request.voiceId ?? 'alloy';
        })(),
        response_format: 'pcm',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);
    const durationMs = Math.floor((audio.length / 2 / sampleRate) * 1000);

    return {
      audio,
      format: 'pcm',
      durationMs,
      sampleRate,
    };
  }
}
