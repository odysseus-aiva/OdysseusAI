import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SttEvent, SttStreamHandle } from '../common/types/stt.types';
import { TurnDecision } from '../common/types/turn.types';
import {
  AgentConfig,
  VoiceAgentSession,
  VoiceAgentSessionStatus,
} from '../common/types/voice-agent.types';
import { AgentSnapshot } from '../common/types/call-log.types';
import { CallLogsService } from '../call-logs/call-logs.service';
import { PostCallAnalysisService } from '../call-logs/post-call-analysis.service';
import { LivekitRtcService } from '../livekit/livekit-rtc.service';
import { PerformanceService } from '../performance/performance.service';
import { CostService } from '../cost/cost.service';
import { SttService } from '../stt/stt.service';
import { TtsService } from '../tts/tts.service';
import { OrchestratorService } from '../orchestration/orchestrator.service';
import { ConversationStateService } from '../orchestration/conversation-state.service';
import { AgentToolResolverService } from '../agents/agent-tool-resolver.service';
import { DEFAULT_AGENT_ENGINE } from '../agents/interfaces/agent.types';
import {
  OmniEngineService,
  OMNI_OUTPUT_RATE,
  type OmniHandle,
  type OmniTranscriptEvent,
  type OmniToolExecutedEvent,
} from './engines/omni-engine.service';
import { TurnDetectionService } from './turn-detection.service';
import { hasContentWord } from './barge-in.util';
import { RecordingService } from '../recording/recording.service';

interface ActiveSessionContext {
  session: VoiceAgentSession;
  sttStream: SttStreamHandle | null;
  isProcessingTurn: boolean;
  isAgentSpeaking: boolean;
  rtcConnected: boolean;
  /** Incremented on each user turn and on barge-in — stale orch/TTS discarded. */
  responseGenerationId: number;
  /** Generation id of the speech currently publishing (if any). */
  playbackGenerationId: number;
  /** Wall-clock when current agent utterance started playing/synthesizing. */
  agentSpeechStartedAtMs: number;
  /** Until this timestamp, agent must not speak again (post-interrupt backoff). */
  bargeInUntilMs: number;
  pendingBargeInConfirm: ReturnType<typeof setTimeout> | null;
  /** Number of completed (non-interrupted) agent response turns. */
  turnCount: number;
  /** Set only for the Omni engine — the live Omni socket bridge. */
  omni?: OmniHandle | null;
  /** Set only for the Omni engine — STT stream transcribing the agent's audio. */
  agentSttStream?: SttStreamHandle | null;
  /** Omni greeting already revealed in the live caption panel. */
  greetingCaptionSent?: boolean;
}

/**
 * Spoken when a session carries no authored greeting. Omni only greets when a
 * greeting is present in its configure frame, so this has to be set on the
 * config rather than applied at the pipeline's playback site alone.
 */
const DEFAULT_GREETING =
  'Hello! I am your voice assistant. How can I help you today?';

/**
 * Applies only to sessions started without an agent profile — the Voice Console's
 * "Default agent". Omni is the default engine there because it is the fastest
 * path to a working conversation on a fresh install: one socket, no per-stage
 * provider keys. Named agents are unaffected — the resolver always supplies
 * their persisted engine, which overrides this.
 */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  engine: 'omni',
  greeting: DEFAULT_GREETING,
  systemPrompt: 'You are a helpful voice assistant.',
  turnSilenceMs: 1200,
  language: 'en',
};

@Injectable()
export class VoiceAgentService {
  private readonly logger = new Logger(VoiceAgentService.name);
  private readonly sessions = new Map<string, ActiveSessionContext>();

  constructor(
    private readonly configService: ConfigService,
    private readonly sttService: SttService,
    private readonly ttsService: TtsService,
    private readonly callLogsService: CallLogsService,
    private readonly postCallAnalysis: PostCallAnalysisService,
    private readonly performanceService: PerformanceService,
    private readonly costService: CostService,
    private readonly turnDetectionService: TurnDetectionService,
    private readonly livekitRtcService: LivekitRtcService,
    private readonly orchestratorService: OrchestratorService,
    private readonly conversationStateService: ConversationStateService,
    private readonly agentToolResolver: AgentToolResolverService,
    private readonly omniEngine: OmniEngineService,
    private readonly recordingService: RecordingService,
  ) {}

