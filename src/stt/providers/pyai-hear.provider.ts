import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import {
  SttEvent,
  SttStreamHandle,
  SttStreamOptions,
} from '../../common/types/stt.types';
import { SttProvider } from '../interfaces/stt-provider.interface';

/**
 * PyAI Hear — streaming speech-to-text over a WebSocket. Emits the same
 * `SttEvent` shape as Deepgram (interim/final/speech_start/speech_end) so the
 * voice-agent pipeline consumes it identically.
 *
 * Follows the DeepgramSttProvider structure: keep-alive ping, bounded
 * auto-reconnect, and a no-key simulated fallback so the app runs offline.
 */
@Injectable()
export class PyAiHearProvider implements SttProvider {
  readonly name = 'pyai';
  private readonly logger = new Logger(PyAiHearProvider.name);

  constructor(private readonly configService: ConfigService) {}

  transcribeStream(options: SttStreamOptions): SttStreamHandle {
    const apiKey = this.configService.get<string>('PYAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('PYAI_API_KEY not set — falling back to simulated STT');
      return this.createSimulatedStream(options);
    }
    return this.createStream(options, apiKey);
  }

  private createStream(
    options: SttStreamOptions,
    apiKey: string,
  ): SttStreamHandle {
    const baseUrl =
      this.configService.get<string>('pyai.baseUrl') ?? 'https://api.pyai.com/v1';
    // Derive the WS endpoint from the configured HTTP base URL.
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/audio/transcriptions/stream`;

    let callback: ((event: SttEvent) => void) | null = null;
    let fatalErrorCallback: ((err: Error) => void) | null = null;
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const emit = (event: SttEvent) => {
      this.logger.debug(
        `[${options.callId}] Hear ${event.type}: ${event.transcript ?? ''}`,
      );
      callback?.(event);
    };

    const clearKeepAlive = () => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };
    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      const sampleRate = options.sampleRate ?? 16000;
      const params = new URLSearchParams({
        model: 'pyai-hear',
        encoding: 'linear16',
        sample_rate: String(sampleRate),
        language: options.language ?? 'en',
        interim_results: 'true',
      });

      ws = new WebSocket(`${wsUrl}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      ws.on('open', () => {
        this.logger.log(`PyAI Hear stream opened for call ${options.callId}`);
        reconnectAttempts = 0;
        clearKeepAlive();
        keepAliveTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 5000);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as {
            type?: string;
            transcript?: string;
            text?: string;
            confidence?: number;
            is_final?: boolean;
            speech_final?: boolean;
          };

          if (message.type === 'SpeechStarted') {
            emit({
              type: 'speech_start',
              timestamp: Date.now(),
              isFinal: false,
              speakerId: options.participantId,
              raw: message,
            });
            return;
          }

          const transcript = message.transcript ?? message.text ?? '';
          const isFinal = message.is_final === true;
          if (!transcript && !isFinal) return;

          emit({
            type: isFinal ? 'final' : 'interim',
            transcript,
            confidence: message.confidence,
            timestamp: Date.now(),
            isFinal,
            speakerId: options.participantId,
            raw: message,
          });

          if (isFinal && message.speech_final) {
            emit({
              type: 'speech_end',
              timestamp: Date.now(),
              isFinal: false,
              speakerId: options.participantId,
              raw: message,
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed to parse PyAI Hear message: ${(error as Error).message}`,
          );
        }
      });

      ws.on('error', (error) => {
        this.logger.error(
          `[${options.callId}] PyAI Hear WebSocket error: ${error.message}`,
        );
        if (/\b400\b/.test(error.message)) {
          closedByUs = true;
          clearKeepAlive();
          clearReconnect();
          fatalErrorCallback?.(error);
        }
      });

      ws.on('close', (code, reason) => {
        clearKeepAlive();
        this.logger.log(
          `PyAI Hear stream closed for call ${options.callId} (code=${code} reason=${reason?.toString() || 'n/a'} closedByUs=${closedByUs})`,
        );
        if (closedByUs) return;

        if (reconnectAttempts >= 5) {
          this.logger.error(
            `[${options.callId}] PyAI Hear reconnect gave up after ${reconnectAttempts} attempts`,
          );
          return;
        }
        const delayMs = Math.min(1000 * 2 ** reconnectAttempts, 8000);
        reconnectAttempts += 1;
        this.logger.warn(
          `[${options.callId}] PyAI Hear reconnecting in ${delayMs}ms (attempt ${reconnectAttempts})`,
        );
        clearReconnect();
        reconnectTimer = setTimeout(() => {
          if (!closedByUs) connect();
        }, delayMs);
      });
    };

    return {
      onEvent: (cb) => {
        callback = cb;
        if (!ws) connect();
      },
      onFatalError: (cb) => {
        fatalErrorCallback = cb;
      },
      writeAudio: (chunk: Buffer) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      },
      end: async () => {
        closedByUs = true;
        clearKeepAlive();
        clearReconnect();
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          ws.close();
        }
        ws = null;
      },
    };
  }

  /** Fallback when no API key is configured. */
  private createSimulatedStream(options: SttStreamOptions): SttStreamHandle {
    let callback: ((event: SttEvent) => void) | null = null;
    let chunkCount = 0;
    const emit = (event: SttEvent) => callback?.(event);

    return {
      onEvent: (cb) => {
        callback = cb;
      },
      writeAudio: () => {
        chunkCount++;
        if (chunkCount === 1) {
          emit({
            type: 'speech_start',
            timestamp: Date.now(),
            isFinal: false,
            speakerId: options.participantId,
          });
        }
      },
      end: async () => {
        if (chunkCount > 0) {
          emit({
            type: 'final',
            transcript: 'Hello, I would like some help.',
            confidence: 0.9,
            timestamp: Date.now(),
            isFinal: true,
            speakerId: options.participantId,
          });
        }
      },
    };
  }
}
