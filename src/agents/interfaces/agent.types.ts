export interface AgentDefaultProviders {
  stt?: string;
  llm?: string;
  tts?: string;
}

/**
 * Which runtime powers the agent.
 * - `pipeline`: our modular STT → orchestration/LLM → TTS chain (default).
 * - `omni`: a single fused realtime engine (PyAI Omni) that hears, reasons,
 *   calls tools, and speaks over one connection.
 * Providers (stt/llm/tts) only apply to the pipeline engine.
 */
export type AgentEngine = 'pipeline' | 'omni';

export const DEFAULT_AGENT_ENGINE: AgentEngine = 'pipeline';

export interface AgentRecord {
  agentId: string;
  name: string;
  engine?: AgentEngine;
  systemPrompt?: string;
  greeting?: string;
  defaultProviders?: AgentDefaultProviders;
  voiceId?: string;
  language?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentToolAssignment {
  agentId: string;
  toolName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentInput {
  agentId: string;
  name: string;
  engine?: AgentEngine;
  systemPrompt?: string;
  greeting?: string;
  defaultProviders?: AgentDefaultProviders;
  voiceId?: string;
  language?: string;
}

export interface UpdateAgentInput {
  name?: string;
  engine?: AgentEngine;
  systemPrompt?: string;
  greeting?: string;
  defaultProviders?: AgentDefaultProviders;
  voiceId?: string;
  language?: string;
}

export interface UpsertAgentToolInput {
  toolName: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface ResolvedAgentSessionConfig {
  agentId: string;
  name: string;
  engine: AgentEngine;
  systemPrompt?: string;
  greeting?: string;
  sttProvider?: string;
  llmProvider?: string;
  ttsProvider?: string;
  voiceId?: string;
  language?: string;
  /** Explicit allowlist — empty means no tools */
  enabledTools: string[];
  toolConfigs: Record<string, Record<string, unknown>>;
}
