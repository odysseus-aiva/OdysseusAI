import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { AgentConfig } from '../../common/types/voice-agent.types';
import { CallLogsService } from '../../call-logs/call-logs.service';
import { ToolRegistryService } from '../../orchestration/tool-registry.service';
import { ToolExecutionService } from '../../orchestration/tool-execution.service';

const OMNI_INPUT_RATE = 16000;
export const OMNI_OUTPUT_RATE = 24000;

// Wire protocol tags (confirmed against docs at /realtime/omni-protocol):
//   0x01 = agent audio PCM16 (server → client) AND mic audio (client → server)
//   0x02 = transcript JSON (server → client)
//   0x03 = control events JSON (both directions)
const MIC_AUDIO_TAG = 0x01;
const AGENT_AUDIO_TAG = 0x01;
const TRANSCRIPT_TAG = 0x02;
const CONTROL_TAG = 0x03;

const CONNECT_TIMEOUT_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 2;

/** Close codes PyAI marks non-retryable — a new configure won't help. */
const FATAL_CLOSE_CODES = new Set([4401, 4403]);

export interface OmniHandle {
  /**
   * Send the `configure` frame to begin the conversation. Deferred until a
   * listener is subscribed to the agent track, otherwise Omni speaks its
   * greeting (turn 0) into an empty room and it is lost.
   */
  start(): void;
  /** Push one LiveKit mic PCM chunk (16 kHz linear16) to Omni. */
  writeAudio(pcm: Buffer): void;
  stop(): Promise<void>;
}

export interface OmniTranscriptEvent {
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface OmniToolExecutedEvent {
  toolName: string;
  args: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  timestamp: number;
}

export interface OmniCallbacks {
  /** Agent audio to publish into the room (PCM16 at OMNI_SAMPLE_RATE). */
  onAudioOut(pcm: Buffer): void;
  /** Omni state → our VoiceAgentSessionStatus vocabulary for the orb. */
  onStatus(status: 'listening' | 'processing' | 'speaking'): void;
  /** User barge-in detected server-side — stop room playback immediately. */
  onBargeIn(): void;
  /** Omni ended the session (goodbye / transfer). */
  onSessionEnd(): void;
  /** Fatal bring-up/runtime failure. The caller decides fallback. */
  onFatalError(message: string): void;
  /** Final or interim transcript event from Omni (both user and assistant). */
  onTranscript?(event: OmniTranscriptEvent): void;
  /** Tool executed and result returned to Omni. */
  onToolExecuted?(event: OmniToolExecutedEvent): void;
}

/**
 * Bridges a LiveKit room to a PyAI Omni realtime session.
 *
 * LiveKit remains the transport (room, tokens, mic in, speaker out); Omni
 * replaces the STT→orchestrator→TTS chain with one fused socket. Tools still
 * run through our ToolExecutionService so tool behavior is identical to the
 * pipeline engine. All transcripts/tool events are mirrored into the existing
 * call-log taxonomy so observability is unified across engines.
 */
@Injectable()
export class OmniEngineService {
  private readonly logger = new Logger(OmniEngineService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly callLogsService: CallLogsService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecution: ToolExecutionService,
  ) {}

