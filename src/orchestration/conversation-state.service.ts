import { Injectable, Inject } from '@nestjs/common';
import {
  ConversationState,
  OrchestrationStep,
} from './interfaces/orchestration.types';
import { CONVERSATION_STATE_REPOSITORY } from './interfaces/conversation-state-repository.interface';
import type {
  ConversationStateCreateParams,
  ConversationStateRepository,
} from './interfaces/conversation-state-repository.interface';

/**
 * Facade over ConversationStateRepository — orchestration code uses this service.
 */
@Injectable()
export class ConversationStateService {
  constructor(
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly repository: ConversationStateRepository,
  ) {}

  async getOrCreate(
    params: ConversationStateCreateParams,
  ): Promise<ConversationState> {
    return this.repository.getOrCreate(params);
  }

  async findByCallId(callId: string): Promise<ConversationState | null> {
    return this.repository.findByCallId(callId);
  }

  async save(state: ConversationState): Promise<void> {
    await this.repository.save(state);
  }

  async setStep(callId: string, step: OrchestrationStep): Promise<void> {
    await this.repository.setStep(callId, step);
  }

  async release(callId: string): Promise<void> {
    await this.repository.release(callId);
  }
}
