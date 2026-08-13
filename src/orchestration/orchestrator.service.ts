import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmMessage, LlmToolCall } from '../common/types/llm.types';
import { LlmService } from '../llm/llm.service';
import { ConversationStateService } from './conversation-state.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionService } from './tool-execution.service';
import { ResponsePlannerService } from './response-planner.service';
import { GuardrailService } from './guardrail.service';
import { EventLoggerService } from './event-logger.service';
import {
  ConversationState,
  OrchestrationTurnInput,
  OrchestrationTurnResult,
  ToolExecutionResult,
} from './interfaces/orchestration.types';
import { ToolExecutionContext } from './interfaces/tool-execution-context.interface';
import { resolveExecutionFiller } from './tools/execution-filler';

export interface OrchestrationTurnHooks {
  /**
   * Called once per tool round before tools execute.
   * Should return quickly after *starting* filler playback (do not await full TTS).
   */
  onBeforeToolExecution?: (info: {
    toolNames: string[];
    fillerText: string | null;
  }) => Promise<void>;
}

/**
 * Generic turn pipeline:
 * state → prompt → LLM → (tool loop) → ResponsePlanner → speakable text.
 *
 * Tool-specific behavior lives in AgentTool implementations + ResponsePlanner
 * fallbacks — not in this service.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly llmService: LlmService,
    private readonly conversationState: ConversationStateService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecution: ToolExecutionService,
    private readonly responsePlanner: ResponsePlannerService,
    private readonly guardrailService: GuardrailService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  async handleUserTurn(
    input: OrchestrationTurnInput,
    hooks?: OrchestrationTurnHooks,
  ): Promise<OrchestrationTurnResult> {
    const startedAt = Date.now();
    const fallback =
      this.configService.get<string>('orchestration.fallbackResponse') ??
      "I'm sorry, I had trouble with that. Could you try again?";
    const maxLoops =
      this.configService.get<number>('orchestration.maxToolLoops') ?? 3;

    this.logger.log(
      `[${input.callId}] Turn start: "${input.userUtterance}" agentId=${input.agentId ?? 'none'} enabledTools=${JSON.stringify(input.enabledTools ?? null)}`,
    );

    const state = await this.conversationState.getOrCreate({
      callId: input.callId,
      roomName: input.roomName,
      agentId: input.agentId,
      participantId: input.participantId,
      dynamicVariables: input.dynamicVariables,
      enabledTools: input.enabledTools,
      toolConfigs: input.toolConfigs,
      systemPrompt: input.systemPrompt,
      llmProvider: input.llmProvider,
    });

    state.lastUserUtterance = input.userUtterance;
    state.currentStep = 'thinking';
    await this.conversationState.save(state);

    await this.eventLogger.log(input.callId, 'orchestration_start', {
      roomName: input.roomName,
      participantId: input.participantId,
      data: {
        userUtterance: input.userUtterance,
        enabledTools: input.enabledTools,
        agentId: input.agentId,
      },
    });

    try {
      const { messages, tools } = this.promptBuilder.build(
        state,
        input.userUtterance,
      );

      this.logger.log(
        `[${input.callId}] Prompt built: messages=${messages.length} tools=[${tools.map((t) => t.name).join(', ')}]`,
      );

      await this.eventLogger.log(input.callId, 'prompt_built', {
        roomName: input.roomName,
        data: {
          messageCount: messages.length,
          toolCount: tools.length,
          toolNames: tools.map((t) => t.name),
        },
      });

      // Append user turn to durable message history once.
      state.llmMessages.push({ role: 'user', content: input.userUtterance });
      const userTurnIndex = state.transcriptHistory.filter((e) => e.role === 'user').length + 1;
      state.transcriptHistory.push({
        role: 'user',
        text: input.userUtterance,
        timestamp: Date.now(),
        turnIndex: userTurnIndex,
      });

      let workingMessages = [...messages];
      let toolResults: ToolExecutionResult[] = [];
      let lastText = '';
      let loops = 0;

      // Token usage summed across every LLM call in this turn (the loop may call
      // the LLM multiple times when tools are involved).
      let promptTokens = 0;
      let completionTokens = 0;
      let usageModel: string | undefined;
      let sawUsage = false;

      while (loops < maxLoops) {
        loops += 1;
        this.logger.log(
          `[${input.callId}] LLM loop ${loops}/${maxLoops} starting`,
        );

        let llmResponse = await this.llmService.generateResponse(
          {
            conversationHistory: state.llmMessages,
            userUtterance: input.userUtterance,
            messages: workingMessages,
            tools,
          },
          input.llmProvider ?? state.llmProvider,
        );

        this.logger.log(
          `[${input.callId}] LLM loop ${loops} done: finishReason=${llmResponse.finishReason} textLen=${(llmResponse.text ?? '').length} toolCalls=${JSON.stringify((llmResponse.toolCalls ?? []).map((c) => ({ name: c.name, args: c.arguments })))}`,
        );

        await this.eventLogger.log(input.callId, 'llm_response', {
          roomName: input.roomName,
          data: {
            text: llmResponse.text,
            toolCalls: llmResponse.toolCalls,
            finishReason: llmResponse.finishReason,
            model: llmResponse.model,
          },
        });

        if (llmResponse.usage) {
          promptTokens += llmResponse.usage.promptTokens || 0;
          completionTokens += llmResponse.usage.completionTokens || 0;
          sawUsage = true;
        }
        if (llmResponse.model) usageModel = llmResponse.model;

        lastText = llmResponse.text ?? '';

        if (!llmResponse.toolCalls?.length) {
          this.logger.log(
            `[${input.callId}] No tool calls — proceeding to response planner`,
          );
          break;
        }

        this.logger.log(
          `[${input.callId}] Executing ${llmResponse.toolCalls.length} tool call(s): ${llmResponse.toolCalls.map((c) => c.name).join(', ')}`,
        );

        state.currentStep = 'tool_running';
        await this.conversationState.save(state);

        const toolNames = llmResponse.toolCalls.map((c) => c.name);
        const filler = resolveExecutionFiller(
          toolNames,
          input.toolConfigs ?? state.toolConfigs,
        );

        if (filler) {
          this.logger.log(
            `[${input.callId}] Filler for ${filler.toolName}: "${filler.text}"`,
          );
        } else {
          this.logger.log(
            `[${input.callId}] No execution filler for tools=[${toolNames.join(', ')}]`,
          );
        }

        if (hooks?.onBeforeToolExecution) {
          await hooks.onBeforeToolExecution({
            toolNames,
            fillerText: filler?.text ?? null,
          });
        }

        const assistantToolMessage: LlmMessage = {
          role: 'assistant',
          content: llmResponse.text || '',
          toolCalls: llmResponse.toolCalls,
        };
        state.llmMessages.push(assistantToolMessage);
        workingMessages = [...workingMessages, assistantToolMessage];

        const roundResults = await this.executeToolCalls(
          llmResponse.toolCalls,
          state,
          input,
        );
        toolResults = [...toolResults, ...roundResults];

        for (const result of roundResults) {
          this.logger.log(
            `[${input.callId}] Tool result ${result.toolName}: success=${result.success}${result.error ? ` error=${result.error}` : ''}`,
          );
        }

        for (let i = 0; i < llmResponse.toolCalls.length; i++) {
          const call = llmResponse.toolCalls[i];
          const result = roundResults[i];
          const toolMessage: LlmMessage = {
            role: 'tool',
            name: call.name,
            toolCallId: call.id ?? `call_${i}`,
            content: JSON.stringify(
              result.success
                ? { success: true, output: result.output }
                : { success: false, error: result.error },
            ),
          };
          state.llmMessages.push(toolMessage);
          workingMessages = [...workingMessages, toolMessage];
        }

        state.currentStep = 'thinking';
        await this.conversationState.save(state);
      }

      if (loops >= maxLoops && toolResults.length > 0 && !lastText.trim()) {
        this.logger.warn(
          `[${input.callId}] Max tool loops (${maxLoops}) reached without final text`,
        );
      }

      const planned = this.responsePlanner.plan({
        llmText: lastText,
        toolResults,
        fallbackResponse: fallback,
      });

      const guarded = this.guardrailService.check(planned.speakableText);

      this.logger.log(
        `[${input.callId}] Turn complete in ${Date.now() - startedAt}ms source=${planned.source} speakableLen=${guarded.text.length} tools=${JSON.stringify(toolResults.map((r) => r.toolName))}`,
      );

      await this.eventLogger.log(input.callId, 'response_planned', {
        roomName: input.roomName,
        data: {
          source: planned.source,
          speakableText: guarded.text,
        },
      });

      await this.eventLogger.log(input.callId, 'guardrail_check', {
        roomName: input.roomName,
        data: {
          allowed: guarded.allowed,
          reason: guarded.reason,
        },
      });

      state.llmMessages.push({
        role: 'assistant',
        content: guarded.text,
      });
      const agentTurnIndex = state.transcriptHistory.filter((e) => e.role === 'assistant').length + 1;
      state.transcriptHistory.push({
        role: 'assistant',
        text: guarded.text,
        timestamp: Date.now(),
        turnIndex: agentTurnIndex,
        toolCallNames: toolResults.length > 0 ? toolResults.map((r) => r.toolName) : undefined,
      });
      state.lastAgentResponse = guarded.text;
      state.currentStep = 'speaking';
      await this.conversationState.save(state);

      await this.eventLogger.log(input.callId, 'orchestration_complete', {
        roomName: input.roomName,
        data: {
          toolCallsExecuted: toolResults.map((r) => r.toolName),
        },
        latencyMs: Date.now() - startedAt,
      });

      return {
        speakableText: guarded.text,
        toolCallsExecuted: toolResults.map((r) => r.toolName),
        finishReason: 'stop',
        shouldEndCall: toolResults.some(
          (r) =>
            r.success &&
            r.toolName === 'end_call' &&
            (r.output as { action?: string } | undefined)?.action === 'end_call',
        ),
        llmUsage: sawUsage
          ? { model: usageModel, promptTokens, completionTokens }
          : undefined,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `[${input.callId}] Orchestration failed: ${message}`,
      );
      state.retryCount += 1;
      state.currentStep = 'listening';
      await this.conversationState.save(state);

      await this.eventLogger.log(input.callId, 'orchestration_error', {
        roomName: input.roomName,
        error: message,
        latencyMs: Date.now() - startedAt,
      });

      const guarded = this.guardrailService.check(fallback);
      return {
        speakableText: guarded.text,
        toolCallsExecuted: [],
        finishReason: 'error',
      };
    }
  }

  private async executeToolCalls(
    toolCalls: LlmToolCall[],
    state: ConversationState,
    input: OrchestrationTurnInput,
  ): Promise<ToolExecutionResult[]> {
    const context: ToolExecutionContext = {
      callId: input.callId,
      roomName: input.roomName,
      participantId: input.participantId ?? state.participantId,
      agentId: input.agentId ?? state.agentId,
      dynamicVariables: state.dynamicVariables,
      metadata: {},
      toolConfigs: input.toolConfigs ?? state.toolConfigs,
    };

    const results: ToolExecutionResult[] = [];

    for (const call of toolCalls) {
      const validationError = this.toolRegistry.validateToolCall(
        call.name,
        call.arguments ?? {},
        state.enabledTools,
      );

      if (validationError) {
        this.logger.warn(
          `[${input.callId}] Tool validation failed for ${call.name}: ${validationError}`,
        );
        const failed: ToolExecutionResult = {
          success: false,
          toolName: call.name,
          error: validationError,
        };
        results.push(failed);
        state.toolCallHistory.push({
          name: call.name,
          input: call.arguments,
          error: validationError,
          success: false,
          timestamp: Date.now(),
        });
        continue;
      }

      const result = await this.toolExecution.execute(
        call.name,
        call.arguments ?? {},
        context,
      );
      results.push(result);
      state.toolCallHistory.push({
        name: call.name,
        input: call.arguments,
        output: result.output,
        error: result.error,
        success: result.success,
        timestamp: Date.now(),
      });
    }

    await this.conversationState.save(state);
    return results;
  }

}
