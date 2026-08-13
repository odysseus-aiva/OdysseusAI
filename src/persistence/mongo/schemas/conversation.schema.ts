import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LlmMessage } from '../../../common/types/llm.types';
import {
  ToolCallHistoryEntry,
  TranscriptEntry,
} from '../../../orchestration/interfaces/orchestration.types';

export type ConversationDocument = HydratedDocument<ConversationEntity>;

@Schema({
  collection: 'conversations',
  timestamps: false,
})
export class ConversationEntity {
  @Prop({ required: true, unique: true, index: true })
  callId!: string;

  @Prop({ required: true, index: true })
  roomName!: string;

  @Prop()
  agentId?: string;

  @Prop()
  participantId?: string;

  @Prop({ required: true, type: String })
  currentStep!: string;

  @Prop({ required: true, default: 0 })
  retryCount!: number;

  @Prop({ type: Object, default: {} })
  dynamicVariables!: Record<string, string>;

  @Prop({ type: [String] })
  enabledTools?: string[];

  @Prop({ type: Object })
  toolConfigs?: Record<string, Record<string, unknown>>;

  @Prop()
  systemPrompt?: string;

  @Prop()
  llmProvider?: string;

  @Prop({ type: Array, default: [] })
  transcriptHistory!: TranscriptEntry[];

  @Prop({ type: Array, default: [] })
  llmMessages!: LlmMessage[];

  @Prop({ type: Array, default: [] })
  toolCallHistory!: ToolCallHistoryEntry[];

  @Prop()
  lastUserUtterance?: string;

  @Prop()
  lastAgentResponse?: string;

  @Prop({ required: true })
  startedAt!: number;

  @Prop({ required: true })
  updatedAt!: number;

  @Prop({ index: true })
  archivedAt?: number;
}

export const ConversationSchema =
  SchemaFactory.createForClass(ConversationEntity);
