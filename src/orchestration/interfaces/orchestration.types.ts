import { LlmMessage } from '../../common/types/llm.types';

export type OrchestrationStep =
  | 'listening'
  | 'thinking'
  | 'tool_running'
  | 'speaking'
  | 'ended';

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  /** 1-based turn number within the call. User and agent entries share the same index. */
  turnIndex?: number;
  /** Tool names invoked during this agent turn (only set on role='assistant'). */
  toolCallNames?: string[];
}

export interface ToolCallHistoryEntry {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  success: boolean;
  timestamp: number;
}

export interface ConversationState {
  callId: string;
  roomName: string;
  agentId?: string;
  participantId?: string;
  dynamicVariables: Record<string, string>;
  transcriptHistory: TranscriptEntry[];
  llmMessages: LlmMessage[];
  toolCallHistory: ToolCallHistoryEntry[];
  lastUserUtterance?: string;
  lastAgentResponse?: string;
  currentStep: OrchestrationStep;
  retryCount: number;
  enabledTools?: string[];
  toolConfigs?: Record<string, Record<string, unknown>>;
  systemPrompt?: string;
  llmProvider?: string;
  startedAt: number;
  updatedAt: number;
}

export interface OrchestrationTurnInput {
  callId: string;
  roomName: string;
  userUtterance: string;
  agentId?: string;
  participantId?: string;
  systemPrompt?: string;
  llmProvider?: string;
  dynamicVariables?: Record<string, string>;
  enabledTools?: string[];
  toolConfigs?: Record<string, Record<string, unknown>>;
}

export interface OrchestrationTurnResult {
  speakableText: string;
  toolCallsExecuted: string[];
  finishReason: 'stop' | 'tool_calls' | 'fallback' | 'error';
  /** Set when end_call tool was invoked successfully */
  shouldEndCall?: boolean;
  /**
   * Token usage summed across every LLM call in this turn's tool loop, plus the
   * model id. Undefined when no provider reported usage. Consumed for cost
   * accounting.
   */
  llmUsage?: {
    model?: string;
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  output?: unknown;
  error?: string;
}
