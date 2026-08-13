export type SttEventType = 'raw' | 'interim' | 'final' | 'speech_start' | 'speech_end';

export interface SttEvent {
  type: SttEventType;
  transcript?: string;
  confidence?: number;
  timestamp: number;
  speakerId?: string;
  isFinal: boolean;
  raw?: unknown;
}

export interface SttStreamOptions {
  callId: string;
  roomName: string;
  participantId: string;
  language?: string;
  sampleRate?: number;
}

export interface SttStreamHandle {
  writeAudio(chunk: Buffer): void;
  end(): Promise<void>;
  onEvent(callback: (event: SttEvent) => void): void;
}
