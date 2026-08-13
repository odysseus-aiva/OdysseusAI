import { LatencyMetrics } from './performance.types';
import { SttEvent } from './stt.types';
import { TurnDecision } from './turn.types';
import { LlmRequest, LlmResponse } from './llm.types';
import { CallCost } from './cost.types';

export type CallLogStep =
  | 'session_start'
  | 'session_stop'
  | 'participant_joined'
  | 'participant_left'
  | 'audio_received'
  | 'stt_event'
  /** @deprecated Retained for backward compat with stored events. Emit user_turn_end instead. */
  | 'turn_decision'
  | 'user_turn_end'
  | 'stt_turn_signal'
  | 'agent_config_loaded'
  | 'latency_snapshot'
  | 'llm_request'
  | 'llm_response'
  | 'tts_start'
  | 'tts_complete'
  | 'agent_speech_start'
  | 'agent_speech_end'
  | 'agent_playback'
  | 'agent_interrupted'
  | 'webhook'
  | 'error'
  | 'orchestration_start'
  | 'prompt_built'
  | 'tool_call'
  | 'tool_result'
  | 'tool_filler_speech'
  | 'response_planned'
  | 'guardrail_check'
  | 'orchestration_complete'
  | 'orchestration_error'
  /** Diagnostic: a raw PyAI Omni wire frame, sampled for protocol inspection. */
  | 'omni_frame';

export interface CallLogEntry {
  id: string;
  callId: string;
  /** Room name — the LiveKit room identifier. */
  roomName: string;
  participantId?: string;
  timestamp: number;
  step: CallLogStep;
  data?: unknown;
  error?: string;
  latencyMs?: number;
}

export interface SttLogData {
  event: SttEvent;
}

export interface TurnLogData {
  decision: TurnDecision;
}

export interface LlmLogData {
  request?: LlmRequest;
  response?: LlmResponse;
  durationMs?: number;
}

export interface TtsLogData {
  textLength: number;
  durationMs?: number;
  format?: string;
}

export type CallStatus = 'in_progress' | 'completed' | 'error';

/**
 * Conversation quality, which is orthogonal to `CallStatus`.
 *
 * `status` only answers "did the pipeline throw", so a call where the user
 * connected and left without speaking is indistinguishable from a successful
 * conversation. Outcome makes that distinction explicit and is derived from
 * fields already on the call record, so it applies retroactively.
 */
export type CallOutcome =
  | 'engaged' // at least one completed agent response turn
  | 'no_interaction' // connected and ended cleanly, but never conversed
  | 'failed' // pipeline error
  | 'in_progress';

export type CallSentiment = 'positive' | 'negative' | 'neutral';

export interface CallAnalysis {
  summary?: string;
  sentiment?: CallSentiment;
  analyzedAt?: number;
}

export type CallEndedBy =
  | 'participant'   // user disconnected / left
  | 'agent'         // end_call tool was invoked
  | 'timeout'       // LiveKit room_finished webhook
  | 'error'         // pipeline error
  | 'unknown';

/** Snapshot of the agent configuration active at call start. */
export interface AgentSnapshot {
  name?: string;
  llmProvider?: string;
  llmModel?: string;
  ttsProvider?: string;
  sttProvider?: string;
  voiceId?: string;
  language?: string;
  greeting?: string;
  enabledTools: string[];
}

export interface CallRecord {
  callId: string;
  roomName: string;
  participantId?: string;
  /** agentId from AgentConfig, if a named agent was used for the session. */
  agentId?: string;
  /** Snapshot of the agent config at call start — preserved even if agent is later edited. */
  agentSnapshot?: AgentSnapshot;
  /** Arbitrary key-value pairs supplied by the caller at session start. */
  metadata?: Record<string, string | number | boolean>;
  /** Backend URL path of the mixed WAV recording, set after the call ends. */
  recordingUrl?: string;
  status: CallStatus;
  endedBy?: CallEndedBy;
  /** Epoch ms when the session was finalized (stopSession called). */
  endedAt?: number;
  /** Total call duration in milliseconds (endedAt - createdAt). */
  durationMs?: number;
  /** Number of completed agent response turns in this call. */
  turnCount?: number;
  /** AI-generated post-call analysis (summary + sentiment). */
  analysis?: CallAnalysis;
  /** Estimated provider cost for the call (LLM + TTS + STT). */
  cost?: CallCost;
  createdAt: number;
  updatedAt: number;
  logs: CallLogEntry[];
  latencyMetrics: LatencyMetrics;
  errors: string[];
}
