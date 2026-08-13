import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsRequest, TtsResult } from '../../common/types/tts.types';
import { TtsProvider } from '../interfaces/tts-provider.interface';

const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

@Injectable()
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name = 'elevenlabs';
  private readonly logger = new Logger(ElevenLabsTtsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async synthesizeSpeech(request: TtsRequest): Promise<TtsResult> {
    const apiKey = this.configService.get<string>('elevenlabs.apiKey');
    if (!apiKey) {
      this.logger.warn('ELEVENLABS_API_KEY not set — returning silent audio');
      return this.silentBuffer(request);
    }

    const voiceId = request.voiceId ?? ELEVENLABS_DEFAULT_VOICE_ID;
    const url = `${ELEVENLABS_TTS_URL}/${voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: request.text,
        model_id: 'eleven_turbo_v2',
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs TTS error (${response.status}): ${body}`);
    }

    // ElevenLabs returns MP3; we convert to raw PCM using a simple decode.
    const mp3Buffer = Buffer.from(await response.arrayBuffer());
    const pcm = await this.mp3ToPcm(mp3Buffer, request.sampleRate ?? 24000);

    return {
      audio: pcm,
      format: 'pcm',
      sampleRate: request.sampleRate ?? 24000,
      durationMs: Math.floor((pcm.length / 2 / (request.sampleRate ?? 24000)) * 1000),
    };
  }

  /**
   * Decode MP3 to 16-bit little-endian PCM at the target sample rate.
   * Uses Node.js child_process + ffmpeg when available; falls back to raw
   * passthrough (which VoiceAgentService resamples if needed).
   */
  private async mp3ToPcm(mp3: Buffer, targetSampleRate: number): Promise<Buffer> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      // Write mp3 to a temp file, convert to PCM via ffmpeg
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const { writeFile, readFile, unlink } = await import('fs/promises');
      const id = Math.random().toString(36).slice(2);
      const inPath = join(tmpdir(), `el_in_${id}.mp3`);
      const outPath = join(tmpdir(), `el_out_${id}.raw`);

      await writeFile(inPath, mp3);
      await execFileAsync('ffmpeg', [
        '-y', '-i', inPath,
        '-f', 's16le',
        '-ar', String(targetSampleRate),
        '-ac', '1',
        outPath,
      ]);
      const pcm = await readFile(outPath);
      await Promise.all([unlink(inPath).catch(() => {}), unlink(outPath).catch(() => {})]);
      return pcm;
    } catch {
      this.logger.warn('ffmpeg not available — returning MP3 bytes as PCM (may distort)');
      return mp3;
    }
  }

  private silentBuffer(request: TtsRequest): TtsResult {
    const sampleRate = request.sampleRate ?? 24000;
    const durationMs = Math.max(500, request.text.length * 50);
    const numSamples = Math.floor((sampleRate * durationMs) / 1000);
    return {
      audio: Buffer.alloc(numSamples * 2),
      format: 'pcm',
      durationMs,
      sampleRate,
    };
  }
}