  /**
   * Open an Omni session and wire it to the room. Resolves once the socket is
   * open and configured (or rejects on connect failure so the caller can fall
   * back to the pipeline). Runtime failures after open surface via
   * callbacks.onFatalError.
   */
  async connect(
    roomName: string,
    callId: string,
    config: AgentConfig,
    callbacks: OmniCallbacks,
  ): Promise<OmniHandle> {
    const apiKey = this.configService.get<string>('PYAI_API_KEY');
    if (!apiKey) {
      throw new Error('PYAI_API_KEY not set — cannot start Omni engine');
    }
    const baseUrl =
      this.configService.get<string>('pyai.baseUrl') ?? 'https://api.pyai.com/v1';
    const wsBase = baseUrl.replace(/^http/, 'ws');
    const url = `${wsBase}/omni?format=pcm16&rate=${OMNI_INPUT_RATE}&api_key=${encodeURIComponent(apiKey)}`;

    let ws = await this.openSocket(url, callId);
    let closedByUs = false;
    let reconnectAttempts = 0;

    const configureFrame = this.buildConfigureFrame(config);

    let audioFramesIn = 0;
    let audioBytesIn = 0;
    const seenTags = new Set<number>();

    // ── 0x02 transcript accumulation ────────────────────────────────────────
    // The server has been observed sending transcript two ways: structured JSON
    // ({role,text,final}) OR bare token chunks with no role/finality. Raw tokens
    // carry no speaker, so we attribute them to whoever is currently talking:
    // if agent audio (0x01) flowed within the last 1.5s it's the assistant,
    // otherwise the user. Tokens accumulate until a role switch or any control
    // frame (turn boundary), then flush as one final transcript entry.
    let lastAgentAudioAt = 0;
    let pendingRole: 'user' | 'assistant' | null = null;
    let pendingText = '';
    const flushPending = () => {
      const text = pendingText.trim();
      const role = pendingRole;
      pendingRole = null;
      pendingText = '';
      if (role && text) {
        this.emitTranscript(role, text, true, roomName, callId, callbacks);
      }
    };

    const wireHandlers = (socket: WebSocket) => {
      socket.on('message', (data: WebSocket.RawData) => {
        const frame = toBuffer(data);
        if (frame.length <= 1) return;
        const tag = frame[0];
        const payload = frame.subarray(1);
        if (!seenTags.has(tag)) {
          seenTags.add(tag);
          this.logger.log(
            `[${callId}] Omni first frame with tag 0x0${tag.toString(16)} (${tag === CONTROL_TAG ? 'control' : 'audio'}), ${payload.length}B`,
          );
        }
        if (tag === CONTROL_TAG) {
          // A control frame marks a turn boundary — flush any buffered tokens.
          flushPending();
          void this.handleControl(
            payload.toString('utf8'),
            roomName,
            callId,
            config,
            socket,
            callbacks,
          );
        } else if (tag === TRANSCRIPT_TAG) {
          // 0x02 = transcript from the server. Two shapes seen in the wild:
          // structured JSON, or bare token chunks. Handle both, always capture.
          const text = payload.toString('utf8');
          this.logger.log(
            `[${callId}] Omni transcript frame (0x02) ${payload.length}B: ${text.slice(0, 120)}`,
          );
          const structured = tryParseTranscriptJson(text);
          if (structured) {
            flushPending(); // don't mix a raw run into a structured frame
            this.emitTranscript(
              structured.role,
              structured.text,
              structured.isFinal,
              roomName,
              callId,
              callbacks,
            );
          } else {
            const role: 'user' | 'assistant' =
              Date.now() - lastAgentAudioAt < 1500 ? 'assistant' : 'user';
            if (pendingRole && pendingRole !== role) flushPending();
            pendingRole = role;
            pendingText += text;
          }
        } else if (tag === AGENT_AUDIO_TAG) {
          // 0x01 server→client = agent audio PCM16. But if Omni encounters an
          // error (e.g. unknown voice_id) it sends a JSON error on this tag.
          // Detect by checking for leading '{' and route to control handler.
          if (payload.length > 0 && payload[0] === 0x7b /* '{' */) {
            this.logger.warn(
              `[${callId}] Omni error on audio tag (0x01): ${payload.toString('utf8').slice(0, 200)}`,
            );
            void this.handleControl(
              payload.toString('utf8'),
              roomName,
              callId,
              config,
              socket,
              callbacks,
            );
          } else {
            // Agent audio started/continued. If the user was mid-utterance,
            // their turn just ended — flush it before assistant tokens arrive.
            if (pendingRole === 'user') flushPending();
            lastAgentAudioAt = Date.now();
            audioFramesIn += 1;
            audioBytesIn += payload.length;
            if (audioFramesIn <= 5) {
              this.logger.log(
                `[${callId}] ▶ Omni audio frame #${audioFramesIn} ${payload.length}B (${Math.floor(payload.length / 2)} samples)`,
              );
            } else if (audioFramesIn % 200 === 0) {
              this.logger.log(
                `[${callId}] Omni audio-out: ${audioFramesIn} frames / ${audioBytesIn}B / ${(audioBytesIn / 2 / OMNI_OUTPUT_RATE).toFixed(2)}s`,
              );
            }
            callbacks.onStatus('speaking');
            callbacks.onAudioOut(payload);
          }
        } else {
          this.logger.warn(
            `[${callId}] Omni unknown tag=0x${tag.toString(16)} ${payload.length}B hex=${payload.subarray(0, 32).toString('hex')}`,
          );
        }
      });

      socket.on('close', (code, reason) => {
        if (closedByUs) return;
        this.logger.warn(
          `[${callId}] Omni socket closed code=${code} reason=${reason?.toString() || 'n/a'}`,
        );
        if (FATAL_CLOSE_CODES.has(code)) {
          callbacks.onFatalError(`Omni rejected the session (code ${code})`);
          return;
        }
        // Transient (4429/1011/etc.): bounded reconnect. No mid-call resume,
        // so a fresh configure re-establishes the agent.
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          callbacks.onFatalError(
            `Omni disconnected and did not recover after ${reconnectAttempts} attempts`,
          );
          return;
        }
        reconnectAttempts += 1;
        const delayMs = Math.min(1000 * 2 ** reconnectAttempts, 8000);
        this.logger.warn(
          `[${callId}] Omni reconnecting in ${delayMs}ms (attempt ${reconnectAttempts})`,
        );
        setTimeout(() => {
          if (closedByUs) return;
          void this.openSocket(url, callId)
            .then((next) => {
              ws = next;
              wireHandlers(next);
              sendControl(next, configureFrame); // 0x03-framed, like the initial configure
            })
            .catch((err: Error) =>
              callbacks.onFatalError(`Omni reconnect failed: ${err.message}`),
            );
        }, delayMs);
      });

      socket.on('error', (err) => {
        this.logger.error(`[${callId}] Omni socket error: ${err.message}`);
      });
    };

