import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
} from '../../common/types/llm.types';
import { LlmProvider } from '../interfaces/llm-provider.interface';

interface OpenAiChatMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateResponse(request: LlmRequest): Promise<LlmResponse> {
    const apiKey = this.configService.get<string>('openai.apiKey');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY not set — returning simulated LLM response',
      );
      return {
        text: `I understand you said: "${request.userUtterance}". How can I help?`,
        model: 'gpt-4.1',
        finishReason: 'stop',
      };
    }

    const messages = this.buildOpenAiMessages(request);

    const body: Record<string, unknown> = {
      model: 'gpt-4.1',
      messages,
      max_tokens: 400,
      temperature: 0.7,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
      model?: string;
    };

    const choice = data.choices?.[0];
    const message = choice?.message;
    const toolCalls = this.parseToolCalls(message?.tool_calls);
    const text = message?.content?.trim() ?? '';
    const finishReason: LlmResponse['finishReason'] =
      toolCalls.length > 0 || choice?.finish_reason === 'tool_calls'
        ? 'tool_calls'
        : 'stop';

    return {
      text:
        text ||
        (toolCalls.length > 0
          ? ''
          : 'Sorry, I could not generate a response.'),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      model: data.model ?? 'gpt-4o-mini',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }

  private buildOpenAiMessages(request: LlmRequest): OpenAiChatMessage[] {
    if (request.messages && request.messages.length > 0) {
      return request.messages.map((msg) => this.toOpenAiMessage(msg));
    }

    const messages: OpenAiChatMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.conversationHistory) {
      if (msg.role === 'system' && request.systemPrompt) continue;
      messages.push(this.toOpenAiMessage(msg));
    }

    if (
      !messages.some(
        (m) => m.role === 'user' && m.content === request.userUtterance,
      )
    ) {
      messages.push({ role: 'user', content: request.userUtterance });
    }

    return messages;
  }

  private toOpenAiMessage(msg: LlmMessage): OpenAiChatMessage {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId ?? 'unknown',
        name: msg.name,
      };
    }

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc, index) => ({
          id: tc.id ?? `call_${index}`,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        })),
      };
    }

    return {
      role: msg.role,
      content: msg.content,
    };
  }

  private parseToolCalls(
    raw?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>,
  ): LlmToolCall[] {
    if (!raw?.length) return [];

    return raw.map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments || '{}') as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        this.logger.warn(
          `Failed to parse tool arguments for ${tc.function.name}`,
        );
      }

      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      };
    });
  }
}
