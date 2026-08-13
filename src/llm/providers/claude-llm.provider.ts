import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
  LlmToolDefinition,
} from '../../common/types/llm.types';
import { LlmProvider } from '../interfaces/llm-provider.interface';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string }
      >;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  model: string;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  usage: { input_tokens: number; output_tokens: number };
}

@Injectable()
export class ClaudeLlmProvider implements LlmProvider {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeLlmProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateResponse(request: LlmRequest): Promise<LlmResponse> {
    const apiKey = this.configService.get<string>('anthropic.apiKey');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not set — returning fallback');
      return {
        text: `I understand you said: "${request.userUtterance}". How can I help?`,
        model: DEFAULT_MODEL,
        finishReason: 'stop',
      };
    }

    const { systemPrompt, messages } = this.buildMessages(request);

    const body: Record<string, unknown> = {
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    };

    if (request.tools?.length) {
      body.tools = request.tools.map((t) => this.toAnthropicTool(t));
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    const textBlocks = data.content.filter((b) => b.type === 'text') as Array<{ type: 'text'; text: string }>;
    const toolBlocks = data.content.filter((b) => b.type === 'tool_use') as Array<{
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }>;

    const text = textBlocks.map((b) => b.text).join('').trim();
    const toolCalls: LlmToolCall[] = toolBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      arguments: b.input,
    }));

    const finishReason: LlmResponse['finishReason'] =
      data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop';

    return {
      text: text || (toolCalls.length > 0 ? '' : 'Sorry, I could not generate a response.'),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      model: data.model,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      },
    };
  }

  private buildMessages(request: LlmRequest): {
    systemPrompt: string;
    messages: AnthropicMessage[];
  } {
    let systemPrompt = '';
    const messages: AnthropicMessage[] = [];

    const source = request.messages?.length ? request.messages : request.conversationHistory;

    for (const msg of source) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
        continue;
      }

      if (msg.role === 'tool') {
        // Anthropic expects tool results as user messages with tool_result content.
        const last = messages[messages.length - 1];
        const toolResult = {
          type: 'tool_result' as const,
          tool_use_id: msg.toolCallId ?? 'unknown',
          content: msg.content,
        };
        if (last?.role === 'user' && Array.isArray(last.content)) {
          (last.content as unknown[]).push(toolResult);
        } else {
          messages.push({ role: 'user', content: [toolResult] });
        }
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        const contentBlocks: AnthropicMessage['content'] = [];
        if (msg.content) contentBlocks.push({ type: 'text', text: msg.content });
        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id ?? `tool_${Date.now()}`,
            name: tc.name,
            input: tc.arguments ?? {},
          });
        }
        messages.push({ role: 'assistant', content: contentBlocks });
        continue;
      }

      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Ensure last message is from user
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: request.userUtterance });
    }

    if (!systemPrompt && request.systemPrompt) {
      systemPrompt = request.systemPrompt;
    }

    return { systemPrompt, messages };
  }

  private toAnthropicTool(tool: LlmToolDefinition): AnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    };
  }
}