  async startSession(
    roomName: string,
    callId: string,
    agentConfig?: AgentConfig,
    metadata?: Record<string, string | number | boolean>,
  ): Promise<VoiceAgentSession> {
    if (this.sessions.has(roomName)) {
      throw new ConflictException(
        `Voice agent session already active for room: ${roomName}`,
      );
    }
    this.logger.log(`Starting voice agent session: room=${roomName} call=${callId}`);

    const resolved = await this.agentToolResolver.resolve(agentConfig);
    const config: AgentConfig = {
      ...DEFAULT_AGENT_CONFIG,
      sttProvider:
        resolved.sttProvider ??
        this.configService.get<string>('providers.stt'),
      llmProvider:
        resolved.llmProvider ??
        this.configService.get<string>('providers.llm'),
      ttsProvider: this.resolveTtsProvider(resolved.ttsProvider),
      ...resolved,
    };

    const now = Date.now();
    const session: VoiceAgentSession = {
      roomName,
      callId,
      status: 'connecting',
      agentConfig: config,
      conversationHistory: config.systemPrompt
        ? [{ role: 'system', content: config.systemPrompt }]
        : [],
      interimTranscript: '',
      finalTranscript: '',
      startedAt: now,
      updatedAt: now,
    };
    const agentSnapshot: AgentSnapshot = {
      name: config.agentName,
      llmProvider: config.llmProvider,
      ttsProvider: config.ttsProvider,
      sttProvider: config.sttProvider,
      voiceId: config.voiceId,
      language: config.language,
      enabledTools: config.enabledTools ?? [],
      greeting: config.greeting,
    };

    this.logger.log(`Session created: ${JSON.stringify(session)}`);
    this.recordingService.startRecording(roomName, callId);
    await this.callLogsService.initCall(callId, roomName, undefined, config.agentId, agentSnapshot, metadata);
    await this.callLogsService.appendLog(callId, 'session_start', {
      roomName: roomName,
      data: { agentConfig: config },
    });
    await this.callLogsService.appendLog(callId, 'agent_config_loaded', {
      roomName: roomName,
      data: {
        agentId: config.agentId,
        llmProvider: config.llmProvider,
        ttsProvider: config.ttsProvider,
        sttProvider: config.sttProvider,
        voiceId: config.voiceId,
        language: config.language,
        enabledTools: config.enabledTools ?? [],
      },
    });

    const context: ActiveSessionContext = {
      session,
      sttStream: null,
      isProcessingTurn: false,
      isAgentSpeaking: false,
      rtcConnected: false,
      responseGenerationId: 0,
      playbackGenerationId: 0,
      agentSpeechStartedAtMs: 0,
      bargeInUntilMs: 0,
      pendingBargeInConfirm: null,
      turnCount: 0,
    };
    this.sessions.set(roomName, context);
    this.logger.log(`Session context created: ${JSON.stringify(context)}`);

    // Engine fork — the single seam between the modular pipeline and a fused
    // realtime engine. Everything above (session bookkeeping, call logs, cost,
    // performance) is engine-agnostic and shared. An agent's persisted engine
    // always wins; DEFAULT_AGENT_ENGINE only covers records saved before the
    // field existed.
    const engine = config.engine ?? DEFAULT_AGENT_ENGINE;
    if (engine === 'omni') {
      // Try Omni; on bring-up failure fall back to the pipeline so a PyAI
      // outage never kills the call (P0-5). If PyAI has no key at all, skip
      // straight to the pipeline.
      const omniStarted = await this.connectOmniToRoom(roomName, callId, config);
      if (!omniStarted) {
        this.logger.warn(
          `[${callId}] Omni unavailable — falling back to pipeline engine`,
        );
        await this.callLogsService.appendLog(callId, 'agent_config_loaded', {
          roomName,
          data: { engineFallback: 'omni->pipeline' },
        });
        await this.connectAgentToRoom(roomName, callId, config);
      }
    } else {
      // Register the STT provider for pipeline cost accounting — streaming STT
      // reports no per-request usage so we bill the call duration at finalize.
      this.costService.setSttProvider(callId, config.sttProvider);
      await this.connectAgentToRoom(roomName, callId, config);
    }

    this.setStatus(context, 'listening');
    this.logger.log(
      `Voice agent session started: room=${roomName} call=${callId} engine=${engine}`,
    );

    return { ...session };
  }

  /**
   * Update the session status AND publish it to the LiveKit room as an agent
   * attribute (`lk.agent.state`), so the frontend reflects listening/thinking/
   * speaking in real time without polling.
   */
  private setStatus(
    context: ActiveSessionContext,
    status: VoiceAgentSessionStatus,
  ): void {
    context.session.status = status;
    context.session.updatedAt = Date.now();
    void this.livekitRtcService.setAgentState(
      context.session.roomName,
      this.toAgentState(status),
    );
  }

  private toAgentState(status: VoiceAgentSessionStatus): string {
    switch (status) {
      case 'connecting':
        return 'initializing';
      case 'processing':
        return 'thinking';
      case 'speaking':
        return 'speaking';
      case 'listening':
      default:
        return 'listening';
    }
  }

  getSession(roomName: string): VoiceAgentSession {
    const context = this.sessions.get(roomName);
    if (!context) {
      throw new NotFoundException(`No active session for room: ${roomName}`);
    }
    return { ...context.session };
  }

  async getSessionWithLogs(roomName: string) {
    const session = this.getSession(roomName);
    const callRecord = await this.callLogsService.getByCallId(session.callId);
    const performance = this.performanceService.getRecord(session.callId);

    return {
      session,
      logs: callRecord.logs,
      latencyMetrics: callRecord.latencyMetrics,
      performance,
      errors: callRecord.errors,
    };
  }

