import { Injectable, Logger } from '@nestjs/common';
import { TurnDecision } from '../common/types/turn.types';
import { SttEvent } from '../common/types/stt.types';

/**
 * Simple turn detector based on STT speech_start/speech_end events
 * and configurable silence threshold.
 *
 * TODO: Replace with VAD (voice activity detection) or provider-specific
 * endpointing (e.g. Deepgram utterance_end) for production accuracy.
 */
@Injectable()
export class TurnDetectionService {
  private readonly logger = new Logger(TurnDetectionService.name);

  private readonly silenceTimers = new Map<string, NodeJS.Timeout>();
  private readonly pendingTranscripts = new Map<string, string>();

  detectFromSttEvent(
    callId: string,
    event: SttEvent,
    silenceMs: number,
    onTurnComplete: (decision: TurnDecision) => void,
  ): TurnDecision | null {
    switch (event.type) {
      case 'speech_start':
        this.clearSilenceTimer(callId);
        return {
          type: 'user_speech_start',
          timestamp: event.timestamp,
          reason: 'stt_speech_start',
        };

      case 'interim':
        if (event.transcript) {
          this.pendingTranscripts.set(callId, event.transcript);
        }
        return null;

      case 'final':
        if (event.transcript) {
          this.pendingTranscripts.set(callId, event.transcript);
        }
        this.scheduleTurnComplete(callId, silenceMs, onTurnComplete);
        return {
          type: 'user_speech_end',
          timestamp: event.timestamp,
          transcript: event.transcript,
          reason: 'stt_final',
          confidence: event.confidence,
        };

      case 'speech_end':
        return {
          type: 'user_speech_end',
          timestamp: event.timestamp,
          reason: 'stt_speech_end',
        };

      default:
        return null;
    }
  }

  getPendingTranscript(callId: string): string {
    return this.pendingTranscripts.get(callId) ?? '';
  }

  clearCall(callId: string): void {
    this.clearSilenceTimer(callId);
    this.pendingTranscripts.delete(callId);
  }

  private scheduleTurnComplete(
    callId: string,
    silenceMs: number,
    onTurnComplete: (decision: TurnDecision) => void,
  ): void {
    this.clearSilenceTimer(callId);
    const timer = setTimeout(() => {
      const transcript = this.pendingTranscripts.get(callId) ?? '';
      if (transcript.trim()) {
        const decision: TurnDecision = {
          type: 'user_turn_complete',
          timestamp: Date.now(),
          transcript,
          reason: `silence_${silenceMs}ms`,
        };
        this.logger.debug(`[${callId}] Turn complete: "${transcript}"`);
        onTurnComplete(decision);
        this.pendingTranscripts.delete(callId);
      }
    }, silenceMs);
    this.silenceTimers.set(callId, timer);
  }

  private clearSilenceTimer(callId: string): void {
    const timer = this.silenceTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.silenceTimers.delete(callId);
    }
  }
}