    wireHandlers(ws);

    let configured = false;
    const sendConfigure = () => {
      if (configured || ws.readyState !== WebSocket.OPEN) return;
      configured = true;
      // configure MUST be a 0x03-tagged binary frame — a plain-text frame is
      // silently dropped and the session stays unconfigured (no greeting, mic
      // ignored). Verified live: server replies {"event":"configured", ...}.
      // The greeting (turn 0) plays right after, so we only send this once a
      // listener is subscribed.
      this.logger.log(`[${callId}] Omni sending configure: ${JSON.stringify(configureFrame)}`);
      sendControl(ws, configureFrame);
      void this.callLogsService.appendLog(callId, 'session_start', {
        roomName,
        data: { engine: 'omni', configure: redactConfigure(configureFrame) },
      });
    };

    let micFramesOut = 0;
    return {
      start: sendConfigure,
      writeAudio: (pcm: Buffer) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (!configured) return; // no point streaming mic before configure lands
        // Mic audio → 0x01-tagged PCM16 frame.
        const framed = Buffer.allocUnsafe(pcm.length + 1);
        framed[0] = MIC_AUDIO_TAG;
        pcm.copy(framed, 1);
        ws.send(framed);
        micFramesOut += 1;
        if (micFramesOut === 1) {
          this.logger.log(`[${callId}] ◀ mic audio streaming to Omni (0x01)`);
        }
      },
      stop: async () => {
        closedByUs = true;
        flushPending(); // persist any transcript tokens buffered at hang-up
        if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'session stop');
      },
    };
  }

  /** Resolve when the socket reaches OPEN, reject on error/timeout. */
  private openSocket(url: string, callId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error('Omni connect timed out'));
      }, CONNECT_TIMEOUT_MS);

      socket.once('open', () => {
        clearTimeout(timer);
        this.logger.log(`[${callId}] Omni socket open`);
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Normalize a transcript fragment from any Omni source (0x02 tokens or a 0x03
   * control frame) into the call log + onTranscript callback. Only finals reach
   * the persisted transcriptHistory — the callback drops interims.
   */
  private emitTranscript(
    role: 'user' | 'assistant',
    text: string,
    isFinal: boolean,
    roomName: string,
    callId: string,
    callbacks: OmniCallbacks,
  ): void {
    if (!text) return;
    this.logger.log(
      `[${callId}] Omni transcript [${role}${isFinal ? '/final' : ''}]: ${text.slice(0, 100)}`,
    );
    void this.callLogsService.appendLog(callId, 'stt_event', {
      roomName,
      data: { source: 'omni', role, transcript: text, final: isFinal },
    });
    if (isFinal) {
      callbacks.onStatus(role === 'user' ? 'processing' : 'listening');
    }
    callbacks.onTranscript?.({ role, text, isFinal, timestamp: Date.now() });
  }

  private buildConfigureFrame(config: AgentConfig): Record<string, unknown> {
    const tools = this.toolRegistry.listForOmni(config.enabledTools);
    const frame: Record<string, unknown> = {
      event: 'configure',
      voice_id: config.voiceId || 'stock_sarah_style2',
      persona: config.systemPrompt ?? '',
      language: config.language ?? 'en',
      tools,
    };
    // Only include greeting if non-empty — empty string disables turn-0 speech.
    if (config.greeting) {
      frame.greeting = config.greeting;
    }
    return frame;
  }

  private async handleControl(
    raw: string,
    roomName: string,
    callId: string,
    config: AgentConfig,
    socket: WebSocket,
    callbacks: OmniCallbacks,
  ): Promise<void> {
    let msg: {
      event?: string;
      type?: string;
      role?: string;
      speaker?: string;
      text?: string;
      final?: boolean;
      is_final?: boolean;
      kind?: string;
      call_id?: string;
      tool?: string;
      name?: string;
      arguments?: Record<string, unknown>;
      detail?: string;
      reply?: unknown;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      this.logger.warn(`[${callId}] Unparseable Omni frame: ${raw.slice(0, 120)}`);
      return;
    }

    // PyAI sends error objects as {"detail":"..."} with no event/type field.
    if (msg.detail && !msg.event && !msg.type) {
      this.logger.error(`[${callId}] Omni server error: ${msg.detail}`);
      return;
    }

    // Live protocol keys control frames on `event`; keep `type` as a fallback
    // in case a variant uses it.
    const kind = msg.event ?? msg.type;

    switch (kind) {
      case 'hello':
        // Handshake — the server announces call_id and negotiated audio rates.
        this.logger.log(`[${callId}] Omni hello (FULL): ${raw}`);
        break;

      case 'configured':
        // Our configure frame was accepted (voice/tools/greeting applied).
        this.logger.log(`[${callId}] Omni configured (FULL): ${raw}`);
        callbacks.onStatus('listening');
        break;

      case 'idle_prompt':
        // Server nudge after silence ("are you still there?"). Informational.
        break;

      case 'audio_position':
        // Playback telemetry (sent_ms/realtime_ms). No action needed.
        break;

      case 'session_started':
        callbacks.onStatus('listening');
        break;

      case 'transcript': {
        const role: 'user' | 'assistant' =
          (msg.role ?? msg.speaker) === 'user' ? 'user' : 'assistant';
        const isFinal =
          msg.final ?? msg.is_final ?? (msg.kind === undefined ? true : msg.kind === 'final');
        this.emitTranscript(role, msg.text ?? '', isFinal, roomName, callId, callbacks);
        break;
      }

      case 'turn':
        // Turn boundary — no direct UI effect; audio frames drive speaking.
        break;

      case 'barge_in':
      case 'flush':
      case 'assistant_interrupted':
        // assistant_interrupted carries the truncated reply text — log it.
        if (msg.reply) {
          this.logger.log(`[${callId}] Omni assistant interrupted, reply was: "${(msg.reply as string).slice(0, 100)}"`);
        }
        callbacks.onBargeIn();
        callbacks.onStatus('listening');
        break;

      case 'tool_call':
        await this.runTool(msg, roomName, callId, config, socket, callbacks);
        break;

      case 'transfer_to_human':
      case 'session_end':
      case 'session_ending':
        await this.callLogsService.appendLog(callId, 'session_stop', {
          roomName,
          data: { engine: 'omni', reason: kind },
        });
        callbacks.onSessionEnd();
        break;

      default:
        // Unknown frame — log at INFO so live traffic reveals any event we don't
        // yet handle, without breaking the session.
        this.logger.log(`[${callId}] Omni unknown frame: ${raw.slice(0, 200)}`);
    }
  }

  /** Execute an Omni tool_call through our own registry and return tool_result. */
  private async runTool(
    msg: {
      call_id?: string;
      tool?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    },
    roomName: string,
    callId: string,
    config: AgentConfig,
    socket: WebSocket,
    callbacks: OmniCallbacks,
  ): Promise<void> {
    const invocationId = msg.call_id;
    // Docs: tool_call uses `name`; accept `tool` as legacy fallback.
    const toolName = msg.name ?? msg.tool;
    const args = msg.arguments ?? {};
    if (!invocationId || !toolName) return;

    const validationError = this.toolRegistry.validateToolCall(
      toolName,
      args,
      config.enabledTools,
    );
    if (validationError) {
      sendControl(socket, {
        type: 'tool_result',
        call_id: invocationId,
        error: validationError,
      });
      callbacks.onToolExecuted?.({
        toolName,
        args,
        error: validationError,
        success: false,
        timestamp: Date.now(),
      });
      return;
    }

    const executedAt = Date.now();
    const result = await this.toolExecution.execute(toolName, args, {
      callId,
      roomName,
      agentId: config.agentId,
      dynamicVariables: config.dynamicVariables ?? {},
      metadata: { engine: 'omni' },
      toolConfigs: config.toolConfigs,
    });

    sendControl(
      socket,
      result.success
        ? { type: 'tool_result', call_id: invocationId, result: result.output ?? {} }
        : { type: 'tool_result', call_id: invocationId, error: result.error ?? 'tool failed' },
    );

    callbacks.onToolExecuted?.({
      toolName,
      args,
      output: result.success ? result.output : undefined,
      error: result.success ? undefined : result.error,
      success: result.success,
      timestamp: executedAt,
    });
  }
}

/**
 * Parse a 0x02 transcript frame when it is structured JSON ({role/speaker,
 * text/transcript, final}). Returns null for bare token chunks so the caller
 * falls back to role-attributed accumulation.
 */
function tryParseTranscriptJson(
  raw: string,
): { role: 'user' | 'assistant'; text: string; isFinal: boolean } | null {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  let obj: {
    role?: string;
    speaker?: string;
    text?: string;
    transcript?: string;
    final?: boolean;
    is_final?: boolean;
    kind?: string;
  };
  try {
    obj = JSON.parse(trimmed) as typeof obj;
  } catch {
    return null;
  }
  const text = obj.text ?? obj.transcript;
  if (typeof text !== 'string') return null;
  const role: 'user' | 'assistant' =
    (obj.role ?? obj.speaker) === 'user' ? 'user' : 'assistant';
  const isFinal =
    obj.final ?? obj.is_final ?? (obj.kind === undefined ? true : obj.kind === 'final');
  return { role, text, isFinal };
}

/**
 * Send a JSON control frame using the same 0x03 binary framing the server uses.
 * (Sending bare text frames is rejected by the v2 protocol.)
 */
function sendControl(socket: WebSocket, obj: Record<string, unknown>): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const framed = Buffer.allocUnsafe(json.length + 1);
  framed[0] = CONTROL_TAG;
  json.copy(framed, 1);
  socket.send(framed);
}

/** Normalize ws RawData (Buffer | ArrayBuffer | Buffer[]) to a single Buffer. */
function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}

/** Keep the persona out of logs; it can be long and is on the agent record. */
function redactConfigure(frame: Record<string, unknown>): Record<string, unknown> {
  const tools = frame.tools as Array<{ name: string }> | undefined;
  return {
    voice_id: frame.voice_id,
    language: frame.language,
    hasGreeting: Boolean(frame.greeting),
    toolNames: tools?.map((t) => t.name) ?? [],
  };
}
