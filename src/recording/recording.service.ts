import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';

/** Sample rates that match the constants in livekit-rtc.service.ts */
const AGENT_RATE = 24_000;
const OUTPUT_RATE = 16_000;

interface RecordingSession {
  callId: string;
  userChunks: Buffer[];
  agentChunks: Buffer[];
}

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private readonly sessions = new Map<string, RecordingSession>();
  readonly recordingsDir: string;

  constructor() {
    this.recordingsDir = join(process.cwd(), 'recordings');
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  startRecording(roomName: string, callId: string): void {
    if (this.sessions.has(roomName)) return;
    this.sessions.set(roomName, { callId, userChunks: [], agentChunks: [] });
    this.logger.log(`Recording started: room=${roomName} call=${callId}`);
  }

  /** Called with every user audio chunk (raw Int16 LE PCM, 16 kHz mono). */
  appendUserAudio(roomName: string, pcm: Buffer): void {
    this.sessions.get(roomName)?.userChunks.push(pcm);
  }

  /** Called with every agent audio frame (raw Int16 LE PCM, 24 kHz mono). */
  appendAgentAudio(roomName: string, pcm: Buffer): void {
    this.sessions.get(roomName)?.agentChunks.push(pcm);
  }

  /**
   * Finalise the recording: resample, mix, write WAV to disk.
   * Returns the backend URL path if a file was written, null if no audio.
   */
  async stopRecording(roomName: string): Promise<string | null> {
    const session = this.sessions.get(roomName);
    if (!session) return null;
    this.sessions.delete(roomName);

    const { callId, userChunks, agentChunks } = session;

    const userRaw = concat(userChunks);
    const agentRaw = concat(agentChunks);

    if (userRaw.length === 0 && agentRaw.length === 0) {
      this.logger.log(`No audio captured for call: ${callId}`);
      return null;
    }

    const userSamples = toInt16Array(userRaw);
    const agentResampled = resample(
      toInt16Array(agentRaw),
      AGENT_RATE,
      OUTPUT_RATE,
    );
    const mixed = mix(userSamples, agentResampled);

    const wav = encodeWav(mixed, OUTPUT_RATE);
    const filePath = join(this.recordingsDir, `${callId}.wav`);
    await writeFile(filePath, wav);

    const sizeKb = (wav.length / 1024).toFixed(1);
    const durationSec = (mixed.length / OUTPUT_RATE).toFixed(1);
    this.logger.log(
      `Recording saved: ${filePath} (${durationSec}s, ${sizeKb} KB)`,
    );

    return `/call-logs/${callId}/recording`;
  }

  getRecordingPath(callId: string): string | null {
    const p = join(this.recordingsDir, `${callId}.wav`);
    return existsSync(p) ? p : null;
  }
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

function concat(chunks: Buffer[]): Buffer {
  return chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks);
}

function toInt16Array(buf: Buffer): Int16Array {
  const count = Math.floor(buf.byteLength / 2);
  const arr = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = buf.readInt16LE(i * 2);
  }
  return arr;
}

/** Linear interpolation resampler (good enough for speech playback). */
function resample(
  input: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const lo = Math.floor(srcPos);
    const frac = srcPos - lo;
    const s0 = input[lo] ?? 0;
    const s1 = input[Math.min(lo + 1, input.length - 1)] ?? 0;
    output[i] = Math.round(s0 + frac * (s1 - s0));
  }
  return output;
}

/** Average-mix two mono tracks, padding the shorter with silence. */
function mix(a: Int16Array, b: Int16Array): Int16Array {
  const len = Math.max(a.length, b.length);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Math.round(((a[i] ?? 0) + (b[i] ?? 0)) / 2);
  }
  return out;
}

/** Write a minimal 44-byte PCM WAV header followed by the sample data. */
function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM subchunk size
  buf.writeUInt16LE(1, 20); // AudioFormat: PCM
  buf.writeUInt16LE(1, 22); // NumChannels: mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buf.writeUInt16LE(2, 32); // BlockAlign
  buf.writeUInt16LE(16, 34); // BitsPerSample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buf;
}
