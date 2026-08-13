export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Present on assistant messages that requested tools */
  toolCalls?: LlmToolCall[];
  /** Present on tool-result messages */
  toolCallId?: string;
  name?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmRequest {
  conversationHistory: LlmMessage[];
  userUtterance: string;
  systemPrompt?: string;
  /** Optional pre-built messages (when PromptBuilder owns assembly) */
  messages?: LlmMessage[];
  tools?: LlmToolDefinition[];
}

export interface LlmResponse {
  text: string;
  toolCalls?: LlmToolCall[];
  finishReason?: 'stop' | 'tool_calls';
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}
