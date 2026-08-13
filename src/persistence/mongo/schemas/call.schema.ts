import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { AgentSnapshot, CallAnalysis, CallEndedBy, CallStatus } from '../../../common/types/call-log.types';
import type { CallCost } from '../../../common/types/cost.types';

export type CallDocument = HydratedDocument<CallEntity>;

@Schema({
  collection: 'calls',
  timestamps: false,
})
export class CallEntity {
  @Prop({ required: true, unique: true, index: true })
  callId!: string;

  @Prop({ required: true, index: true })
  roomName!: string;

  @Prop()
  participantId?: string;

  @Prop({ index: true })
  agentId?: string;

  /** Snapshot of the agent config at call start. Preserved even if agent is later edited. */
  @Prop({ type: Object })
  agentSnapshot?: AgentSnapshot;

  /** Arbitrary caller-supplied metadata (userId, planTier, etc.) stored at call start. */
  @Prop({ type: Object })
  metadata?: Record<string, string | number | boolean>;

  @Prop({ required: true, type: String, default: 'in_progress', index: true })
  status!: CallStatus;

  @Prop({ type: String })
  endedBy?: CallEndedBy;

  @Prop()
  endedAt?: number;

  @Prop()
  durationMs?: number;

  /** Number of completed agent response turns. */
  @Prop({ default: 0 })
  turnCount!: number;

  @Prop({ type: Object, default: {} })
  latencyMetrics!: Record<string, number | undefined>;

  /** AI-generated post-call analysis (summary + sentiment). */
  @Prop({ type: Object })
  analysis?: CallAnalysis;

  /** Estimated provider cost (LLM + TTS + STT). */
  @Prop({ type: Object })
  cost?: CallCost;

  /** Named callErrors — avoids clash with Mongoose Document.errors */
  @Prop({ type: [String], default: [] })
  callErrors!: string[];

  @Prop({ required: true })
  createdAt!: number;

  @Prop({ required: true })
  updatedAt!: number;
}

export const CallSchema = SchemaFactory.createForClass(CallEntity);
CallSchema.index({ createdAt: -1 });
CallSchema.index({ status: 1, createdAt: -1 });
CallSchema.index({ agentId: 1, createdAt: -1 });
