import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import {
  SttEvent,
  SttStreamHandle,
  SttStreamOptions,
} from '../../common/types/stt.types';
import { SttProvider } from '../interfaces/stt-provider.interface';

@Injectable()
export class DeepgramSttProvider implements SttProvider {
  readonly name = 'deepgram';
  private readonly logger = new Logger(DeepgramSttProvider.name);

  constructor(private readonly configService: ConfigService) {}

  transcribeStream(options: SttStreamOptions): SttStreamHandle {
    const apiKey = this.configService.get<string>('deepgram.apiKey');
    if (!apiKey) {
      this.logger.warn(
        'DEEPGRAM_API_KEY not set — falling back to simulated STT',
      );
      return this.createSimulatedStream(options);
    }

    return this.createDeepgramStream(options, apiKey);
  }

  private createDeepgramStream(
    options: SttStreamOptions,
    apiKey: string,
  ): SttStreamHandle {
    let callback: ((event: SttEvent) => void) | null = null;
    let ws: WebSocket | null = null;
    let speechActive = false;
    let closedByUs = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;

    const emit = (event: SttEvent) => {
      this.logger.debug(
        `[${options.callId}] STT ${event.type}: ${event.transcript ?? ''}`,
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

    const startKeepAlive = () => {
      clearKeepAlive();
      // Deepgram closes idle sockets ~10s; ping every 5s while the call is live.
      keepAliveTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 5000);
    };

    const connect = () => {
      const sampleRate = options.sampleRate ?? 16000;
      const params = new URLSearchParams({
        encoding: 'linear16',
        sample_rate: String(sampleRate),
        channels: '1',
        interim_results: 'true',
        utterance_end_ms: '1000',
        vad_events: 'true',
        endpointing: '300',
        model: 'nova-2',
        language: options.language ?? 'en',
      });

      ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params.toString()}`,
        { headers: { Authorization: `Token ${apiKey}` } },
      );

      ws.on('open', () => {
        this.logger.log(`Deepgram stream opened for call ${options.callId}`);
        reconnectAttempts = 0;
        startKeepAlive();
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as {
            type?: string;
            channel?: {
              alternatives?: Array<{
                transcript?: string;
                confidence?: number;
              }>;
            };
            is_final?: boolean;
            speech_final?: boolean;
          };

          if (message.type === 'SpeechStarted') {
            speechActive = true;
            emit({
              type: 'speech_start',
              timestamp: Date.now(),
              isFinal: false,
              speakerId: options.participantId,
              raw: message,
            });
            return;
          }

          if (message.type === 'Results') {
            const transcript =
              message.channel?.alternatives?.[0]?.transcript ?? '';
            const confidence =
              message.channel?.alternatives?.[0]?.confidence;
            const isFinal = message.is_final === true;

            if (!transcript && !isFinal) return;

            emit({
              type: isFinal ? 'final' : 'interim',
              transcript,
              confidence,
              timestamp: Date.now(),
              isFinal,
              speakerId: options.participantId,
              raw: message,
            });

            if (isFinal && message.speech_final) {
              speechActive = false;
              emit({
                type: 'speech_end',
                timestamp: Date.now(),
                isFinal: false,
                speakerId: options.participantId,
                raw: message,
              });
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to parse Deepgram message: ${(error as Error).message}`,
          );
        }
      });

      ws.on('error', (error) => {
        this.logger.error(
          `[${options.callId}] Deepgram WebSocket error: ${error.message}`,
        );
      });

      ws.on('close', (code, reason) => {
        clearKeepAlive();
        this.logger.log(
          `Deepgram stream closed for call ${options.callId} (code=${code} reason=${reason?.toString() || 'n/a'} closedByUs=${closedByUs})`,
        );

        if (closedByUs) return;

        // Auto-reconnect so idle/agent-speaking gaps don't kill the call.
        if (reconnectAttempts >= 5) {
          this.logger.error(
            `[${options.callId}] Deepgram reconnect gave up after ${reconnectAttempts} attempts`,
          );
          return;
        }

        const delayMs = Math.min(1000 * 2 ** reconnectAttempts, 8000);
        reconnectAttempts += 1;
        this.logger.warn(
          `[${options.callId}] Deepgram reconnecting in ${delayMs}ms (attempt ${reconnectAttempts})`,
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
        speechActive = false;
      },
    };
  }

  /** Fallback when no API key is configured */
  private createSimulatedStream(options: SttStreamOptions): SttStreamHandle {
    let callback: ((event: SttEvent) => void) | null = null;
    let chunkCount = 0;

    const emit = (event: SttEvent) => callback?.(event);

    return {
      onEvent: (cb) => {
        callback = cb;
      },
      writeAudio: (chunk: Buffer) => {
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
