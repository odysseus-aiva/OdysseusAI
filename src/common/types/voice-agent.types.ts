import { LlmMessage } from './llm.types';
import type { AgentEngine } from '../../agents/interfaces/agent.types';

export type VoiceAgentSessionStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'stopped'
  | 'error';

export interface AgentConfig {
  /** Runtime engine. Undefined = pipeline (back-compat). */
  engine?: AgentEngine;
  systemPrompt?: string;
  /** Spoken at the start of the call. Empty string = no greeting. */
  greeting?: string;
  sttProvider?: string;
  llmProvider?: string;
  ttsProvider?: string;
  voiceId?: string;
  language?: string;
  /** Silence duration (ms) before declaring user turn complete */
  turnSilenceMs?: number;
  agentId?: string;
  /** Display name of the resolved agent profile. Snapshotted onto the call record. */
  agentName?: string;
  dynamicVariables?: Record<string, string>;
  /**
   * Tool names enabled for this session.
   * - undefined (no agentId): legacy POC — all registered tools
   * - []: no tools
   * - non-empty: allowlist only
   * When agentId is set, resolver always supplies an explicit array.
   */
  enabledTools?: string[];
  /** Per-tool config snapshot for this session (from agent_tools) */
  toolConfigs?: Record<string, Record<string, unknown>>;
}

export interface VoiceAgentSession {
  roomName: string;
  callId: string;
  status: VoiceAgentSessionStatus;
  agentConfig: AgentConfig;
  conversationHistory: LlmMessage[];
  interimTranscript: string;
  finalTranscript: string;
  startedAt: number;
  updatedAt: number;
  participantId?: string;
  error?: string;
}
