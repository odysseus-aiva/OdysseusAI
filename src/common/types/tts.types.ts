export type TtsAudioFormat = 'pcm' | 'mp3' | 'wav' | 'opus';

export interface TtsRequest {
  text: string;
  voiceId?: string;
  format?: TtsAudioFormat;
  sampleRate?: number;
}

export interface TtsResult {
  audio: Buffer;
  format: TtsAudioFormat;
  durationMs?: number;
  sampleRate?: number;
}
