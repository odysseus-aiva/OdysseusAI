import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequest, TtsResult } from '../../common/types/tts.types';
import { TtsProvider } from '../interfaces/tts-provider.interface';

const CARTESIA_API_VERSION = '2024-06-10';
const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_DEFAULT_VOICE_ID = 'a0e99841-438c-4a64-b679-ae501e7d6091'; // Barbershop Man

@Injectable()
export class CartesiaTtsProvider implements TtsProvider {
  readonly name = 'cartesia';
  private readonly logger = new Logger(CartesiaTtsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async synthesizeSpeech(request: TtsRequest): Promise<TtsResult> {
    const apiKey = this.configService.get<string>('cartesia.apiKey');
    if (!apiKey) {
      this.logger.warn('CARTESIA_API_KEY not set — returning silent audio');
      return this.silentBuffer(request);
    }

    const sampleRate = request.sampleRate ?? 24000;
    const voiceId = request.voiceId ?? CARTESIA_DEFAULT_VOICE_ID;

    const response = await fetch(CARTESIA_TTS_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: request.text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: sampleRate,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cartesia TTS error (${response.status}): ${body}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    const durationMs = Math.floor((audio.length / 2 / sampleRate) * 1000);

    return {
      audio,
      format: 'pcm',
      sampleRate,
      durationMs,
    };
  }

  private silentBuffer(request: TtsRequest): TtsResult {
    const sampleRate = request.sampleRate ?? 24000;
    const durationMs = Math.max(400, request.text.length * 40);
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    return {
      audio: Buffer.alloc(numSamples * 2),
      format: 'pcm',
      durationMs,
      sampleRate,
    };
  }
}
