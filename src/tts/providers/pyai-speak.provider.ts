import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequest, TtsResult } from '../../common/types/tts.types';
import { TtsProvider } from '../interfaces/tts-provider.interface';

/**
 * PyAI Speak — text-to-speech via the OpenAI-compatible `/audio/speech`
 * endpoint. PyAI accepts OpenAI voice aliases (alloy, echo, …), so an agent's
 * existing OpenAI voiceId carries over unchanged.
 *
 * The pipeline consumes raw PCM. We request `response_format: pcm`; if PyAI
 * returns a WAV container instead, we strip the 44-byte header so downstream
 * playback still receives linear PCM.
 */
@Injectable()
export class PyAiSpeakProvider implements TtsProvider {
  readonly name = 'pyai';
  private readonly logger = new Logger(PyAiSpeakProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async synthesizeSpeech(request: TtsRequest): Promise<TtsResult> {
    const apiKey = this.configService.get<string>('PYAI_API_KEY');
    const baseUrl =
      this.configService.get<string>('pyai.baseUrl') ?? 'https://api.pyai.com/v1';
    const sampleRate = request.sampleRate ?? 24000;

    if (!apiKey) {
      this.logger.warn('PYAI_API_KEY not set — returning silent audio');
      const durationMs = Math.max(500, request.text.length * 40);
      const numSamples = Math.floor((sampleRate * durationMs) / 1000);
      return {
        audio: Buffer.alloc(numSamples * 2),
        format: 'pcm',
        durationMs,
        sampleRate,
      };
    }

    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'pyai-speak',
        input: request.text,
        voice: request.voiceId ?? 'alloy',
        response_format: 'pcm',
        sample_rate: sampleRate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PyAI Speak error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    let audio = Buffer.from(arrayBuffer);

    // Some formats come back as a WAV container — strip the 44-byte header so
    // the queue receives bare linear16 PCM.
    if (isWav(audio)) {
      audio = audio.subarray(44);
    }

    const durationMs = Math.floor((audio.length / 2 / sampleRate) * 1000);

    return {
      audio,
      format: 'pcm',
      durationMs,
      sampleRate,
    };
  }
}

/** WAV files begin with the ASCII marker "RIFF"…"WAVE". */
function isWav(buf: Buffer): boolean {
  return (
    buf.length >= 44 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WAVE'
  );
}
