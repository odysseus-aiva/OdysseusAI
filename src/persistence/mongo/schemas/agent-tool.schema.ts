import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentToolDocument = HydratedDocument<AgentToolEntity>;

@Schema({
  collection: 'agent_tools',
  timestamps: false,
})
export class AgentToolEntity {
  @Prop({ required: true, index: true })
  agentId!: string;

  @Prop({ required: true })
  toolName!: string;

  @Prop({ required: true, default: false })
  enabled!: boolean;

  @Prop({ type: Object, default: {} })
  config!: Record<string, unknown>;

  @Prop({ required: true })
  createdAt!: number;

  @Prop({ required: true })
  updatedAt!: number;
}

export const AgentToolSchema = SchemaFactory.createForClass(AgentToolEntity);

AgentToolSchema.index({ agentId: 1, toolName: 1 }, { unique: true });
