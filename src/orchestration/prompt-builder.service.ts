import { Injectable } from '@nestjs/common';
import { LlmMessage, LlmToolDefinition } from '../common/types/llm.types';
import { ConversationState } from './interfaces/orchestration.types';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class PromptBuilderService {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  build(
    state: ConversationState,
    userUtterance: string,
  ): {
    messages: LlmMessage[];
    tools: LlmToolDefinition[];
  } {
    const tools = this.toolRegistry.listForPrompt(
      state.enabledTools,
      state.toolConfigs,
    );
    const systemPrompt = this.buildSystemPrompt(state, tools);

    const messages: LlmMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of state.llmMessages) {
      if (msg.role === 'system') continue;
      messages.push(msg);
    }

    messages.push({ role: 'user', content: userUtterance });

    return { messages, tools };
  }

  private buildSystemPrompt(
    state: ConversationState,
    tools: LlmToolDefinition[],
  ): string {
    const agentPrompt =
      state.systemPrompt?.trim() ||
      'You are a helpful voice assistant.';

    const dynamicBlock = this.formatDynamicVariables(state.dynamicVariables);
    const toolsBlock = tools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');

    return [
      agentPrompt,
      '',
      'Voice conversation rules:',
      '- Keep answers short and natural for spoken audio (1–3 sentences).',
      '- Never output raw JSON, code, or internal IDs unless the user asks.',
      '- Use tools only when needed to fulfill the user request.',
      '- If the user asks for their user details, profile, or account info, call get_user_details.',
      '- After a tool returns data, speak a clear summary — do not read JSON.',
      '',
      tools.length > 0
        ? `Available tools:\n${toolsBlock}`
        : 'No tools are available for this call.',
      dynamicBlock ? `\nCall context:\n${dynamicBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private formatDynamicVariables(
    vars: Record<string, string>,
  ): string | null {
    const entries = Object.entries(vars);
    if (entries.length === 0) return null;
    return entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
  }
}