  async stopSession(
    roomName: string,
    endedBy: import('../common/types/call-log.types').CallEndedBy = 'participant',
  ): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context) return;

    const { session, sttStream } = context;
    this.clearBargeInConfirm(context);
    this.livekitRtcService.cancelAssistantCaption(roomName);
    this.livekitRtcService.stopPlayback(roomName);

    if (sttStream) {
      await sttStream.end();
    }

    // Close the Omni socket + its agent-audio STT stream.
    if (context.omni) {
      await context.omni.stop().catch(() => undefined);
      context.omni = null;
    }
    if (context.agentSttStream) {
      await context.agentSttStream.end().catch(() => undefined);
      context.agentSttStream = null;
    }

    if (context.rtcConnected) {
      await this.livekitRtcService.disconnect(roomName);
    }

    this.turnDetectionService.clearCall(session.callId);
    await this.conversationStateService.release(session.callId);

    const turnCount = context.turnCount;
    const finalLatencyMetrics = this.performanceService.getFinalMetrics(session.callId);
    this.performanceService.clearRecord(session.callId);

    const callSeconds = session.startedAt
      ? Math.max(0, (Date.now() - session.startedAt) / 1000)
      : 0;
    const callEngine = session.agentConfig?.engine ?? DEFAULT_AGENT_ENGINE;
    const finalCost = callEngine === 'omni'
      ? this.costService.finalizeOmni(session.callId, callSeconds)
      : this.costService.finalize(session.callId, callSeconds);
    this.costService.clearRecord(session.callId);

    this.sessions.delete(roomName);

    session.status = 'stopped';
    session.updatedAt = Date.now();

    const hasErrors = Boolean(session.error);
    const recordingUrl = await this.recordingService.stopRecording(roomName).catch(() => null);

    await this.callLogsService.appendLog(session.callId, 'session_stop', {
      roomName: roomName,
      data: {
        endedBy,
        turnCount,
        durationMs: session.startedAt ? Date.now() - session.startedAt : undefined,
        p50ResponseLatencyMs: finalLatencyMetrics.p50ResponseLatencyMs,
        p95ResponseLatencyMs: finalLatencyMetrics.p95ResponseLatencyMs,
      },
    });
    await this.callLogsService.finalizeCall(session.callId, endedBy, hasErrors, {
      turnCount,
      finalLatencyMetrics,
      finalCost,
      recordingUrl: recordingUrl ?? undefined,
    });

    // Fire-and-forget post-call analysis (summary + sentiment).
    void this.postCallAnalysis.analyze(session.callId).catch(() => {});

    this.logger.log(`Voice agent session stopped: room=${roomName} endedBy=${endedBy}`);
  }

  async onParticipantJoined(
    roomName: string,
    participantId: string,
  ): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context) return;

    context.session.participantId = participantId;
    context.session.updatedAt = Date.now();
    await this.callLogsService.setParticipantId(
      context.session.callId,
      participantId,
    );
    await this.callLogsService.appendLog(
      context.session.callId,
      'participant_joined',
      { roomName, participantId },
    );

    await this.subscribeToParticipantAudio(roomName, participantId);
  }

  async onParticipantLeft(
    roomName: string,
    participantId: string,
  ): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context) return;

    await this.callLogsService.appendLog(
      context.session.callId,
      'participant_left',
      { roomName, participantId },
    );
  }

  private resolveTtsProvider(requested?: string): string {
    if (requested) return requested;

    const configured =
      this.configService.get<string>('providers.tts') ?? 'openai';
    if (configured === 'elevenlabs') {
      const elevenLabsKey = this.configService.get<string>('elevenlabs.apiKey');
      if (!elevenLabsKey) {
        return 'openai';
      }
    }
    return configured;
  }

  /**
   * Omni engine: LiveKit stays the transport, but the STT→orchestrator→TTS
   * chain is replaced by one PyAI Omni socket. Mic PCM is forwarded to Omni and
   * Omni's audio is published back through the same RTC path. Returns false if
   * Omni could not be brought up, so the caller can fall back to the pipeline.
   */
  private async connectOmniToRoom(
    roomName: string,
    callId: string,
    config: AgentConfig,
  ): Promise<boolean> {
    const agentIdentity = `agent-${callId}`;
    const context = this.sessions.get(roomName);
    if (!context) return false;

    // Create ConversationState so the transcript endpoint works for Omni calls,
    // mirroring what OrchestratorService does for the pipeline engine.
    const convState = await this.conversationStateService.getOrCreate({
      callId,
      roomName,
      agentId: config.agentId,
      dynamicVariables: config.dynamicVariables,
      enabledTools: config.enabledTools,
      toolConfigs: config.toolConfigs,
      systemPrompt: config.systemPrompt,
    });

    // Track tool names accumulated within the current assistant turn so they
    // can be attached to the assistant TranscriptEntry (mirrors pipeline behaviour).
    const pendingToolNames: string[] = [];

    // Omni never streams the agent's transcript, so transcribe the agent's OWN
    // outgoing audio with our STT (PyAI, Deepgram fallback). This is the single
    // source for agent turns — live captions + persisted history — including the greeting.
    const agentSttOptions = {
      callId,
      roomName,
      participantId: 'agent',
      language: config.language,
      sampleRate: OMNI_OUTPUT_RATE,
    };
    const agentStt = this.sttService.transcribeStream(agentSttOptions, 'pyai');
    context.agentSttStream = agentStt;

    const onAgentSttEvent = (event: SttEvent) => {
      const text = (event.transcript ?? '').trim();
      if (!text) return;
      void this.livekitRtcService.publishLiveTranscript(roomName, {
        role: 'assistant',
        text,
        isFinal: event.isFinal,
      });
      if (!event.isFinal) return;
      void (async () => {
        try {
          const turnIndex =
            convState.transcriptHistory.filter((e) => e.role === 'assistant').length + 1;
          convState.transcriptHistory.push({
            role: 'assistant',
            text,
            timestamp: Date.now(),
            turnIndex,
            toolCallNames: pendingToolNames.length > 0 ? [...pendingToolNames] : undefined,
          });
          convState.lastAgentResponse = text;
          pendingToolNames.length = 0;
          await this.conversationStateService.save(convState);
          const active = this.sessions.get(roomName);
          if (active) active.turnCount += 1;
        } catch (err) {
          this.logger.error(`[${callId}] Agent STT persist failed: ${(err as Error).message}`);
        }
      })();
    };

    agentStt.onEvent(onAgentSttEvent);
    agentStt.onFatalError?.((err) => {
      this.logger.warn(
        `[${callId}] PyAI agent STT failed (${err.message}) — falling back to Deepgram`,
      );
      agentStt.end().catch(() => undefined);
      const fallback = this.sttService.transcribeStream(agentSttOptions, 'deepgram');
      fallback.onEvent(onAgentSttEvent);
      context.agentSttStream = fallback;
    });

    let handle: OmniHandle;
    try {
      handle = await this.omniEngine.connect(roomName, callId, config, {
        onAudioOut: (pcm) => {
          // Omni streams many small 24 kHz frames back-to-back. Use the
          // streaming-append path — publishPcm would abort each frame with the
          // next and shred the audio.
          void this.livekitRtcService.enqueuePcm(roomName, pcm, OMNI_OUTPUT_RATE);
          // Tee the agent audio into STT for live agent transcription.
          context.agentSttStream?.writeAudio(pcm);
        },
        onStatus: (status) => {
          const active = this.sessions.get(roomName);
          if (!active) return;
          this.setStatus(active, status);
        },
        onBargeIn: () => {
          this.livekitRtcService.cancelAssistantCaption(roomName);
          void this.livekitRtcService.publishLiveEvent(roomName, {
            kind: 'state',
            state: 'interrupted',
          });
          if (this.isBargeInEnabled()) {
            this.livekitRtcService.stopPlayback(roomName);
          }
        },
        onSessionEnd: () => {
          this.livekitRtcService.cancelAssistantCaption(roomName);
          void this.stopSession(roomName, 'agent');
        },
        onFatalError: (message) => {
          this.livekitRtcService.cancelAssistantCaption(roomName);
          const active = this.sessions.get(roomName);
          if (active) {
            active.session.error = message;
            this.setStatus(active, 'error');
          }
          this.logger.error(`[${callId}] Omni fatal: ${message}`);
          void this.stopSession(roomName, 'error');
        },
        onTranscript: (event: OmniTranscriptEvent) => {
          // Agent transcription comes from server-side STT on the agent audio
          // (wired below) — the single source for agent turns. Here we only
          // surface the CALLER's ASR from Omni's 0x02 stream.
          if (event.role !== 'user') return;
          void this.livekitRtcService.publishLiveTranscript(roomName, {
            role: 'user',
            text: event.text,
            isFinal: event.isFinal,
          });
          if (!event.isFinal) return;
          void (async () => {
            try {
              const turnIndex =
                convState.transcriptHistory.filter((e) => e.role === 'user').length + 1;
              convState.transcriptHistory.push({
                role: 'user',
                text: event.text,
                timestamp: event.timestamp,
                turnIndex,
              });
              convState.lastUserUtterance = event.text;
              await this.conversationStateService.save(convState);
            } catch (err) {
              this.logger.error(`[${callId}] Failed to save Omni transcript: ${(err as Error).message}`);
            }
          })();
        },
        onToolExecuted: (event: OmniToolExecutedEvent) => {
          pendingToolNames.push(event.toolName);
          void this.livekitRtcService.publishLiveEvent(roomName, {
            kind: 'tool',
            id: `${event.toolName}-${event.timestamp}`,
            name: event.toolName,
            status: event.success ? 'ok' : 'error',
            latencyMs: event.latencyMs,
            args: event.args,
            output: event.output,
            error: event.error,
          });
          void (async () => {
            try {
              convState.toolCallHistory.push({
                name: event.toolName,
                input: event.args,
                output: event.output,
                error: event.error,
                success: event.success,
                timestamp: event.timestamp,
              });
              await this.conversationStateService.save(convState);
            } catch (err) {
              this.logger.error(`[${callId}] Failed to save Omni tool history: ${(err as Error).message}`);
            }
          })();
        },
      });
    } catch (err) {
      // Bring-up failed (no key, connect timeout, immediate reject) — signal
      // the caller to fall back to the pipeline. No RTC has been opened yet.
      this.logger.warn(
        `[${callId}] Omni connect failed: ${(err as Error).message}`,
      );
      return false;
    }

    context.omni = handle;

    await this.livekitRtcService.connectAgent(
      roomName,
      agentIdentity,
      (pcm) => {
        const active = this.sessions.get(roomName);
        active?.omni?.writeAudio(pcm);
      },
      // Send `configure` only once a listener is subscribed — Omni speaks its
      // greeting (turn 0) the instant it's configured, so configuring earlier
      // would play the greeting into an empty room.
      () => {
        const active = this.sessions.get(roomName);
        active?.omni?.start();
      },
      (_participantId) => {
        void this.stopSession(roomName, 'participant');
      },
    );

    context.rtcConnected = true;
    return true;
  }

  private async connectAgentToRoom(
    roomName: string,
    callId: string,
    config: AgentConfig,
  ): Promise<void> {
    const agentIdentity = `agent-${callId}`;
    const context = this.sessions.get(roomName);
    if (!context) return;

    const sttStream = this.sttService.transcribeStream(
      {
        callId,
        roomName,
        participantId: context.session.participantId ?? 'pending-participant',
        language: config.language,
        sampleRate: 16000,
      },
      config.sttProvider,
    );

    sttStream.onEvent((event) => {
      void this.handleSttEvent(roomName, event);
    });

    context.sttStream = sttStream;

    await this.livekitRtcService.connectAgent(
      roomName,
      agentIdentity,
      (pcm, participantId) => {
        const active = this.sessions.get(roomName);
        if (!active?.sttStream) return;

        // Half-duplex only when barge-in is disabled.
        if (!this.isBargeInEnabled() && active.isAgentSpeaking) return;

        if (!active.session.participantId) {
          active.session.participantId = participantId;
          void this.callLogsService.setParticipantId(callId, participantId);
        }

        active.sttStream.writeAudio(pcm);
      },
      // Fires once the browser subscribes to the agent track — only then can
      // the greeting actually be heard, so we defer it to this callback.
      () => {
        void this.sendGreeting(roomName);
      },
      // RTC fires ParticipantDisconnected immediately when the user leaves.
      // This is more reliable than the webhook (which can lag or arrive late).
      (_participantId) => {
        void this.stopSession(roomName, 'participant');
      },
    );

    context.rtcConnected = true;
  }

  private isBargeInEnabled(): boolean {
    return this.configService.get<boolean>('bargeIn.enabled') !== false;
  }

  private getBargeInMinVoiceMs(): number {
    return this.configService.get<number>('bargeIn.minVoiceMs') ?? 300;
  }

  private getBargeInStartHoldoffMs(): number {
    return this.configService.get<number>('bargeIn.startHoldoffMs') ?? 400;
  }

  private getBargeInBackoffMs(): number {
    return this.configService.get<number>('bargeIn.backoffMs') ?? 700;
  }

  private clearBargeInConfirm(context: ActiveSessionContext): void {
    if (context.pendingBargeInConfirm) {
      clearTimeout(context.pendingBargeInConfirm);
      context.pendingBargeInConfirm = null;
    }
  }

  private beginAgentSpeech(
    context: ActiveSessionContext,
    generationId: number,
  ): void {
    context.isAgentSpeaking = true;
    context.playbackGenerationId = generationId;
    context.agentSpeechStartedAtMs = Date.now();
    this.setStatus(context, 'speaking');
    void this.callLogsService.appendLog(
      context.session.callId,
      'agent_speech_start',
      { roomName: context.session.roomName, data: { generationId } },
    );
  }

  private endAgentSpeech(context: ActiveSessionContext): void {
    const durationMs = context.agentSpeechStartedAtMs
      ? Date.now() - context.agentSpeechStartedAtMs
      : undefined;
    context.isAgentSpeaking = false;
    context.playbackGenerationId = 0;
    context.agentSpeechStartedAtMs = 0;
    this.clearBargeInConfirm(context);
    if (context.session.status !== 'error' && context.session.status !== 'stopped') {
      this.setStatus(context, 'listening');
    }
    void this.callLogsService.appendLog(
      context.session.callId,
      'agent_speech_end',
      { roomName: context.session.roomName, data: { durationMs } },
    );
  }

  /**
   * Confirm and apply barge-in: stop playback, supersede in-flight response.
   */
  private async confirmBargeIn(roomName: string, reason: string): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context || !context.isAgentSpeaking) return;

    this.clearBargeInConfirm(context);

    const holdoffMs = this.getBargeInStartHoldoffMs();
    const elapsed = Date.now() - context.agentSpeechStartedAtMs;
    if (elapsed < holdoffMs) {
      this.logger.debug(
        `[${context.session.callId}] Barge-in deferred — start holdoff (${elapsed}/${holdoffMs}ms)`,
      );
      this.scheduleBargeInConfirm(roomName, holdoffMs - elapsed);
      return;
    }

    const interruptedGeneration = context.responseGenerationId;
    context.responseGenerationId += 1;
    context.bargeInUntilMs = Date.now() + this.getBargeInBackoffMs();

    this.logger.log(
      `[${context.session.callId}] Barge-in confirmed (${reason}) gen ${interruptedGeneration} → ${context.responseGenerationId}`,
    );

    this.livekitRtcService.stopPlayback(roomName);
    this.endAgentSpeech(context);

    await this.callLogsService.appendLog(
      context.session.callId,
      'agent_interrupted',
      {
        roomName: roomName,
        data: {
          generationId: interruptedGeneration,
          reason: 'user_speech',
          detail: reason,
          interrupted: true,
        },
      },
    );
  }

  private scheduleBargeInConfirm(roomName: string, delayMs?: number): void {
    const context = this.sessions.get(roomName);
    if (!context || context.pendingBargeInConfirm) return;

    const delay = delayMs ?? this.getBargeInMinVoiceMs();
    context.pendingBargeInConfirm = setTimeout(() => {
      context.pendingBargeInConfirm = null;
      void this.confirmBargeIn(roomName, 'speech_duration');
    }, delay);
  }

  private maybeHandleBargeInSignal(
    roomName: string,
    event: SttEvent,
  ): void {
    const context = this.sessions.get(roomName);
    if (!context || !this.isBargeInEnabled() || !context.isAgentSpeaking) {
      return;
    }

    if (event.type === 'speech_start') {
      this.scheduleBargeInConfirm(roomName);
      return;
    }

    if (event.type === 'interim' && event.transcript && hasContentWord(event.transcript)) {
      void this.confirmBargeIn(roomName, 'content_word');
      return;
    }

    if (event.type === 'speech_end') {
      // Speech ended before confirm → treat as noise/backchannel.
      this.clearBargeInConfirm(context);
    }
  }

  private async speakToRoom(
    roomName: string,
    text: string,
    provider?: string,
    generationId?: number,
  ): Promise<'completed' | 'interrupted' | 'skipped'> {
    const context = this.sessions.get(roomName);
    if (!context || !text.trim()) return 'skipped';

    const gen = generationId ?? context.responseGenerationId;
    if (gen !== context.responseGenerationId) {
      this.logger.log(
        `[${context.session.callId}] Skipping speak — stale generation ${gen}`,
      );
      return 'skipped';
    }

    if (Date.now() < context.bargeInUntilMs) {
      this.logger.log(
        `[${context.session.callId}] Skipping speak — post barge-in backoff`,
      );
      return 'skipped';
    }

    this.beginAgentSpeech(context, gen);

    try {
      if (gen !== context.responseGenerationId) {
        return 'skipped';
      }

      const ttsProvider = provider ?? context.session.agentConfig.ttsProvider;

      // Every spoken path — greeting, tool filler, and final answer — routes
      // through here, so this one call site captures all TTS characters billed.
      this.costService.addTtsUsage(context.session.callId, text.length, ttsProvider);

      const ttsResult = await this.ttsService.synthesizeSpeech(
        {
          text,
          voiceId: context.session.agentConfig.voiceId,
          format: 'pcm',
          sampleRate: 24000,
        },
        ttsProvider,
      );

      if (gen !== context.responseGenerationId) {
        this.logger.log(
          `[${context.session.callId}] Skipping publish — interrupted during TTS synth`,
        );
        return 'interrupted';
      }

      // First audio of the turn reaching the room is the closest proxy we have
      // for "the user heard something". Without it, response latency silently
      // degrades to "synthesis finished", which overstates perceived delay.
      this.performanceService.recordMilestone(
        context.session.callId,
        'agent_playback_start',
        { firstWins: true },
      );

      const result = await this.livekitRtcService.publishPcm(
        roomName,
        ttsResult.audio,
        ttsResult.sampleRate ?? 24000,
      );
      return result;
    } finally {
      const active = this.sessions.get(roomName);
      if (active && active.playbackGenerationId === gen) {
        this.endAgentSpeech(active);
      }
    }
  }

  /**
   * Start filler speech for tool execution. Returns a promise for playback
   * completion so the caller can overlap tools and then await before the final answer.
   */
  private speakToolFiller(
    roomName: string,
    fillerText: string,
    toolNames: string[],
    generationId: number,
  ): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context) return Promise.resolve();

    this.logger.log(
      `[${context.session.callId}] Starting tool filler speech: "${fillerText}" tools=${JSON.stringify(toolNames)}`,
    );

    void this.callLogsService.appendLog(
      context.session.callId,
      'tool_filler_speech',
      {
        roomName: roomName,
        data: { text: fillerText, toolNames },
      },
    );

    return this.speakToRoom(roomName, fillerText, undefined, generationId).then(
      (result) => {
        this.logger.log(
          `[${context.session.callId}] Tool filler speech ${result}`,
        );
      },
    );
  }

  private async sendGreeting(roomName: string): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context) return;

    const greeting = context.session.agentConfig.greeting ?? DEFAULT_GREETING;

    if (greeting === '') return;

    void this.livekitRtcService.streamAssistantCaption(roomName, greeting);
    await this.speakToRoom(roomName, greeting);

    await this.callLogsService.appendLog(
      context.session.callId,
      'agent_playback',
      {
        roomName: roomName,
        data: { greeting: true },
      },
    );
  }

  private async subscribeToParticipantAudio(
    roomName: string,
    participantId: string,
  ): Promise<void> {
    this.logger.log(
      `Participant "${participantId}" joined room "${roomName}" — RTC auto-subscribes to audio`,
    );
  }

  private handleSttEvent(roomName: string, event: SttEvent): void {
    const context = this.sessions.get(roomName);
    if (!context) return;

    // Half-duplex: ignore STT while speaking when barge-in is off.
    if (!this.isBargeInEnabled() && context.isAgentSpeaking) return;

    this.maybeHandleBargeInSignal(roomName, event);

    const { session } = context;
    const silenceMs = session.agentConfig.turnSilenceMs ?? 700;

    // Captions first — never wait on Mongo before pushing to the browser.
    if (
      (event.type === 'interim' || event.type === 'final') &&
      event.transcript
    ) {
      if (event.type === 'interim') {
        session.interimTranscript = event.transcript;
      } else {
        session.finalTranscript = event.transcript;
        this.performanceService.recordMilestone(
          session.callId,
          'stt_final_transcript',
        );
      }
      void this.livekitRtcService.publishLiveTranscript(roomName, {
        role: 'user',
        text: event.transcript,
        isFinal: event.type === 'final',
      });
    }

    // Skip persisting every interim (high-frequency); keep finals + speech markers.
    if (event.type !== 'interim') {
      void this.callLogsService.appendLog(session.callId, 'stt_event', {
        roomName: roomName,
        participantId: session.participantId,
        data: { event },
      });
    }

    if (event.type === 'speech_start') {
      this.performanceService.recordMilestone(
        session.callId,
        'user_speech_start',
      );
      if (!context.isAgentSpeaking) {
        session.status = 'listening';
      }
    }

    if (event.type === 'speech_end') {
      this.performanceService.recordMilestone(
        session.callId,
        'user_speech_end',
      );
    }

    const turnDecision = this.turnDetectionService.detectFromSttEvent(
      session.callId,
      event,
      silenceMs,
      (decision) => {
        const active = this.sessions.get(roomName);
        // Do not commit a turn while agent audio is still playing.
        if (active?.isAgentSpeaking) return;
        void this.onUserTurnComplete(roomName, decision);
      },
    );

    if (turnDecision) {
      // stt_turn_signal carries low-level speech_start / speech_end markers from STT.
      // The user's full turn completing is logged as user_turn_end in onUserTurnComplete.
      void this.callLogsService.appendLog(session.callId, 'stt_turn_signal', {
        roomName: roomName,
        data: { decision: turnDecision },
      });
    }
  }

  private async onUserTurnComplete(
    roomName: string,
    decision: TurnDecision,
  ): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context || context.isAgentSpeaking) return;

    // Allow a new turn after barge-in even if previous orch is still finishing
    // (stale result will be discarded via generation id).
    if (context.isProcessingTurn) {
      this.logger.log(
        `[${context.session.callId}] New user turn while processing — bumping generation to supersede`,
      );
      context.responseGenerationId += 1;
    }

    const utterance = decision.transcript?.trim();
    if (!utterance) return;

    context.isProcessingTurn = true;
    const { session } = context;
    this.setStatus(context, 'processing');

    await this.callLogsService.appendLog(session.callId, 'user_turn_end', {
      roomName: roomName,
      data: { decision },
    });

    try {
      await this.processUserUtterance(roomName, utterance);
    } catch (error) {
      const message = (error as Error).message;
      this.setStatus(context, 'error');
      session.error = message;
      await this.callLogsService.appendLog(session.callId, 'error', {
        roomName: roomName,
        error: message,
      });
      this.logger.error(`[${session.callId}] Pipeline error: ${message}`);
    } finally {
      context.isProcessingTurn = false;
      if (session.status !== 'error' && session.status !== 'stopped') {
        this.setStatus(context, 'listening');
      }
      session.updatedAt = Date.now();
    }
  }

  private async processUserUtterance(
    roomName: string,
    utterance: string,
  ): Promise<void> {
    const context = this.sessions.get(roomName);
    if (!context) return;

    const generationId = ++context.responseGenerationId;
    const { session } = context;
    const { agentConfig } = session;

    session.conversationHistory.push({ role: 'user', content: utterance });

    this.performanceService.recordMilestone(session.callId, 'llm_start');

    const orchStart = Date.now();
    this.logger.log(
      `[${session.callId}] Orchestration begin gen=${generationId} utterance="${utterance}" tools=${JSON.stringify(agentConfig.enabledTools ?? null)}`,
    );

    let fillerPlayback: Promise<void> | null = null;
    const orchestration = await this.orchestratorService.handleUserTurn(
      {
        callId: session.callId,
        roomName,
        userUtterance: utterance,
        agentId: agentConfig.agentId,
        participantId: session.participantId,
        systemPrompt: agentConfig.systemPrompt,
        llmProvider: agentConfig.llmProvider,
        dynamicVariables: agentConfig.dynamicVariables,
        enabledTools: agentConfig.enabledTools,
        toolConfigs: agentConfig.toolConfigs,
      },
      {
        onBeforeToolExecution: async ({ fillerText, toolNames }) => {
          if (!fillerText) return;
          if (generationId !== context.responseGenerationId) return;
          fillerPlayback = this.speakToolFiller(
            roomName,
            fillerText,
            toolNames,
            generationId,
          );
        },
        onToolEvent: (event) => {
          void this.livekitRtcService.publishLiveEvent(roomName, {
            kind: 'tool',
            id: event.id,
            name: event.name,
            status: event.status,
            latencyMs: event.latencyMs,
            args: event.args,
            output: event.output,
            error: event.error,
          });
        },
      },
    );
    const orchDuration = Date.now() - orchStart;
    this.logger.log(
      `[${session.callId}] Orchestration end gen=${generationId} ${orchDuration}ms finishReason=${orchestration.finishReason} tools=${JSON.stringify(orchestration.toolCallsExecuted)} speakable="${orchestration.speakableText.slice(0, 120)}"`,
    );

    this.performanceService.recordMilestone(session.callId, 'llm_end');

    // Record token usage even when the turn is later discarded — the tokens
    // were billed by the provider regardless of whether we speak the result.
    if (orchestration.llmUsage) {
      this.costService.addLlmUsage(session.callId, orchestration.llmUsage);
    }

    if (generationId !== context.responseGenerationId) {
      this.logger.log(
        `[${session.callId}] Discarding orch result — interrupted (gen ${generationId} stale, current=${context.responseGenerationId})`,
      );
      session.conversationHistory.push({
        role: 'assistant',
        content: `[interrupted] ${orchestration.speakableText}`,
      });
      await this.callLogsService.appendLog(session.callId, 'llm_response', {
        roomName: roomName,
        data: {
          response: {
            text: orchestration.speakableText,
            toolCallsExecuted: orchestration.toolCallsExecuted,
            finishReason: orchestration.finishReason,
            interrupted: true,
          },
        },
        latencyMs: orchDuration,
      });
      return;
    }

    if (fillerPlayback) {
      await fillerPlayback;
    }

    if (generationId !== context.responseGenerationId) {
      this.logger.log(
        `[${session.callId}] Discarding final TTS — interrupted after filler`,
      );
      session.conversationHistory.push({
        role: 'assistant',
        content: `[interrupted] ${orchestration.speakableText}`,
      });
      return;
    }

    session.conversationHistory.push({
      role: 'assistant',
      content: orchestration.speakableText,
    });

    await this.callLogsService.appendLog(session.callId, 'llm_response', {
      roomName: roomName,
      data: {
        response: {
          text: orchestration.speakableText,
          toolCallsExecuted: orchestration.toolCallsExecuted,
          finishReason: orchestration.finishReason,
        },
      },
      latencyMs: orchDuration,
    });

    this.performanceService.recordMilestone(session.callId, 'tts_start');
    await this.callLogsService.appendLog(session.callId, 'tts_start', {
      roomName: roomName,
      data: { textLength: orchestration.speakableText.length },
    });

    void this.livekitRtcService.streamAssistantCaption(
      roomName,
      orchestration.speakableText,
    );

    const ttsStart = Date.now();
    const speakResult = await this.speakToRoom(
      roomName,
      orchestration.speakableText,
      agentConfig.ttsProvider,
      generationId,
    );
    const ttsDuration = Date.now() - ttsStart;

    this.performanceService.recordMilestone(session.callId, 'tts_end');

    await this.callLogsService.appendLog(session.callId, 'tts_complete', {
      roomName: roomName,
      data: {
        textLength: orchestration.speakableText.length,
        durationMs: ttsDuration,
        result: speakResult,
      },
      latencyMs: ttsDuration,
    });

    if (speakResult === 'interrupted' || speakResult === 'skipped') {
      const last = session.conversationHistory[session.conversationHistory.length - 1];
      if (last?.role === 'assistant' && !last.content.startsWith('[interrupted]')) {
        last.content = `[interrupted] ${last.content}`;
      }
      return;
    }

    const turnLatency = this.performanceService.commitTurnLatency(session.callId);
    context.turnCount += 1;

    await this.callLogsService.appendLog(session.callId, 'latency_snapshot', {
      roomName: roomName,
      data: {
        turnIndex: context.turnCount,
        sttLatencyMs: turnLatency.sttLatencyMs,
        llmLatencyMs: turnLatency.llmLatencyMs,
        ttsLatencyMs: turnLatency.ttsLatencyMs,
        totalResponseLatencyMs: turnLatency.totalResponseLatencyMs,
        toolsUsed: orchestration.toolCallsExecuted ?? [],
      },
      latencyMs: turnLatency.totalResponseLatencyMs,
    });

    if (turnLatency.totalResponseLatencyMs !== undefined) {
      await this.callLogsService.updateLatencyMetrics(session.callId, turnLatency);
    }

    await this.callLogsService.appendLog(session.callId, 'agent_playback', {
      roomName: roomName,
      data: {
        textLength: orchestration.speakableText.length,
        result: speakResult,
      },
    });

    if (
      orchestration.shouldEndCall &&
      generationId === context.responseGenerationId
    ) {
      this.logger.log(
        `[${session.callId}] end_call requested — stopping session after playback`,
      );
      await this.stopSession(roomName, 'agent');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function normalizeCaption(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
