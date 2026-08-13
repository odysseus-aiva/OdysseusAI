import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CallEventDocument = HydratedDocument<CallEventEntity>;

@Schema({
  collection: 'call_events',
  timestamps: false,
})
export class CallEventEntity {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true, index: true })
  callId!: string;

  @Prop({ required: true })
  roomName!: string;

  @Prop()
  participantId?: string;

  @Prop({ required: true, type: String, index: true })
  step!: string;

  @Prop({ required: true, index: true })
  timestamp!: number;

  @Prop({ type: Object })
  data?: unknown;

  @Prop()
  error?: string;

  @Prop()
  latencyMs?: number;
}

export const CallEventSchema = SchemaFactory.createForClass(CallEventEntity);
CallEventSchema.index({ callId: 1, timestamp: 1 });
CallEventSchema.index({ callId: 1, step: 1 });
// Expire raw events after 90 days. Summary data on `calls` is permanent.
CallEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
