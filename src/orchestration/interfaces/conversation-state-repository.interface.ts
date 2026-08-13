import {
  ConversationState,
  OrchestrationStep,
} from './orchestration.types';

export const CONVERSATION_STATE_REPOSITORY = Symbol(
  'CONVERSATION_STATE_REPOSITORY',
);

export interface ConversationStateCreateParams {
  callId: string;
  roomName: string;
  agentId?: string;
  participantId?: string;
  dynamicVariables?: Record<string, string>;
  enabledTools?: string[];
  toolConfigs?: Record<string, Record<string, unknown>>;
  systemPrompt?: string;
  llmProvider?: string;
}

export interface ConversationStateRepository {
  getOrCreate(
    params: ConversationStateCreateParams,
  ): Promise<ConversationState>;
  findByCallId(callId: string): Promise<ConversationState | null>;
  save(state: ConversationState): Promise<void>;
  setStep(callId: string, step: OrchestrationStep): Promise<void>;
  /**
   * End a conversation but retain it for historical transcript reads
   * (findByCallId). MongoDB sets archivedAt; memory marks currentStep 'ended'.
   * Neither removes the record — age-based cleanup is releaseOrphans' job.
   */
  release(callId: string): Promise<void>;
  /**
   * Archive all conversations that have no archivedAt and whose startedAt is
   * older than `olderThanMs` (epoch ms cutoff). Returns the number affected.
   */
  releaseOrphans(olderThanMs: number): Promise<number>;
  /**
   * Null out llmMessages on conversations archived before `archivedBeforeMs`
   * to prevent unbounded storage growth. Returns the number affected.
   */
  pruneArchivedMessages(archivedBeforeMs: number): Promise<number>;
}
