import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentDocument = HydratedDocument<AgentEntity>;

@Schema({
  collection: 'agents',
  timestamps: false,
})
export class AgentEntity {
  @Prop({ required: true, unique: true, index: true })
  agentId!: string;

  @Prop({ required: true })
  name!: string;

  /** 'pipeline' (default) or 'omni'. Absent on legacy docs → treated as pipeline. */
  @Prop()
  engine?: string;

  @Prop()
  systemPrompt?: string;

  @Prop()
  greeting?: string;

  @Prop({ type: Object })
  defaultProviders?: {
    stt?: string;
    llm?: string;
    tts?: string;
  };

  @Prop()
  voiceId?: string;

  @Prop()
  language?: string;

  @Prop({ required: true })
  createdAt!: number;

  @Prop({ required: true })
  updatedAt!: number;
}

export const AgentSchema = SchemaFactory.createForClass(AgentEntity);
