import { Injectable } from '@nestjs/common';
import {
  ConversationState,
  OrchestrationStep,
} from '../interfaces/orchestration.types';
import {
  ConversationStateCreateParams,
  ConversationStateRepository,
} from '../interfaces/conversation-state-repository.interface';

@Injectable()
export class InMemoryConversationStateRepository
  implements ConversationStateRepository
{
  private readonly states = new Map<string, ConversationState>();

  async getOrCreate(
    params: ConversationStateCreateParams,
  ): Promise<ConversationState> {
    const existing = this.states.get(params.callId);
    if (existing) {
      this.mergeParams(existing, params);
      existing.updatedAt = Date.now();
      return this.clone(existing);
    }

    const now = Date.now();
    const state: ConversationState = {
      callId: params.callId,
      roomName: params.roomName,
      agentId: params.agentId,
      participantId: params.participantId,
      dynamicVariables: { ...(params.dynamicVariables ?? {}) },
      transcriptHistory: [],
      llmMessages: [],
      toolCallHistory: [],
      currentStep: 'listening',
      retryCount: 0,
      enabledTools: params.enabledTools,
      toolConfigs: params.toolConfigs,
      systemPrompt: params.systemPrompt,
      llmProvider: params.llmProvider,
      startedAt: now,
      updatedAt: now,
    };

    this.states.set(params.callId, state);
    return this.clone(state);
  }

  async findByCallId(callId: string): Promise<ConversationState | null> {
    const state = this.states.get(callId);
    return state ? this.clone(state) : null;
  }

  async save(state: ConversationState): Promise<void> {
    state.updatedAt = Date.now();
    this.states.set(state.callId, this.clone(state));
  }

  async setStep(callId: string, step: OrchestrationStep): Promise<void> {
    const state = this.states.get(callId);
    if (!state) return;
    state.currentStep = step;
    state.updatedAt = Date.now();
  }

  async release(callId: string): Promise<void> {
    // Soft-archive rather than delete: mark the conversation ended but retain it
    // so findByCallId can still serve the transcript for a finished call (Call
    // History). Mirrors the MongoDB repo, which sets archivedAt instead of
    // removing the document. Orphan/age cleanup is handled by releaseOrphans.
    const state = this.states.get(callId);
    if (!state) return;
    state.currentStep = 'ended';
    state.updatedAt = Date.now();
  }

  async releaseOrphans(olderThanMs: number): Promise<number> {
    let count = 0;
    for (const [callId, state] of this.states) {
      if (state.startedAt < olderThanMs) {
        this.states.delete(callId);
        count++;
      }
    }
    return count;
  }

  async pruneArchivedMessages(_archivedBeforeMs: number): Promise<number> {
    // Ended conversations are retained in memory but bounded by releaseOrphans
    // (age-based delete), so there is no long-lived message store to prune here.
    return 0;
  }

  private mergeParams(
    state: ConversationState,
    params: ConversationStateCreateParams,
  ): void {
    if (params.participantId) {
      state.participantId = params.participantId;
    }
    if (params.dynamicVariables) {
      state.dynamicVariables = {
        ...state.dynamicVariables,
        ...params.dynamicVariables,
      };
    }
    if (params.enabledTools !== undefined) {
      state.enabledTools = params.enabledTools;
    }
    if (params.toolConfigs !== undefined) {
      state.toolConfigs = params.toolConfigs;
    }
    if (params.systemPrompt) {
      state.systemPrompt = params.systemPrompt;
    }
    if (params.llmProvider) {
      state.llmProvider = params.llmProvider;
    }
    if (params.agentId) {
      state.agentId = params.agentId;
    }
  }

  private clone(state: ConversationState): ConversationState {
    return {
      ...state,
      dynamicVariables: { ...state.dynamicVariables },
      toolConfigs: state.toolConfigs
        ? Object.fromEntries(
            Object.entries(state.toolConfigs).map(([k, v]) => [k, { ...v }]),
          )
        : undefined,
      transcriptHistory: state.transcriptHistory.map((t) => ({ ...t })),
      llmMessages: state.llmMessages.map((m) => ({
        ...m,
        toolCalls: m.toolCalls?.map((tc) => ({
          ...tc,
          arguments: { ...tc.arguments },
        })),
      })),
      toolCallHistory: state.toolCallHistory.map((t) => ({ ...t })),
    };
  }
}
