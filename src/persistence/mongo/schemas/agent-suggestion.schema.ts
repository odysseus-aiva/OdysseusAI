import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentSuggestionDocument = HydratedDocument<AgentSuggestionEntity>;

export type SuggestionTargetType = 'greeting';
export type SuggestionStatus = 'pending' | 'applied' | 'dismissed';

@Schema({
  collection: 'agent_suggestions',
  timestamps: false,
})
export class AgentSuggestionEntity {
  @Prop({ required: true, unique: true, index: true })
  suggestionId!: string;

  @Prop({ required: true, index: true })
  agentId!: string;

  @Prop({ required: true, index: true })
  callId!: string;

  /** Extensible: 'greeting' now; system_prompt, tool_config, etc. later. */
  @Prop({ required: true })
  targetType!: SuggestionTargetType;

  @Prop({ required: true })
  originalText!: string;

  @Prop({ required: true })
  suggestedText!: string;

  @Prop({ required: true, default: 'pending' })
  status!: SuggestionStatus;

  @Prop({ required: true })
  createdAt!: number;

  @Prop({ required: true })
  updatedAt!: number;
}

export const AgentSuggestionSchema = SchemaFactory.createForClass(AgentSuggestionEntity);
AgentSuggestionSchema.index({ agentId: 1, targetType: 1, status: 1 });
