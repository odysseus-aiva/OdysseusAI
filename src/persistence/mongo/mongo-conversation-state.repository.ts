import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConversationState,
  OrchestrationStep,
} from '../../orchestration/interfaces/orchestration.types';
import {
  ConversationStateCreateParams,
  ConversationStateRepository,
} from '../../orchestration/interfaces/conversation-state-repository.interface';
import {
  ConversationDocument,
  ConversationEntity,
} from './schemas/conversation.schema';

@Injectable()
export class MongoConversationStateRepository
  implements ConversationStateRepository
{
  constructor(
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationDocument>,
  ) {}

  async getOrCreate(
    params: ConversationStateCreateParams,
  ): Promise<ConversationState> {
    const existing = await this.conversationModel
      .findOne({ callId: params.callId, archivedAt: { $exists: false } })
      .lean()
      .exec();

    if (existing) {
      const merged = this.mergeParams(existing, params);
      await this.conversationModel
        .updateOne({ callId: params.callId }, { $set: merged })
        .exec();
      return this.toState({ ...existing, ...merged });
    }

    const now = Date.now();
    const doc = {
      callId: params.callId,
      roomName: params.roomName,
      agentId: params.agentId,
      participantId: params.participantId,
      dynamicVariables: { ...(params.dynamicVariables ?? {}) },
      transcriptHistory: [],
      llmMessages: [],
      toolCallHistory: [],
      currentStep: 'listening' as OrchestrationStep,
      retryCount: 0,
      enabledTools: params.enabledTools,
      toolConfigs: params.toolConfigs,
      systemPrompt: params.systemPrompt,
      llmProvider: params.llmProvider,
      startedAt: now,
      updatedAt: now,
    };

    await this.conversationModel.create(doc);
    return this.toState(doc);
  }

  async findByCallId(callId: string): Promise<ConversationState | null> {
    // NB: no `archivedAt` filter here. This is the historical-read path used by
    // the transcript endpoint; a call is archived (archivedAt set) the moment it
    // ends, so filtering archived out would hide every finished call's
    // transcript. `getOrCreate` still excludes archived so a new call never
    // resumes an ended one — that separation is intentional.
    const doc = await this.conversationModel
      .findOne({ callId })
      .lean()
      .exec();
    return doc ? this.toState(doc) : null;
  }

  async save(state: ConversationState): Promise<void> {
    const updatedAt = Date.now();
    await this.conversationModel
      .updateOne(
        { callId: state.callId },
        {
          $set: {
            roomName: state.roomName,
            agentId: state.agentId,
            participantId: state.participantId,
            currentStep: state.currentStep,
            retryCount: state.retryCount,
            dynamicVariables: state.dynamicVariables,
            enabledTools: state.enabledTools,
            toolConfigs: state.toolConfigs,
            systemPrompt: state.systemPrompt,
            llmProvider: state.llmProvider,
            transcriptHistory: state.transcriptHistory,
            llmMessages: state.llmMessages,
            toolCallHistory: state.toolCallHistory,
            lastUserUtterance: state.lastUserUtterance,
            lastAgentResponse: state.lastAgentResponse,
            updatedAt,
          },
        },
      )
      .exec();
  }

  async setStep(callId: string, step: OrchestrationStep): Promise<void> {
    await this.conversationModel
      .updateOne(
        { callId },
        { $set: { currentStep: step, updatedAt: Date.now() } },
      )
      .exec();
  }

  async release(callId: string): Promise<void> {
    await this.conversationModel
      .updateOne(
        { callId },
        {
          $set: {
            currentStep: 'ended',
            archivedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      )
      .exec();
  }

  async releaseOrphans(olderThanMs: number): Promise<number> {
    const result = await this.conversationModel
      .updateMany(
        { archivedAt: { $exists: false }, startedAt: { $lt: olderThanMs } },
        {
          $set: {
            currentStep: 'ended',
            archivedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      )
      .exec();
    return result.modifiedCount;
  }

  async pruneArchivedMessages(archivedBeforeMs: number): Promise<number> {
    const result = await this.conversationModel
      .updateMany(
        { archivedAt: { $lt: archivedBeforeMs }, llmMessages: { $not: { $size: 0 } } },
        { $set: { llmMessages: [], updatedAt: Date.now() } },
      )
      .exec();
    return result.modifiedCount;
  }

  private mergeParams(
    existing: ConversationEntity,
    params: ConversationStateCreateParams,
  ): Partial<ConversationEntity> {
    const patch: Partial<ConversationEntity> = {
      updatedAt: Date.now(),
    };

    if (params.participantId) patch.participantId = params.participantId;
    if (params.agentId) patch.agentId = params.agentId;
    if (params.enabledTools !== undefined) {
      patch.enabledTools = params.enabledTools;
    }
    if (params.toolConfigs !== undefined) {
      patch.toolConfigs = params.toolConfigs;
    }
    if (params.systemPrompt) patch.systemPrompt = params.systemPrompt;
    if (params.llmProvider) patch.llmProvider = params.llmProvider;
    if (params.dynamicVariables) {
      patch.dynamicVariables = {
        ...existing.dynamicVariables,
        ...params.dynamicVariables,
      };
    }

    return patch;
  }

  private toState(doc: {
    callId: string;
    roomName: string;
    agentId?: string;
    participantId?: string;
    dynamicVariables?: Record<string, string>;
    transcriptHistory?: ConversationState['transcriptHistory'];
    llmMessages?: ConversationState['llmMessages'];
    toolCallHistory?: ConversationState['toolCallHistory'];
    lastUserUtterance?: string;
    lastAgentResponse?: string;
    currentStep: string;
    retryCount: number;
    enabledTools?: string[];
    toolConfigs?: Record<string, Record<string, unknown>>;
    systemPrompt?: string;
    llmProvider?: string;
    startedAt: number;
    updatedAt: number;
  }): ConversationState {
    return {
      callId: doc.callId,
      roomName: doc.roomName,
      agentId: doc.agentId,
      participantId: doc.participantId,
      dynamicVariables: doc.dynamicVariables ?? {},
      transcriptHistory: doc.transcriptHistory ?? [],
      llmMessages: doc.llmMessages ?? [],
      toolCallHistory: doc.toolCallHistory ?? [],
      lastUserUtterance: doc.lastUserUtterance,
      lastAgentResponse: doc.lastAgentResponse,
      currentStep: doc.currentStep as OrchestrationStep,
      retryCount: doc.retryCount,
      enabledTools: doc.enabledTools,
      toolConfigs: doc.toolConfigs,
      systemPrompt: doc.systemPrompt,
      llmProvider: doc.llmProvider,
      startedAt: doc.startedAt,
      updatedAt: doc.updatedAt,
    };
  }
}
